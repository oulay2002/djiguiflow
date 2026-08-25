/**
 * Le vocabulaire de `commandes.statut_livraison`, en un seul endroit.
 *
 * CETTE COLONNE N'EST TENUE PAR AUCUNE CONTRAINTE. Elle est remplie par n8n,
 * qui la transmet telle que le livreur ou le workflow l'a produite. La
 * production du 25 aout 2026 en portait donc TROIS ORTHOGRAPHES pour un seul
 * et meme etat :
 *
 *     livre    21 commandes   (ecrit depuis le 17 aout)
 *     livree    4 commandes   (14 au 17 aout)
 *     livree    2 commandes   (avec accent, le 6 aout)
 *
 * Trois lectures comparaient `= 'livre'` a l'egalite stricte. Les six autres
 * lignes leur etaient INVISIBLES — dont la veille qui repere les livraisons
 * dont les frais n'ont jamais ete annonces au client, et le compteur de
 * courses par livreur, qui avait deja affiche des chiffres faux une fois.
 *
 * Rien n'etait casse au moment ou on l'a trouve : l'ecriture avait converge
 * sur `livre`, et la veille ne regarde qu'une fenetre recente. C'est
 * exactement ce qui rend le defaut dangereux — il attend le prochain chemin
 * qui ecrira autrement.
 *
 * DEUX PROTECTIONS, PAS UNE.
 *
 * 1. `canoniserStatutLivraison` a L'ECRITURE, dans l'unique route par
 *    laquelle n8n met une livraison a jour. Corriger dans n8n aurait demande
 *    de recommencer a chaque nouveau chemin ; ici, la porte est unique.
 * 2. `VALEURS_LIVREE` a la LECTURE, pour les requetes qui filtrent en base et
 *    ne peuvent pas appliquer une expression reguliere.
 *
 * La seconde survit a un contournement de la premiere — un import direct, un
 * script, une correction a la main en base.
 *
 * ON NE CANONISE QUE LA FAMILLE « LIVREE », et c'est deliberé. Les autres
 * valeurs — « accepte », « en route », « parti » — sont relues par des
 * workflows n8n que ce depot ne controle pas : les reecrire pourrait casser
 * une comparaison invisible d'ici. La divergence prouvee est celle-la ; on la
 * ferme, sans toucher a ce qu'on ne peut pas verifier.
 */

/** La forme retenue, celle que n8n ecrit depuis le 17 aout 2026. */
export const STATUT_LIVREE = 'livre';

/**
 * Toutes les orthographes rencontrees pour « livree ».
 *
 * Sert aux requetes Supabase, qui filtrent en base et n'ont pas d'expression
 * reguliere : `.in('statut_livraison', VALEURS_LIVREE)`.
 *
 * La liste est un CONSTAT, pas une regle : elle enumere ce que la production
 * contient. Une valeur nouvelle doit y etre ajoutee — et le fait qu'il faille
 * y penser est la raison d'etre de `canoniserStatutLivraison`, qui empeche
 * qu'il en apparaisse.
 */
export const VALEURS_LIVREE = ['livre', 'livree', 'livrée'] as const;

/**
 * Cette commande est-elle livree ?
 *
 * Le test est volontairement large. Une comparaison stricte laisserait la
 * commande ouverte sans que rien ne le signale — derriere un 200 ok.
 */
export function estLivree(statut: unknown): boolean {
  return /^livr/i.test(String(statut ?? '').trim());
}

/**
 * Ramene un statut a sa forme retenue, sans rien inventer.
 *
 * Une valeur vide reste vide : « pas encore de statut » n'est pas « livree »,
 * et les confondre marquerait livree une commande que personne n'a portee.
 *
 * Une valeur hors de la famille « livree » est rendue TELLE QUELLE, seulement
 * debarrassee de ses espaces de bord. On ne la corrige pas : voir l'en-tete.
 */
export function canoniserStatutLivraison(statut: unknown): string {
  const brut = String(statut ?? '').trim();
  if (!brut) return '';
  return estLivree(brut) ? STATUT_LIVREE : brut;
}
