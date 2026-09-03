/**
 * CE QUI PART VERS TELEGRAM NE DOIT PAS POUVOIR FAIRE TOMBER L'ALERTE.
 *
 * ── L'INCIDENT FONDATEUR ───────────────────────────────────────────────────
 *
 * 10 aout 2026, executions 4135 et 4136. Le noeud Telegram interprete son texte
 * comme du Markdown. Le nom `Commandes_Zahara` a ouvert une italique jamais
 * fermee, et Telegram a repondu :
 *
 *     400 Bad Request: can't parse entities: Can't find end of the entity
 *     starting at byte offset 120
 *
 * L'alerte de la panne du Routeur WhatsApp N'EST JAMAIS PARTIE. Un alerteur qui
 * tombe est pire que pas d'alerteur : on croit etre prevenu.
 *
 * `alerte-erreurs-plateforme` a ete corrige le 12 aout, avec cette consigne :
 * « toute nouvelle alerte partant vers Telegram doit passer par le meme
 * traitement ». Elle n'avait jamais ete appliquee a la VEILLE DES CHAINES, qui
 * est pourtant la seule a injecter des donnees ecrites par des inconnus.
 *
 * ── CE QUE CA COUTERAIT ────────────────────────────────────────────────────
 *
 * `compte-sans-boutique` porte l'ADRESSE E-MAIL de l'inscrit et le texte libre
 * qu'il a saisi. Une adresse avec un `_` — il y en a partout — ferait tomber
 * l'alerte qui existe precisement pour ne pas le rater.
 *
 * Et le dossier serait perdu pour de bon : l'anomalie est ecrite dans
 * `anomalies_signalees` AVANT que n8n compose son message, donc au passage
 * suivant `nouvelles` vaut 0. Plus jamais annoncee.
 */

/**
 * LES CARACTERES QUI CASSENT LE PARSEUR, ET EUX SEULS.
 *
 * Le workflow corrige en efface un jeu bien plus large — points, tirets et
 * parentheses compris. C'etait de la prudence, et elle a un cout qu'on ne
 * mesurait pas alors : elle MUTILE LES ADRESSES. `jean_dupont@gmail.com` y
 * devient `jean dupont@gmail com`, que l'exploitant ne peut plus recopier —
 * sur l'alerte dont le seul but est de rappeler quelqu'un.
 *
 * On ne retire donc que le balisage du Markdown historique, celui-la meme qui
 * a produit l'incident du 10 aout.
 *
 * ⚠ LE CORRECTIF DEFINITIF EST AILLEURS : retirer le `parse_mode` du noeud
 * Telegram supprimerait toute cette classe de defauts d'un coup. Il demande un
 * acces n8n. Tant qu'il n'est pas fait, ceci tient la porte.
 */
const BALISAGE = /[_*`[\]]/g;

/**
 * Telegram refuse au-dela de 4 096 caracteres, et l'alerte EMPILE plusieurs
 * anomalies : une seule qui deborde ferait tomber le message entier, donc
 * toutes les autres avec elle. On borne chaque morceau, largement en dessous.
 */
export const LONGUEUR_MAX_ALERTE = 600;

/**
 * Rend un texte qu'on peut poser dans un message Telegram sans risque.
 *
 * Rend TOUJOURS une chaine : `null` et `undefined` donnent `''`, jamais le mot
 * « undefined » au milieu d'une alerte.
 */
export function assainirPourTelegram(valeur: unknown): string {
  const texte = String(valeur ?? '')
    .replace(BALISAGE, ' ')
    // Le remplacement cree des espaces doubles ; et un texte troue se lit mal.
    .replace(/\s+/g, ' ')
    .trim();

  if (texte.length <= LONGUEUR_MAX_ALERTE) return texte;
  // Le signe de coupe est VISIBLE : une alerte tronquee en silence laisse
  // croire qu'on a tout lu.
  return `${texte.slice(0, LONGUEUR_MAX_ALERTE - 1)}…`;
}
