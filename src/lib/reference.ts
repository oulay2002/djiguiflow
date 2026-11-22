/**
 * La reference d'une commande, quand elle sert a CHERCHER.
 *
 * POURQUOI CE FICHIER EXISTE. `motifExact` etait recopie dans quatre routes —
 * `/api/suivi`, `/api/confirmation`, `/api/confirmation/position` et
 * `/api/internal/commandes/livraison`. Les quatre copies echappaient `\`, `%`
 * et `_`, et les quatre OUBLIAIENT `*`.
 *
 * ── CE QUE CET OUBLI PERMETTAIT ───────────────────────────────────────────
 *
 * PostgREST traite `*` comme un alias du `%` dans un motif `like`/`ilike`, et
 * il fait la substitution AVANT que Postgres ne voie quoi que ce soit. Mesure
 * faite le 26 aout 2026 par le chemin de production exact — client
 * `@supabase/supabase-js`, cle anon, table reelle :
 *
 *     motif « Garba »  ->  1 ligne
 *     motif « % »      ->  0 ligne   (echappe, correct)
 *     motif « _arba »  ->  0 ligne   (echappe, correct)
 *     motif « * »      ->  TOUTE LA TABLE
 *
 * `/api/internal/commandes/livraison` fait un `update ... ilike(reference)`.
 * Une seule requete portant `reference: "*"` basculait donc TOUTES les
 * commandes de TOUS les marchands en « livree ».
 *
 * Et `/api/confirmation/position` cherchait par ce meme motif SANS jeton : un
 * prefixe suffisait a designer une commande vivante sans en connaitre la
 * reference, puis a en ecraser la position GPS.
 *
 * ── DEUX RIDEAUX, ET LE PREMIER EST LE BON ────────────────────────────────
 *
 * `referenceRecevable` decide, `motifExact` protege. On refuse d'abord ce qui
 * n'a pas la forme d'une reference ; l'echappement ne sert qu'a rattraper le
 * jour ou quelqu'un appellera `motifExact` sans avoir valide.
 *
 * ON NE SE CONTENTE PAS D'ECHAPPER. Un caractere ajoute a la syntaxe de
 * PostgREST demain traverserait l'echappement sans que rien ne le dise — c'est
 * exactement ce qui vient d'arriver a `*`. Une liste blanche, elle, ne connait
 * que ce qu'elle autorise, et ne se perime pas.
 */

/**
 * La forme d'une reference : lettres, chiffres et tiret. RIEN D'AUTRE.
 *
 * Elle couvre les trois familles en circulation — `ZAH-1787137637166-2219`
 * (vitrine), `APP-<telephone>-<horodatage>` (assistante) et `ATT-1000000006`
 * (compteur). Aucune n'a jamais porte autre chose.
 *
 * LE TIRET BAS EST EXCLU, ET CE N'EST PAS UN OUBLI. C'est un joker SQL : il
 * designe « un caractere quelconque ». Une reference faite de onze `_`
 * repondrait a toute reference de onze caracteres. `motifExact` l'echappe, mais
 * une liste blanche qui admet un joker s'en remet a un second controle pour
 * etre correcte — et c'est precisement ce raisonnement qui a laisse passer `*`.
 * On n'admet donc que ce qui ne veut rien dire d'autre que soi.
 *
 * La borne de 64 caracteres n'est pas une precaution de style : elle ferme
 * l'envoi d'un motif long et coûteux a evaluer.
 */
const FORME = /^[A-Za-z0-9-]{1,64}$/;

export function referenceRecevable(valeur: unknown): boolean {
  return FORME.test(String(valeur ?? '').trim());
}

/**
 * Neutralise ce qui, dans un motif `like`/`ilike`, n'est pas un caractere.
 *
 * `*` EST DANS LA LISTE, et c'est tout l'objet de ce fichier. Verifie sur la
 * base reelle : un `\*` transmis par le client rend zero ligne la ou `*` seul
 * les rendait toutes.
 *
 * `\` vient EN PREMIER dans la classe : l'echapper apres les autres
 * doublerait les antislashs qu'on vient de poser.
 */
export function motifExact(valeur: string): string {
  return valeur.replace(/[\\%_*]/g, (c) => `\\${c}`);
}

/**
 * La reference d'une commande prise SUR LA VITRINE.
 *
 * ── POURQUOI LA FABRIQUE ET SON DETECTEUR VIVENT ENSEMBLE ──────────────────
 *
 * Une commande de vitrine porte un numero que le visiteur a TAPE : rien ne
 * prouve qu'il est le sien. Or son jeton de suivi lui est rendu dans la
 * reponse. Tant que l'ecran des droits tenait ce jeton pour la preuve « je suis
 * ce numero », il suffisait de commander au numero d'un voisin pour lire la
 * liste de ses commandes chez tous les marchands — puis les faire effacer.
 * Trouve a l'audit du 22 novembre 2026.
 *
 * `preuveClient` doit donc reconnaitre une commande de vitrine, et la base n'a
 * pas de colonne qui le dise (`canal` dit comment JOINDRE le client, pas d'ou
 * vient la commande). C'est la FORME de la reference qui le dit — et une forme
 * dont dependent un droit et une fuite ne peut pas etre ecrite a un endroit et
 * devinee a un autre. Les deux fonctions sont ici, et un test les tient
 * accordees.
 *
 * Le detecteur se trompe du bon cote : une reference qu'il prend a tort pour
 * une commande de vitrine RESTREINT ce que l'ecran montre, jamais l'inverse.
 */
export function referenceDeVitrine(prefixe: string): string {
  return `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

const FORME_VITRINE = /^[A-Za-z0-9]{1,3}-\d{13}-\d{1,4}$/;

export function estReferenceDeVitrine(reference: unknown): boolean {
  return FORME_VITRINE.test(String(reference ?? '').trim());
}
