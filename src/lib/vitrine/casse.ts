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
