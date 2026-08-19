/**
 * Reconnaitre une demande d'arret, et rien d'autre.
 *
 * AUCUN IMPORT ICI, ET C'EST VOULU — meme raison que `horaires.ts`. La regle
 * sert au serveur et au banc d'essai, et une regle recopiee finit par diverger.
 * On l'a paye deux fois : sur la note client, puis sur le visuel hebdomadaire.
 *
 * LES DEUX ERREURS N'ONT PAS LE MEME PRIX, et c'est ce qui dicte le reglage.
 *
 *   Rater un « stop » — on continue d'ecrire a quelqu'un qui a demande l'arret.
 *   Il bloque, il signale, et le signalement fait bannir la session : le
 *   marchand perd son canal principal, pas seulement sa campagne.
 *
 *   Voir un « stop » ou il n'y en a pas — on cesse de relancer un client qui ne
 *   demandait rien. Il peut toujours commander, il recoit toujours ses
 *   confirmations. On perd une relance.
 *
 * La seconde erreur est cent fois moins chere. On penche donc du cote large…
 * MAIS PAS AU POINT D'AVALER UNE COMMANDE. Si cette fonction dit oui sur
 * « bonjour, stoppez le piment sur mon attieke », le routeur n'appelle pas
 * l'assistante et la commande est perdue en silence. D'ou la regle de longueur :
 * une demande d'arret est BREVE. Personne n'ecrit un paragraphe pour dire stop.
 */

/** Au-dela, c'est une phrase qui parle d'autre chose, pas une demande d'arret. */
const LONGUEUR_MAXIMALE = 45;

/**
 * Les formes attendues. On accepte le mot anglais parce que « STOP » est la
 * convention que tout le monde connait, et les tournures francaises parce que
 * personne ici n'a l'obligation de connaitre la convention.
 */
const FORMES = [
  /\bstop\b/,
  /\bstopper\b/,
  /\bdesabonn/,       // desabonne, desabonner, desabonnement
  /\bdesinscri/,      // desinscris, desinscription
  /\bunsubscribe\b/,
  /\bne m ?ecriv/,    // « ne m'ecrivez plus »
  /\bne plus (me )?(ecrire|recevoir|envoyer)/,
  /\bplus de (message|pub|publicite)/,
  // « arretez » seul est une demande d'arret ; « arretez le piment » n'en est
  // pas une. D'ou la forme exacte d'un cote, et le complement explicite de
  // l'autre — sans quoi on intercepterait une commande.
  /^arretez?$/,
  /\barretez? de m (ecrire|envoyer|contacter|deranger|solliciter)/,
  /\blaissez[- ]moi tranquille\b/,
];

/** Enleve accents, ponctuation et casse : « Désabonnez-moi ! » → « desabonnez moi ». */
export function aplatir(texte: unknown): string {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Ce message demande-t-il l'arret des relances ?
 *
 * Volontairement severe sur la longueur : mieux vaut laisser passer une demande
 * d'arret noyee dans un long message — le client la repetera, plus court —
 * qu'intercepter une commande et ne jamais y repondre.
 */
export function estDemandeStop(texte: unknown): boolean {
  const plat = aplatir(texte);
  if (!plat) return false;
  if (plat.length > LONGUEUR_MAXIMALE) return false;
  return FORMES.some((f) => f.test(plat));
}
