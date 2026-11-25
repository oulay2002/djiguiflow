/**
 * « ABIDJAN » DEVIENT « Abidjan », ET RIEN D'AUTRE NE BOUGE.
 *
 * Tant que l'en-tete de la vitrine forcait les capitales, une saisie du
 * marchand en majuscules ne se voyait pas. En casse normale, elle criait a
 * cote du nom de la boutique.
 *
 * On ne touche qu'a une saisie ENTIEREMENT en capitales : « Cocody Riviera 2 »
 * ou « II Plateaux » ecrits par le marchand passent tels quels. On ne reecrit
 * pas ce qu'il a formule lui-meme ; on adoucit seulement ce qu'il a crie.
 */
export function casseDouce(texte: string): string {
  const haut = texte.toLocaleUpperCase('fr-FR');
  const bas = texte.toLocaleLowerCase('fr-FR');
  // Pas tout en capitales, ou aucune lettre du tout : intact.
  if (texte !== haut || texte === bas) return texte;
  return bas.replace(
    /(^|[\s'’-])(\p{L})/gu,
    (_, avant: string, lettre: string) => avant + lettre.toLocaleUpperCase('fr-FR'),
  );
}

/**
 * UN LIBELLE COMMENCE PAR UNE MAJUSCULE.
 *
 * Le secteur « vêtements et accessoire » est saisi ainsi par le marchand ; en
 * capitales forcees, ca ne se voyait pas. En casse normale, un onglet
 * « vêtements et accessoire » a cote de « Restaurant » fait brouillon. On ne
 * touche qu'a la premiere lettre ; une saisie criee passe d'abord par
 * `casseDouce`.
 */
export function libelle(texte: string): string {
  const doux = casseDouce(texte);
  return doux.replace(/^\p{Ll}/u, (l) => l.toLocaleUpperCase('fr-FR'));
}
