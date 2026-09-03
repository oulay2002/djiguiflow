/**
 * LA PHRASE QU'ON LIT AVANT D'OUVRIR LA BOUTIQUE.
 *
 * ── OU ELLE APPARAIT VRAIMENT ──────────────────────────────────────────────
 *
 * Pas seulement dans Google. QUAND UN MARCHAND COLLE LE LIEN DE SA BOUTIQUE
 * DANS WHATSAPP, l'apercu affiche son titre et cette description — et WhatsApp
 * est le canal de la plateforme. C'est donc la premiere phrase qu'un client lit
 * du commerce, avant meme d'avoir clique.
 *
 * ── LE DEFAUT, MESURE LE 3 SEPTEMBRE 2026 ──────────────────────────────────
 *
 * `boutiques/[id]/layout.tsx` s'ouvrait sur : « Chaque boutique merite son
 * propre titre et sa propre description. » Le titre, oui. La description, non :
 * un GABARIT identique pour toutes, ou le nom de la plateforme prenait la place
 * du commerce.
 *
 * Pendant ce temps `boutiques.description` existait, etait remplie, servait a
 * la carte de l'annuaire et a sa recherche — et `getMarchand` NE LA LISAIT PAS.
 * Exactement le sort du logo, dont le commentaire dit : « il n'etait pas lu, et
 * c'est la que la marque se perdait ».
 */

/**
 * Google coupe autour de 160 caracteres, et l'apercu WhatsApp bien avant. Au
 * dela, la fin de la phrase n'est lue par personne.
 */
export const LONGUEUR_MAX_META = 160;

/** Rempli veut dire : une phrase qu'un client pourrait lire. */
const rempli = (v: unknown) => String(v ?? '').trim() !== '';

/**
 * LE GABARIT, ET POURQUOI IL RESTE.
 *
 * Une valeur par defaut qui masque une donnee manquante est le motif que ce
 * depot poursuit. Ici l'absence est deja signalee ailleurs — `vitrine-muette`
 * la nomme dans la veille des chaines, et le tableau de bord la reclame au
 * marchand. Le gabarit ne cache donc aucun silence : il evite seulement une
 * page sans description, qui serait pire pour tout le monde.
 */
function gabarit(nom: string, secteur: string): string {
  const precision = rempli(secteur) ? ` (${secteur.trim().toLowerCase()})` : '';
  return `Commandez chez ${nom}${precision} a Abidjan et suivez votre livraison`
    + ' en direct avec DjiguiFlow.';
}

export function descriptionBoutique(b: {
  nom: string;
  secteur?: unknown;
  /** Ce que le marchand dit de son commerce. */
  description?: unknown;
}): string {
  const nom = String(b.nom ?? '').trim();
  const secteur = String(b.secteur ?? '');

  if (!rempli(b.description)) return gabarit(nom, secteur);

  // Un retour a la ligne dans une meta-description la coupe : on aplatit.
  const dite = String(b.description).replace(/\s+/g, ' ').trim();
  if (dite.length <= LONGUEUR_MAX_META) return dite;

  // ON COUPE A L'ESPACE, jamais au milieu d'un mot : « Chaussures et vête… » se
  // lit comme une page cassee, pas comme une phrase abregee.
  const tronquee = dite.slice(0, LONGUEUR_MAX_META - 1);
  const dernierEspace = tronquee.lastIndexOf(' ');
  return `${(dernierEspace > 0 ? tronquee.slice(0, dernierEspace) : tronquee).trimEnd()}…`;
}
