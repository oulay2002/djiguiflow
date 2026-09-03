/**
 * QUELQU'UN A FRAPPE, ET RIEN NE LE DISAIT.
 *
 * ── CE QUE CETTE REGLE A COUTE AVANT D'EXISTER ─────────────────────────────
 *
 * Les 24 et 25 aout 2026, deux personnes ont cree un compte. Aucune n'a jamais
 * eu de boutique : personne ne peut ouvrir la sienne a sa place, c'est
 * l'exploitant qui le fait. L'ecran d'accueil leur demandait de nous ecrire, et
 * — defaut ferme depuis le 2 septembre — ne leur donnait rien a cliquer.
 *
 * Elles sont reparties. **Et rien, nulle part, n'a dit qu'elles etaient
 * venues.** On l'a decouvert dix jours plus tard, dans un entonnoir qu'on
 * lisait a la main. C'est ce silence-la que cette regle ferme : le defaut de
 * l'ecran est repare, mais un marchand qui s'inscrit ce soir doit etre rappele
 * ce soir, pas retrouve dans une mesure la semaine suivante.
 *
 * ── POURQUOI UN DELAI, ET POURQUOI SI COURT ────────────────────────────────
 *
 * La valeur de cette alerte est la VITESSE : a Abidjan, rappeler dans l'heure
 * ou rappeler le lendemain ne sont pas le meme commerce. On n'attend donc que
 * le temps d'ecarter un compte dont la boutique est en train d'etre ouverte a
 * l'instant meme.
 *
 * ── POURQUOI ELLE SE TAIT AU BOUT DE TROIS JOURS ───────────────────────────
 *
 * La reference porte le jour : l'alerte se redit une fois par jour tant que le
 * compte reste sans boutique. C'est voulu — dite une seule fois, elle serait
 * perdue si l'exploitant regardait ailleurs ce quart d'heure-la.
 *
 * Mais une piste de plus de trois jours n'est plus une piste, et la redire
 * chaque matin jusqu'a la fin des temps ferait exactement ce que cette veille
 * se refuse a faire : occuper le canal avec ce qu'on ne traitera pas. Trois
 * jours, c'est trois rappels — apres quoi la personne est traitee ou elle ne le
 * sera pas.
 */

/** Le temps qu'on laisse a une boutique d'etre ouverte avant de s'inquieter. */
export const MINUTES_AVANT_D_ANNONCER_UN_COMPTE = 30;

/** Au-dela, ce n'est plus une piste : c'est de l'histoire. */
export const JOURS_OU_L_ON_REDIT_LE_COMPTE = 3;

/**
 * Faut-il annoncer ce compte ?
 *
 * `aUneBoutique` L'EMPORTE SUR TOUT. Un compte qui a sa boutique n'est plus une
 * piste, quel que soit son age — et c'est ce qui fait taire l'alerte a l'instant
 * ou l'exploitant a fait le travail, sans qu'il ait rien a acquitter.
 */
export function compteAAnnoncer(compte: {
  aUneBoutique: boolean;
  /** Age du compte en minutes. */
  ageMinutes: number;
}): boolean {
  if (compte.aUneBoutique) return false;
  if (!Number.isFinite(compte.ageMinutes)) return false;
  if (compte.ageMinutes < MINUTES_AVANT_D_ANNONCER_UN_COMPTE) return false;
  return compte.ageMinutes <= JOURS_OU_L_ON_REDIT_LE_COMPTE * 24 * 60;
}
