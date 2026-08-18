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

/**
 * Une note ne se publie que si elle PLAIDE.
 *
 * L'ancien filtre ne regardait que le nombre d'avis, et jamais leur valeur : un
 * 2,5/5 partait donc sur la publication promotionnelle du marchand lui-meme,
 * signee de son nom. Aucun commercant n'afficherait cela sur sa devanture.
 *
 * Le nombre compte aussi. « 4,3/5 sur 3 avis » se lit « personne ne vient
 * ici » : le chiffre censé rassurer inquiete. En dessous des deux seuils, la
 * ligne disparait — le produit se defend seul, ce qui ne ment pas et vend
 * mieux. Meme regle que pour les quantites.
 */
export const SEUIL_AVIS_PUBLIABLE = 5;
export const NOTE_MINIMALE_PUBLIABLE = 4;

export type Vedette = {
  nom: string;
  prix: number | null;
  quantite: number;
  /** Photo du catalogue, si le marchand en a mis une. */
  photo: string | null;
};

export type ContenuHebdo = {
  slug: string;
  nom: string;
  vedettes: Vedette[];
  note: number | null;
  avis: number;
  /**
   * La note DEJA MISE EN FORME, ou `null` si elle ne doit pas paraitre.
   *
   * LA DECISION SE PREND ICI, UNE SEULE FOIS. Le visuel refaisait le test de
   * son cote, avec l'ancienne regle : le texte taisait « 3,7/5 sur 3 avis » et
   * l'image l'affichait quand meme, en gros, sur la publication du marchand.
   * Une regle recopiee est une regle qui divergera — c'est deja ce qui avait
   * fait perdre une note client.
   */
  mentionNote: string | null;
  /** Adresse de la vitrine, seule et meme source pour le texte et l'image. */
  lien: string;
  /**
   * La photo a mettre en avant, et le plat qu'elle illustre.
   *
   * PAS FORCEMENT LE PREMIER DU CLASSEMENT. Chez zahara, la meilleure vente
   * n'a pas de photo et le troisieme plat en a une. Exiger la photo du numero
   * un aurait laisse l'image vide dans la plupart des cas ; prendre la
   * premiere disponible remplit le cadre, et le nom ecrit dessus empeche toute
   * confusion sur ce qu'on montre.
   */
  photoVedette: { nom: string; url: string } | null;
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

/**
 * L'appel a l'action, qui porte la zone ET le lien.
 *
 * Il a remplace une liste de clotures — « Commandez sur WhatsApp, on livre »,
 * « Livraison dans votre zone, commandez maintenant » — qui disaient la meme
 * chose SANS donner d'adresse. Les garder toutes les deux produisait un doublon
 * ridicule : « Livraison dans votre zone, commandez maintenant. » suivi de
 * « Livraison a Abidjan — commandez ici ». Deux invitations a la suite se
 * neutralisent ; une seule, qui mene quelque part, agit.
 *
 * La rotation reste, pour la meme raison qu'ailleurs : un marchand qui lit la
 * meme phrase chaque lundi cesse de la lire.
 */
const APPELS = [
  (zone: string) => (zone ? `📍 Livraison à ${zone} — commandez ici :` : '📍 Commandez ici :'),
  (zone: string) => (zone ? `📍 On livre à ${zone}. C’est par ici :` : '📍 C’est par ici :'),
  (zone: string) => (zone ? `📍 ${zone} — commandez en deux minutes :` : '📍 Commandez en deux minutes :'),
];

/**
 * Compose la publication d'une boutique. `null` si la semaine ne donne rien a
 * raconter : mieux vaut ne rien publier qu'un post creux, qui coute la
 * credibilite du marchand.
 */
/**
 * « ABIDJAN » saisi par le marchand devient « Abidjan ».
 *
 * Une zone en capitales dans une phrase donne l'air d'un message automatique,
 * et c'est exactement ce qu'on essaie de ne pas avoir l'air d'etre.
 */
function joliZone(brut: unknown): string {
  const z = String(brut ?? '').trim();
  if (!z) return '';
  return z
    .toLocaleLowerCase('fr-FR')
    .split(/(\s|-)/)
    .map((m) => (/^[\s-]$/.test(m) ? m : m.charAt(0).toLocaleUpperCase('fr-FR') + m.slice(1)))
    .join('');
}

function composer(
  activite: LigneActivite,
  plats: LignePlat[],
  catalogue: Map<string, { prix: number | null; photo: string | null }>,
  baseUrl: string,
  zone: string,
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
        prix: catalogue.get(nomProduit.toLowerCase())?.prix ?? null,
        photo: catalogue.get(nomProduit.toLowerCase())?.photo ?? null,
        quantite: Number(p.quantite ?? 0),
      };
    });

  if (vedettes.length === 0) return null;

  const note = typeof activite.note_moyenne === 'number' ? activite.note_moyenne : null;
  const avis = Number(activite.avis ?? 0);
  const i = indexSemaine();

  const accroche = ACCROCHES[i % ACCROCHES.length](nom);
  const appelDeLaSemaine = APPELS[i % APPELS.length];

  const listeCourte = vedettes
    .map((v) => (v.prix !== null ? `${v.nom} — ${fcfa(v.prix)}` : v.nom))
    .join('\n• ');

  const mentionNote =
    note !== null && avis >= SEUIL_AVIS_PUBLIABLE && note >= NOTE_MINIMALE_PUBLIABLE
      ? `${String(note).replace('.', ',')}/5 · ${avis} avis`
      : null;

  const satisfaction = mentionNote ? `\n\n⭐ ${mentionNote} cette semaine.` : '';

  /**
   * LA LIGNE QUI MANQUAIT, ET C'ETAIT LA PLUS IMPORTANTE.
   *
   * La publication disait « commandez maintenant » sans dire OU. Un lecteur
   * conquis devait chercher la boutique lui-meme, sur une plateforme qu'il ne
   * connait pas. Une publication sans lien ne convertit rien : tout le travail
   * de la semaine — les ventes reelles, les prix justes, la mise en page —
   * s'arretait a un pas de la commande.
   *
   * La zone y figure aussi, parce que « livraison dans votre zone » ne dit pas
   * au lecteur s'il est couvert, et que c'est la premiere question qu'il se
   * pose.
   */
  // La premiere vedette QUI A une photo, pas forcement la premiere tout court.
  const avecPhoto = vedettes.find((v) => v.photo);
  const photoVedette = avecPhoto ? { nom: avecPhoto.nom, url: avecPhoto.photo! } : null;

  const lien = `${baseUrl}/boutiques/${encodeURIComponent(slug)}`;
  const appel = `${appelDeLaSemaine(zone)}\n${lien}`;

  const legende = `${accroche} 👇\n\n• ${listeCourte}${satisfaction}\n\n${appel}`;

  // Hashtags : locaux d'abord, c'est ce qui touche un client livrable. Le nom
  // de la boutique est nettoye de tout ce qui n'est pas alphanumerique. La zone
  // vient en tete quand elle est connue — et on la dedoublonne, une boutique
  // dont la zone est deja « Abidjan » n'a pas besoin du tag deux fois.
  const tagBoutique = nom.normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  const tagZone = zone.normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  const tags = ['Abidjan', 'CotedIvoire', '225', 'LivraisonAbidjan', tagBoutique];
  if (tagZone) tags.unshift(tagZone);
  const hashtags = [...new Set(tags.filter(Boolean))].map((t) => `#${t}`).join(' ');

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
    // TikTok ne rend pas les liens cliquables dans une legende : la convention
    // y est de renvoyer vers la bio. On donne donc l'adresse a coller, plutot
    // qu'un lien mort dans le texte.
    `CHUTE : « Commandez sur WhatsApp — lien en bio. »\n`
    + `LIEN À METTRE EN BIO : ${lien}\n\n${hashtags}`;

  const statutWhatsApp = `${accroche} :\n• ${listeCourte}\n\n${appel}`;

  return {
    slug,
    nom,
    vedettes,
    note,
    avis,
    mentionNote,
    lien,
    photoVedette,
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
  // `zone` voyage avec : elle nomme la livraison dans l'appel a l'action et
  // fournit le hashtag le plus cible. Aucune requete de plus — elle tient dans
  // celle-ci.
  const { data: boutiques } = await sb.from('boutiques').select('id, slug, zone');
  const idParSlug = new Map<string, string>();
  const zoneParSlug = new Map<string, string>();
  for (const b of boutiques ?? []) {
    if (!b.slug) continue;
    idParSlug.set(b.slug, b.id);
    zoneParSlug.set(b.slug, joliZone(b.zone));
  }

  const { data: produits } = await sb
    .from('produits')
    .select('boutique_id, nom, prix, photo_url');
  const catalogueParBoutique = new Map<
    string,
    Map<string, { prix: number | null; photo: string | null }>
  >();
  for (const p of produits ?? []) {
    // Le prix peut manquer sans que la photo manque : on n'ecarte plus la
    // ligne pour un prix absent, sinon un plat photographie mais non tarife
    // perdrait aussi son image.
    if (!p.boutique_id || !p.nom) continue;
    if (!catalogueParBoutique.has(p.boutique_id)) {
      catalogueParBoutique.set(p.boutique_id, new Map());
    }
    catalogueParBoutique.get(p.boutique_id)!.set(String(p.nom).trim().toLowerCase(), {
      prix: p.prix === null ? null : Number(p.prix),
      photo: String(p.photo_url ?? '').trim() || null,
    });
  }

  const sorties: ContenuHebdo[] = [];
  for (const a of lignesActivite) {
    const slug = String(a.slug ?? '').trim();
    const boutiqueId = idParSlug.get(slug);
    const catalogue =
      (boutiqueId && catalogueParBoutique.get(boutiqueId))
      || new Map<string, { prix: number | null; photo: string | null }>();
    const contenu = composer(
      a,
      platsParSlug.get(slug) ?? [],
      catalogue,
      baseUrl,
      zoneParSlug.get(slug) ?? '',
    );
    if (contenu) sorties.push(contenu);
  }

  return sorties;
}
