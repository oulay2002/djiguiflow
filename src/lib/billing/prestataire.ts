import { cinetpayConfigure } from '@/lib/billing/cinetpay';
import { geniuspayConfigure } from '@/lib/billing/geniuspay';

/**
 * Quel prestataire encaisse sur ce deploiement.
 *
 * Un selecteur plutot qu'un remplacement en dur, pour trois raisons.
 *
 * 1. CinetPay n'est pas mauvais, il est INJOIGNABLE : `api-checkout
 *    .cinetpay.com` repond NXDOMAIN depuis Cloudflare, qui fait autorite sur la
 *    zone. Le jour ou ce sous-domaine revient, `cinetpay.ts` refonctionne sans
 *    qu'on ait rien a reecrire.
 * 2. On revient a l'autre en retirant deux variables d'environnement, sans
 *    redeploiement de code — ce qui compte quand l'argent des marchands est en
 *    jeu et qu'un prestataire jeune peut tomber.
 * 3. Le tunnel d'achat n'a plus a savoir a qui il parle.
 *
 * GeniusPay l'emporte quand il est configure : c'est le seul des deux dont la
 * verification fonctionne, et la verification est la seule chose qui ouvre des
 * droits.
 */
/**
 * La liste est une valeur, pas seulement un type, et c'est delibere.
 *
 * `mode.ts` doit connaitre tous les prestataires pour reconnaitre
 * `BILLING_MODE=<nom>` comme un mode REEL. Quand la liste n'existait qu'en type,
 * l'oubli etait invisible : `cinetpay` y a manque une premiere fois, puis
 * `geniuspay` a l'ajout du second prestataire. Les deux fois, le symptome etait
 * le meme — la variable annonce un prestataire, le code simule. Une seule liste
 * partagee rend l'oubli impossible plutot que rare.
 *
 * Elle vit dans `prestataires-connus.ts`, un fichier SANS AUCUN IMPORT, et non
 * ici : `mode.ts` tourne dans le navigateur, et la lire d'ici y entrainait
 * `cinetpay.ts` avec son `node:dns/promises`. Le build cassait ; le typecheck ne
 * voyait rien. On la re-exporte pour que les appelants n'aient pas a connaitre
 * ce detail d'empaquetage.
 */
export { PRESTATAIRES } from '@/lib/billing/prestataires-connus';
export type { Prestataire } from '@/lib/billing/prestataires-connus';

import type { Prestataire } from '@/lib/billing/prestataires-connus';

export function prestataireActif(): Prestataire | null {
  if (geniuspayConfigure()) return 'geniuspay';
  if (cinetpayConfigure()) return 'cinetpay';
  return null;
}

export function paiementConfigure(): boolean {
  return prestataireActif() !== null;
}
