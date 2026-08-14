import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Publications hebdomadaires, composees a partir des ventes reelles.
 *
 * Ce que ce module ne fait PAS, volontairement : appeler un modele de langage.
 * Les faits viennent de la base, les phrases de gabarits. Une accroche qui
 * vanterait un plat que la boutique ne vend pas serait pire que pas de
 * publication du tout — elle enverrait de vrais clients reclamer un article
 * inexistant. Sur un contenu qui engage la boutique, l'ancrage prime sur la
 * variete.
 *
 * REGLE : rien de ce qui sort d'ici ne doit etre confidentiel. Ces textes sont
 * faits pour etre publies. Le chiffre d'affaires, le panier moyen et le nombre
 * de commandes annulees restent donc dehors — un concurrent lit Facebook aussi.
 */

/**
 * En deca de ce nombre, la quantite vendue ne se publie pas.
 *
 * « 3 fois commandé » sur la page d'un commerce dessert le commerce : on
 * annonce sa faiblesse a ses propres clients. Le chiffre ne parait que
 * lorsqu'il plaide ; sinon le produit est cite seul, ce qui ne ment pas
 * davantage et vend mieux.
 */
export const SEUIL_QUANTITE_PUBLIABLE = 5;

export type Vedette = { nom: string; prix: number | null; quantite: number };

export type ContenuHebdo = {
  slug: string;
  nom: string;
  vedettes: Vedette[];
  note: number | null;
  avis: number;
  /** Vrai si la semaine est trop maigre pour publier quoi que ce soit. */
  vide: boolean;
  legende: string;
  hashtags: string;
  scriptTikTok: string;
  statutWhatsApp: string;
  urlVisuel: string;
};

type LigneActivite = { slug?: string; boutique_nom?: string; note_moyenne?: number; avis?: number };
type LignePlat = { slug?: string; produit?: string; quantite?: number };

function fcfa(n: number | null): string {
  return n === null ? '' : `${Number(n).toLocaleString('fr-FR')} F`;
}

/**
 * Numero de semaine, pour faire tourner les gabarits.
 *
 * Sans rotation, un marchand recevrait la meme phrase chaque lundi et
 * cesserait de la lire des la troisieme fois.
 */
