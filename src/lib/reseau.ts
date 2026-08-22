/**
 * Les delais d'attente des appels sortants.
 *
 * POURQUOI CE FICHIER EXISTE. Le 22 aout 2026, **22 appels serveur vers un
 * tiers** partaient sans aucun delai. `fetch` n'en impose pas : undici attend
 * les entetes jusqu'a cinq minutes, et aucun `maxDuration` n'est declare, donc
 * la plateforme laisse la fonction ouverte tout ce temps.
 *
 * UN FOURNISSEUR QUI PEND COUTE PLUS CHER QU'UN FOURNISSEUR QUI TOMBE. Tombe,
 * il rend une erreur en quelques millisecondes et le code sait quoi faire. Qui
 * pend, il retient l'appelant — et sur `canaux.ts`, la sortie unique, il retient
 * TOUS les appelants a la fois : la route que n8n interroge, les changements de
 * statut, les relances. n8n reessaie par-dessus, et la file s'allonge.
 *
 * LES VALEURS NE SONT PAS DES DEVINETTES. Une API de messagerie qui va bien
 * repond en moins de deux secondes ; lui en accorder quinze couvre un mauvais
 * jour sans jamais couvrir une panne. Mieux vaut echouer vite et laisser le
 * filet jouer — la veille des chaines repasse toutes les quinze minutes, le
 * rattrapage des paiements aussi — que tenir une fonction ouverte en esperant.
 */

/** Messagerie : WhatsApp, Telegram. Elles repondent en moins de deux secondes. */
export const DELAI_MESSAGE = 15_000;

/**
 * Webhooks n8n. Ils repondent immediatement (« Workflow got started ») : le
 * travail se fait apres. Dix secondes sont deja tres genereuses.
 */
export const DELAI_WEBHOOK = 10_000;

/** L'assistante. Un modele met parfois du temps, mais pas une minute. */
export const DELAI_MODELE = 30_000;

/** Google Sheets et verification de paiement : plus lents, et moins urgents. */
export const DELAI_LENT = 20_000;

/**
 * Le signal a passer a `fetch`.
 *
 * Passer par une fonction plutot que par `AbortSignal.timeout` a chaque appel
 * n'est pas cosmetique : c'est ce qui rend le balayage de couverture possible.
 * `tests/unit/couverture-des-delais.test.ts` refuse tout appel sortant sans
 * delai, et un motif unique se cherche.
 */
export function delai(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}
