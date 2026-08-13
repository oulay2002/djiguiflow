/**
 * Le tunnel de paiement est-il simule ?
 *
 * En mode simule, le retour de « paiement » ouvre les droits sans qu'aucun
 * franc n'ait circule. C'est indispensable pour developper, et desastreux si
 * ca s'active par megarde : un mode mal reconnu qui retombe sur « simule »
 * offre l'abonnement a qui le demande.
 *
 * D'ou la regle : tout mode de paiement REEL explicitement nomme est reconnu
 * comme tel, quel que soit NODE_ENV. `cinetpay` manquait a l'appel, et un
 * `BILLING_MODE=cinetpay` pose en developpement basculait en simule sans rien
 * dire — le contraire de ce que la variable annonce.
 */
const MODES_REELS = new Set(['cinetpay', 'stripe']);

export function isMockBillingMode(): boolean {
  const serverMode = process.env.BILLING_MODE?.trim().toLowerCase();
  const publicMode = process.env.NEXT_PUBLIC_BILLING_MODE?.trim().toLowerCase();

  if (serverMode === 'mock' || publicMode === 'mock') {
    return true;
  }

  if (
    (serverMode && MODES_REELS.has(serverMode)) ||
    (publicMode && MODES_REELS.has(publicMode))
  ) {
    return false;
  }

  // Sans instruction, on simule hors production et jamais en production : le
  // repli doit toujours pencher du cote qui n'offre rien.
  return process.env.NODE_ENV !== 'production';
}
