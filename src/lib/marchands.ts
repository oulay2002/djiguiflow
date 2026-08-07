import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type Marchand = {
  /** Slug lisible utilise dans les URL et les webhooks (ex. "zahara"). */
  id: string;
  /** Identifiant technique en base, necessaire pour toute ecriture. */
  boutiqueId: string;
  nom: string;
  secteur: string;
  emoji: string;
  /** Config Google Sheets, conservee tant que la feuille reste la verite. */
  sheetId: string;
  sheetCommandes: string;
  sheetMenu: string;
  sheetNotes: string;
  groupeLivreurs: string;
  whatsapp: string;
};

// Marchand servi quand aucun boutique_id n'est precise (dashboard mono-boutique).
export const MARCHAND_DEFAUT = process.env.MARCHAND_DEFAUT || 'zahara';

// Noms de feuilles par defaut : le registre vit desormais dans Supabase, mais
// n8n ecrit encore dans Google Sheets pendant la periode de double ecriture.
const FEUILLES_PAR_DEFAUT = {
  sheetCommandes: 'Commandes_Zahara',
  sheetMenu: 'Menu',
  sheetNotes: 'Notes',
};

const REPLI_HISTORIQUE: Marchand = {
  id: MARCHAND_DEFAUT,
  boutiqueId: '11111111-1111-1111-1111-111111111111',
  nom: 'Zahara',
  secteur: 'Restaurant',
  emoji: '🏪',
  sheetId: process.env.SHEET_ID!,
  ...FEUILLES_PAR_DEFAUT,
  groupeLivreurs: '',
  whatsapp: '',
};

let cache: Record<string, Marchand> | null = null;
let cacheTime = 0;
const TTL = 30_000;

/**
 * Vide le cache du registre.
 *
 * A appeler apres avoir provisionne un marchand : sans cela, le nouveau
 * marchand resterait invisible jusqu'a 30 s, et le dashboard repondrait 404
 * sur sa toute premiere requete.
 */
export function invaliderCacheMarchands(): void {
  cache = null;
  cacheTime = 0;
}

type LigneBoutique = {
  id: string;
  slug: string | null;
  nom: string | null;
  categorie: string | null;
  emoji: string | null;
  telephone: string | null;
  sheet_commandes: string | null;
  sheet_menu: string | null;
  groupe_livreurs: string | null;
  // La contrainte d'unicité sur notification_settings.boutique_id rend la
  // relation un-à-un : PostgREST renvoie alors un OBJET, pas un tableau.
  // Les deux formes sont acceptées pour ne pas dépendre de ce détail.
  notification_settings: Notif | Notif[] | null;
};

type Notif = { whatsapp_numero: string | null; telegram_chat_id: string | null };

function premierNotif(v: Notif | Notif[] | null | undefined): Notif | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function chargerMarchands(): Promise<Record<string, Marchand>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('Registre marchands : configuration Supabase absente');
    return {};
  }

  try {
    const { data, error } = await sb
      .from('boutiques')
      .select(
        'id, slug, nom, categorie, emoji, telephone, sheet_commandes, sheet_menu, groupe_livreurs,' +
        ' notification_settings(whatsapp_numero, telegram_chat_id)',
      )
      .not('slug', 'is', null);

    if (error) throw error;

    const dict: Record<string, Marchand> = {};
    for (const b of (data ?? []) as unknown as LigneBoutique[]) {
      if (!b.slug) continue;
      const notif = premierNotif(b.notification_settings);
      dict[b.slug] = {
        id: b.slug,
        boutiqueId: b.id,
        nom: b.nom ?? '',
        secteur: b.categorie ?? '',
        emoji: b.emoji ?? '🏪',
        sheetId: process.env.SHEET_ID!,
        // La config par marchand prime ; le repli garde le comportement des
        // boutiques provisionnees avant l'arrivee de ces colonnes.
        sheetCommandes: b.sheet_commandes || FEUILLES_PAR_DEFAUT.sheetCommandes,
        sheetMenu: b.sheet_menu || FEUILLES_PAR_DEFAUT.sheetMenu,
        sheetNotes: FEUILLES_PAR_DEFAUT.sheetNotes,
        groupeLivreurs: b.groupe_livreurs || notif?.telegram_chat_id || '',
        whatsapp: notif?.whatsapp_numero ?? b.telephone ?? '',
      };
    }

    cache = dict;
    cacheTime = now;
    return dict;
  } catch (e) {
    console.error('Registre marchands : lecture Supabase impossible :', e);
    return {};
  }
}

export async function getMarchand(id: string): Promise<Marchand | null> {
  const dict = await chargerMarchands();
  return dict[id] || null;
}

export type MarchandPublic = Pick<Marchand, 'id' | 'nom' | 'secteur' | 'emoji'>;

export async function listerMarchands(): Promise<MarchandPublic[]> {
  const dict = await chargerMarchands();
  return Object.values(dict)
    .map(({ id, nom, secteur, emoji }) => ({ id, nom, secteur, emoji }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Resout le marchand cible par une route.
 *
 * - `boutique_id` fourni et inconnu -> null (la route repond 404). On ne
 *   retombe JAMAIS sur le marchand par defaut : ce serait servir les donnees
 *   d'un autre tenant.
 * - `boutique_id` absent -> marchand par defaut, avec repli si le registre
 *   n'est pas joignable.
 */
export async function resoudreMarchand(boutiqueId?: string | null): Promise<Marchand | null> {
  const cle = (boutiqueId || '').trim();
  if (cle) return getMarchand(cle);

  const parDefaut = await getMarchand(MARCHAND_DEFAUT);
  return parDefaut ?? REPLI_HISTORIQUE;
}

// NOTE : ne jamais importer ce module depuis un composant client.
// Il depend de supabaseAdmin, qui porte la cle service_role.
