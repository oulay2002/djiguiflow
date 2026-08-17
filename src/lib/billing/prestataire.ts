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
export type Prestataire = 'geniuspay' | 'cinetpay';

export function prestataireActif(): Prestataire | null {
  if (geniuspayConfigure()) return 'geniuspay';
  if (cinetpayConfigure()) return 'cinetpay';
  return null;
}

export function paiementConfigure(): boolean {
  return prestataireActif() !== null;
}