function indexSemaine(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

const ACCROCHES = [
  (nom: string) => `Cette semaine chez ${nom}`,
  (nom: string) => `Ce qui est parti le plus vite chez ${nom}`,
  (nom: string) => `Vos préférés de la semaine chez ${nom}`,
  (nom: string) => `${nom} — le palmarès de la semaine`,
];

const CLOTURES = [
  'Commandez sur WhatsApp, on livre.',
  'Un message, et c’est chez vous.',
  'Livraison dans votre zone, commandez maintenant.',
  'Écrivez-nous, on s’occupe du reste.',
];

/**
 * Compose la publication d'une boutique. `null` si la semaine ne donne rien a
 * raconter : mieux vaut ne rien publier qu'un post creux, qui coute la
 * credibilite du marchand.
 */
function composer(
  activite: LigneActivite,
  plats: LignePlat[],
  prix: Map<string, number>,
  baseUrl: string,
): ContenuHebdo | null {
  const slug = String(activite.slug ?? '').trim();
  const nom = String(activite.boutique_nom ?? '').trim();
  if (!slug || !nom) return null;

  const vedettes: Vedette[] = plats
    .filter((p) => String(p.produit ?? '').trim())
    .slice(0, 3)
    .map((p) => {
      const nomProduit = String(p.produit).trim();
      return {
        nom: nomProduit,
        prix: prix.get(nomProduit.toLowerCase()) ?? null,
        quantite: Number(p.quantite ?? 0),
      };
    });

  if (vedettes.length === 0) return null;

  const note = typeof activite.note_moyenne === 'number' ? activite.note_moyenne : null;
  const avis = Number(activite.avis ?? 0);
  const i = indexSemaine();

  const accroche = ACCROCHES[i % ACCROCHES.length](nom);
  const cloture = CLOTURES[i % CLOTURES.length];

  const listeCourte = vedettes
    .map((v) => (v.prix !== null ? `${v.nom} — ${fcfa(v.prix)}` : v.nom))
    .join('\n• ');

  const satisfaction =
    note !== null && avis >= 3
      ? `\n\n⭐ ${String(note).replace('.', ',')}/5 sur ${avis} avis cette semaine.`
      : '';

  const legende = `${accroche} 👇\n\n• ${listeCourte}${satisfaction}\n\n${cloture}`;

  // Hashtags : locaux d'abord, c'est ce qui touche un client d'Abidjan. Le
  // nom de la boutique est nettoye de tout ce qui n'est pas alphanumerique.
  const tagBoutique = nom.normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  const hashtags = `#Abidjan #CotedIvoire #225 #LivraisonAbidjan #${tagBoutique}`;

  const meilleure = vedettes[0];
  const accrocheTikTok =
    meilleure.quantite >= SEUIL_QUANTITE_PUBLIABLE
      ? `« ${meilleure.nom}, ${meilleure.quantite} fois commandé cette semaine. »`
      : `« ${meilleure.nom}. Vous allez comprendre pourquoi. »`;

  const scriptTikTok =
    `ACCROCHE (0-3 s) : ${accrocheTikTok}\n` +
    `PLAN 1 : le produit en gros plan.\n` +
    `PLAN 2 : la préparation, ou la main qui emballe.\n` +
    `PLAN 3 : la remise au livreur.\n` +
    `TEXTE À L'ÉCRAN : ${meilleure.prix !== null ? fcfa(meilleure.prix) : 'votre prix'} — livré chez vous.\n` +
    `CHUTE : « Commandez sur WhatsApp. »\n\n${hashtags}`;

  const statutWhatsApp = `${accroche} :\n• ${listeCourte}\n\n${cloture}`;

  return {
    slug,
    nom,
    vedettes,
    note,
    avis,
    vide: false,
    legende,
    hashtags,
    scriptTikTok,
    statutWhatsApp,
    urlVisuel: `${baseUrl}/api/contenus/visuel?boutique=${encodeURIComponent(slug)}`,
  };
}

/**
 * Contenus de la semaine, une entree par boutique ayant vendu.
 *
 * Les boutiques sans vente sont absentes : leur envoyer un post vide serait
 * leur rappeler chaque lundi qu'elles n'ont rien vendu.
 */
export async function contenusHebdo(baseUrl: string): Promise<ContenuHebdo[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const [activites, plats] = await Promise.all([
    sb.rpc('rapport_activite', { p_periode: 'semaine' }),
    sb.rpc('rapport_top_plats', { p_periode: 'semaine' }),
  ]);

  const lignesActivite = (activites.data ?? []) as LigneActivite[];
  const lignesPlats = (plats.data ?? []) as LignePlat[];
  if (lignesActivite.length === 0) return [];

  const platsParSlug = new Map<string, LignePlat[]>();
  for (const p of lignesPlats) {
    const s = String(p.slug ?? '').trim();
    if (!s) continue;
    if (!platsParSlug.has(s)) platsParSlug.set(s, []);
    platsParSlug.get(s)!.push(p);
  }

  // Les prix vivent dans `produits`, pas dans le rapport. On les rattache par
  // nom : c'est la seule cle commune, le rapport ne portant pas d'identifiant
  // de produit.
  const { data: boutiques } = await sb.from('boutiques').select('id, slug');
  const idParSlug = new Map<string, string>();
  for (const b of boutiques ?? []) {
    if (b.slug) idParSlug.set(b.slug, b.id);
  }

  const { data: produits } = await sb.from('produits').select('boutique_id, nom, prix');
  const prixParBoutique = new Map<string, Map<string, number>>();
  for (const p of produits ?? []) {
    if (!p.boutique_id || !p.nom || p.prix === null) continue;
    if (!prixParBoutique.has(p.boutique_id)) prixParBoutique.set(p.boutique_id, new Map());
    prixParBoutique.get(p.boutique_id)!.set(String(p.nom).trim().toLowerCase(), Number(p.prix));
  }

  const sorties: ContenuHebdo[] = [];
  for (const a of lignesActivite) {
    const slug = String(a.slug ?? '').trim();
    const boutiqueId = idParSlug.get(slug);
    const prix = (boutiqueId && prixParBoutique.get(boutiqueId)) || new Map<string, number>();
    const contenu = composer(a, platsParSlug.get(slug) ?? [], prix, baseUrl);
    if (contenu) sorties.push(contenu);
  }

  return sorties;
}
