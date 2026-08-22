/**
 * Ce que l'annuaire public dit d'une boutique, et ce qu'il tait.
 *
 * POURQUOI CETTE REGLE VIT ICI. Elle etait ecrite dans `boutiques/page.tsx`,
 * donc rien ne l'eprouvait. Or sa branche la plus importante n'est exercee par
 * AUCUNE donnee de production aujourd'hui : les deux boutiques en ligne ont des
 * avis, et l'avis passe en premier. La ligne de palier n'apparaitra que le jour
 * ou un marchand arrivera avec des livraisons et zero avis — c'est-a-dire tous
 * les nouveaux, au moment ou la plateforme s'ouvre. Le chemin le moins teste
 * etait le chemin de l'arrivant.
 *
 * LE VOCABULAIRE EST LE MEME DES DEUX COTES. `vitrine_boutiques()` rend un
 * palier — 0, 1, 10, 25, 50, 100, 250, 500, 1000 — et cette fonction le met en
 * mots. Les deux vivaient separes et rien ne verifiait qu'ils s'accordent :
 * ajouter un palier en SQL sans toucher a la page aurait affiche « Plus de 5000
 * commandes livrees » sans que personne ne l'ait ecrit. `PALIERS` est donc
 * declare ici et le test le confronte a la liste du SQL.
 */

/**
 * Les paliers que la fonction SQL peut rendre, dans l'ordre.
 *
 * `0` veut dire aucune livraison. `1` veut dire « les premieres » et ne porte
 * jamais de chiffre : « 3 commandes livrees » se lit plus mal que « Nouvelle
 * boutique », et une plateforme qui vit de l'arrivee de marchands ne peut pas
 * publier une mesure qui punit les arrivants. Au-dela, le nombre est le
 * PLANCHER du palier atteint, d'ou le « plus de ».
 */
export const PALIERS = [0, 1, 10, 25, 50, 100, 250, 500, 1000] as const;

/** Le seuil a partir duquel le palier se dit avec son chiffre. */
export const PREMIER_PALIER_CHIFFRE = 10;

export type Confiance = {
  avis: number;
  /** Ce que rend `vitrine_boutiques().palier_livraisons`. */
  palier: number;
};

/**
 * La seule ligne de confiance affichee sous le nom d'une boutique.
 *
 * L'ordre n'est pas arbitraire : un avis est ce que le client cherche en
 * premier, il est publie partout, et il ne dit rien du volume d'affaires. Le
 * palier n'est qu'un repli — utile, mais moins parlant.
 *
 * UN NOMBRE SANS SON UNITE NE VEUT RIEN DIRE ; avec, il se passe d'etoile.
 */
export function ligneConfiance({ avis, palier }: Confiance): string {
  if (avis > 0) return `${avis} avis`;
  if (palier >= PREMIER_PALIER_CHIFFRE) return `Plus de ${palier} commandes livrées`;
  if (palier > 0) return 'Premières commandes livrées';
  return 'Nouvelle boutique';
}
