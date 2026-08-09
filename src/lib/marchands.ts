import { readSheet } from '@/lib/googleSheets';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type Marchand = {
  id: string;
  boutiqueId: string; // uuid Supabase de la boutique
  nom: string;
  secteur: string;
  emoji: string;
  sheetId: string;
  sheetCommandes: string;
  sheetMenu: string;
  groupeLivreurs: string;
  whatsapp: string;
};

/**
 * Registre des marchands, assemble a partir de deux sources.
 *
 * Supabase est la base : c'est la seule qui connaisse toutes les boutiques et
 * qui porte leur uuid. Le registre Google Sheets est pose par-dessus, car il
 * renseigne encore des champs que Supabase laisse vides (le groupe de
 * livreurs) et surtout des identifiants historiques que n8n et les liens deja
 * partages utilisent — `boulangeriedor` cote feuille contre
 * `boulangerie-d-or` cote base. Les deux repondent.
 *
 * L'assemblage a deux effets immediats : une boutique presente seulement dans
 * Supabase devient joignable, et une panne de Google Sheets ne rend plus
 * l'ensemble des boutiques introuvables.
 */

const SHEET_ID = process.env.SHEET_ID!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cache: Record<string, Marchand> | null = null;
let cacheTime = 0;
const TTL = 30_000; // 30 secondes

/** Toutes les cles sous lesquelles un marchand doit repondre. */
function clesDe(m: Marchand): string[] {
  return [m.id, m.nom.toLowerCase().replace(/\s+/g, '')]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
}

async function depuisSupabase(): Promise<Marchand[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const { data, error } = await sb
    .from('boutiques')
    .select('id, slug, nom, categorie, emoji, sheet_commandes, sheet_menu, groupe_livreurs, telephone');

  if (error) {
    console.error('Marchands — lecture Supabase impossible :', error);
    return [];
  }

  return (data ?? [])
    .filter((b) => String(b.slug ?? '').trim())
    .map((b) => ({
      id: String(b.slug),
      boutiqueId: String(b.id),
      nom: String(b.nom ?? ''),
      secteur: String(b.categorie ?? ''),
      emoji: String(b.emoji || '🏪'),
      sheetId: SHEET_ID,
      sheetCommandes: String(b.sheet_commandes || 'Commandes'),
      sheetMenu: String(b.sheet_menu || 'Menu'),
      groupeLivreurs: String(b.groupe_livreurs || ''),
      whatsapp: String(b.telephone || ''),
    }));
}

/** Lignes du registre Sheets, champs vides ecartes pour ne rien ecraser. */
async function depuisFeuille(): Promise<Partial<Marchand>[]> {
  try {
    const rows = await readSheet('Marchands!A:Z', SHEET_ID);
    return rows
      .filter((r) => r.id)
      .map((r) => {
        const brut: Partial<Marchand> = {
          id: r.id,
          boutiqueId: r.boutiqueId,
          nom: r.nom,
          secteur: r.secteur,
          emoji: r.emoji,
          sheetCommandes: r.sheetCommandes,
          sheetMenu: r.sheetMenu,
          groupeLivreurs: r.groupeLivreurs,
          whatsapp: r.whatsapp,
        };
        for (const cle of Object.keys(brut) as (keyof Marchand)[]) {
          if (!String(brut[cle] ?? '').trim()) delete brut[cle];
        }
        return brut;
      });
  } catch (e) {
    console.error('Marchands — lecture feuille impossible :', e);
    return [];
  }
}

async function chargerMarchands(): Promise<Record<string, Marchand>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  const [base, surcouche] = await Promise.all([depuisSupabase(), depuisFeuille()]);

  const entrees: { m: Marchand; cles: Set<string> }[] = base.map((m) => ({
    m,
    cles: new Set(clesDe(m)),
  }));

  for (const ligne of surcouche) {
    const cible = entrees.find(
      (e) =>
        (ligne.boutiqueId && e.m.boutiqueId === ligne.boutiqueId) ||
        (ligne.id ? e.cles.has(ligne.id) : false),
    );

    if (!cible) {
      // Marchand connu de la feuille seule : Supabase est indisponible, ou la
      // boutique n'y a pas encore ete creee.
      const m: Marchand = {
        id: String(ligne.id),
        boutiqueId: String(ligne.boutiqueId || ligne.id),
        nom: ligne.nom ?? '',
        secteur: ligne.secteur ?? '',
        emoji: ligne.emoji ?? '🏪',
        sheetId: SHEET_ID,
        sheetCommandes: ligne.sheetCommandes ?? 'Commandes',
        sheetMenu: ligne.sheetMenu ?? 'Menu',
        groupeLivreurs: ligne.groupeLivreurs ?? '',
        whatsapp: ligne.whatsapp ?? '',
      };
      entrees.push({ m, cles: new Set(clesDe(m)) });
      continue;
    }

    const fusion: Marchand = { ...cible.m, ...ligne, sheetId: SHEET_ID };

    // L'uuid prime toujours sur ce que porte la feuille : sa colonne
    // boutiqueId contient parfois un slug, et `commandes.boutique_id` est une
    // cle etrangere qui n'accepte qu'un uuid.
    if (UUID.test(cible.m.boutiqueId) && !UUID.test(fusion.boutiqueId)) {
      fusion.boutiqueId = cible.m.boutiqueId;
    }

    cible.m = fusion;
    for (const c of clesDe(fusion)) cible.cles.add(c);
  }

  // Les deux sources muettes : on garde le dernier etat connu plutot que de
  // rendre toutes les boutiques introuvables.
  if (!entrees.length) return cache ?? {};

  const dict: Record<string, Marchand> = {};
  for (const e of entrees) {
    for (const cle of e.cles) dict[cle] = e.m;
  }

  cache = dict;
  cacheTime = now;
  return dict;
}

export async function getMarchand(id: string | null | undefined): Promise<Marchand | null> {
  if (!id) return null;
  const dict = await chargerMarchands();
  return dict[String(id).trim()] || null;
}

export async function resoudreMarchand(id: string | null | undefined): Promise<Marchand | null> {
  return getMarchand(id);
}

export async function listerMarchands(): Promise<Marchand[]> {
  const dict = await chargerMarchands();
  // Deduplication par identite d'objet : un meme marchand repond sous
  // plusieurs cles (id historique, slug Supabase, nom).
  const vus = new Set<Marchand>();
  const liste: Marchand[] = [];
  for (const m of Object.values(dict)) {
    if (vus.has(m)) continue;
    vus.add(m);
    liste.push(m);
  }
  return liste;
}

export function invaliderCacheMarchands(): void {
  cache = null;
  cacheTime = 0;
}

// Compatibilite retro (acces synchrone si cache deja charge)
export const MARCHANDS = new Proxy({} as Record<string, Marchand>, {
  get: (_t, key: string) => {
    if (!cache) return undefined;
    return cache[key];
  },
});
