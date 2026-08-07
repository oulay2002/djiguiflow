import { creerOnglet, readHeaders, appendRow } from '@/lib/googleSheets';
import { invaliderCacheMarchands } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * En-tetes des onglets crees pour un nouveau marchand.
 *
 * Ils doivent rester alignes sur les payloads ecrits par l'app, qui mappent
 * les colonnes PAR NOM (`headers.map(h => payload[h])`) :
 * - commandes : src/app/api/boutiques/[id]/commander/route.ts
 * - menu      : src/app/api/dashboard/produits/route.ts
 * Un nom de colonne qui derive ici produit une colonne vide en production,
 * sans aucune erreur visible.
 */
export const ENTETES_COMMANDES = [
  'chat_id', 'customer_name', 'phone', 'address', 'instructions', 'items',
  'total_price', 'status', 'order_id', 'timestamp', 'nom_livreur',
  'heure_prise_en_charge', 'statut_livraison', 'position_livreur',
  'heure_livraison', 'canal',
];

export const ENTETES_MENU = [
  'id', 'nom', 'categorie', 'prix', 'description', 'disponible', 'image',
];

/** Transforme « ROSE MonDE » en « rosemonde ». */
export function genererSlug(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** « rosemonde » -> « Rosemonde », pour composer un nom d'onglet lisible. */
function capitaliser(slug: string): string {
  const compact = slug.replace(/-/g, '');
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

export function nomsOngletsParDefaut(slug: string) {
  const suffixe = capitaliser(slug);
  return { sheetCommandes: `Commandes_${suffixe}`, sheetMenu: `Menu_${suffixe}` };
}

export type DemandeProvisioning = {
  nom: string;
  email: string;
  slug?: string;
  categorie?: string;
  zone?: string;
  telephone?: string;
  emoji?: string;
  whatsapp?: string;
  groupeLivreurs?: string;
  sheetCommandes?: string;
  sheetMenu?: string;
  /** false pour provisionner sans toucher a Google Sheets (canal App seul). */
  creerOnglets?: boolean;
};

export type ResultatProvisioning = {
  boutiqueId: string;
  slug: string;
  userId: string;
  /** true si le compte marchand vient d'etre cree et invite par email. */
  invite: boolean;
  sheetCommandes: string;
  sheetMenu: string;
  ongletsCrees: string[];
};

export class ErreurProvisioning extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

/** Cherche un compte par email, page par page (l'API admin n'expose pas de get-by-email). */
async function trouverUtilisateurParEmail(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<{ id: string } | null> {
  const cible = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new ErreurProvisioning(`Lecture des comptes impossible : ${error.message}`, 502);
    const trouve = data.users.find(u => u.email?.toLowerCase() === cible);
    if (trouve) return { id: trouve.id };
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Reserve un slug libre : « rosemonde », puis « rosemonde-2 », etc. */
async function slugDisponible(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  souhaite: string,
): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidat = n === 1 ? souhaite : `${souhaite}-${n}`;
    const { data, error } = await sb.from('boutiques').select('id').eq('slug', candidat).maybeSingle();
    if (error) throw new ErreurProvisioning(`Verification du slug impossible : ${error.message}`, 502);
    if (!data) return candidat;
  }
  throw new ErreurProvisioning('Impossible de reserver un slug libre.', 409);
}

/**
 * Provisionne un marchand complet : compte invite, onglets Google Sheets,
 * fiche boutique et reglages de notification.
 *
 * L'ordre n'est pas anodin. Les onglets sont crees AVANT la fiche boutique :
 * une fiche qui pointe vers un onglet inexistant ferait echouer chaque
 * commande en 503. En cas d'echec apres l'insertion de la boutique, celle-ci
 * est supprimee pour ne pas laisser un tenant a moitie provisionne.
 */
export async function provisionnerMarchand(d: DemandeProvisioning): Promise<ResultatProvisioning> {
  const nom = d.nom?.trim();
  const email = d.email?.trim().toLowerCase();
  if (!nom) throw new ErreurProvisioning('Le nom de la boutique est requis.', 400);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ErreurProvisioning('Un email marchand valide est requis.', 400);
  }

  const sb = getSupabaseAdmin();
  if (!sb) throw new ErreurProvisioning('Configuration Supabase absente.', 500);

  const slug = await slugDisponible(sb, d.slug?.trim() || genererSlug(nom));
  if (!slug) throw new ErreurProvisioning('Nom de boutique inexploitable comme slug.', 400);

  const parDefaut = nomsOngletsParDefaut(slug);
  const sheetCommandes = d.sheetCommandes?.trim() || parDefaut.sheetCommandes;
  const sheetMenu = d.sheetMenu?.trim() || parDefaut.sheetMenu;

  // 1. Compte marchand : on reutilise un compte existant, sinon on invite.
  const existant = await trouverUtilisateurParEmail(sb, email);
  let userId = existant?.id ?? '';
  let invite = false;
  if (!userId) {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email);
    if (error || !data?.user) {
      throw new ErreurProvisioning(
        `Invitation du marchand impossible : ${error?.message ?? 'reponse vide'}`,
        502,
      );
    }
    userId = data.user.id;
    invite = true;
  }

  // 2. Onglets Google Sheets, avant toute ecriture en base.
  const ongletsCrees: string[] = [];
  if (d.creerOnglets !== false) {
    try {
      if (await creerOnglet(sheetCommandes, ENTETES_COMMANDES)) ongletsCrees.push(sheetCommandes);
      if (await creerOnglet(sheetMenu, ENTETES_MENU)) ongletsCrees.push(sheetMenu);
    } catch (e) {
      throw new ErreurProvisioning(
        `Creation des onglets impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`,
        502,
      );
    }
  }

  // 3. Fiche boutique.
  const { data: boutique, error: erreurBoutique } = await sb
    .from('boutiques')
    .insert({
      user_id: userId,
      nom,
      slug,
      categorie: d.categorie?.trim() || 'Restaurant',
      zone: d.zone?.trim() || null,
      telephone: d.telephone?.trim() || null,
      emoji: d.emoji?.trim() || '🏪',
      sheet_commandes: sheetCommandes,
      sheet_menu: sheetMenu,
      groupe_livreurs: d.groupeLivreurs?.trim() || null,
    })
    .select('id')
    .single();

  if (erreurBoutique || !boutique) {
    throw new ErreurProvisioning(
      `Creation de la boutique impossible : ${erreurBoutique?.message ?? 'reponse vide'}`,
      502,
    );
  }

  // 4. Reglages de notification. Un echec ici laisserait un marchand sans
  //    alerte : on annule la boutique plutot que de livrer un tenant muet.
  const { error: erreurNotif } = await sb.from('notification_settings').insert({
    boutique_id: boutique.id,
    whatsapp_numero: d.whatsapp?.trim() || d.telephone?.trim() || null,
    telegram_chat_id: d.groupeLivreurs?.trim() || null,
  });

  if (erreurNotif) {
    await sb.from('boutiques').delete().eq('id', boutique.id);
    throw new ErreurProvisioning(
      `Reglages de notification impossibles : ${erreurNotif.message}`,
      502,
    );
  }

    // 5. Registre Marchands (feuille Google) : le selecteur de boutique et le
  //    garde des routes lisent cette feuille. Sans cette ligne, le nouveau
  //    marchand serait invisible au dashboard.
  const ligneRegistre: Record<string, string> = {
    id: slug,
    nom,
    secteur: d.categorie?.trim() || 'Restaurant',
    emoji: d.emoji?.trim() || '🏪',
    sheetCommandes,
    sheetMenu,
    sheetNotes: '',
    groupeLivreurs: d.groupeLivreurs?.trim() || '',
    whatsapp: d.whatsapp?.trim() || d.telephone?.trim() || '',
    boutiqueId: boutique.id,
  };
  try {
    const entetes = await readHeaders('Marchands!A1:Z1', process.env.SHEET_ID!);
    await appendRow(
      'Marchands!A:Z',
      entetes.map(h => ligneRegistre[h] ?? ''),
      process.env.SHEET_ID!,
    );
  } catch (e) {
    // La boutique existe deja en base : on journalise sans casser le flux.
    console.error('Ajout au registre Marchands impossible :', e);
  }

  invaliderCacheMarchands();

  return { boutiqueId: boutique.id, slug, userId, invite, sheetCommandes, sheetMenu, ongletsCrees };
}
