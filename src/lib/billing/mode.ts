import { PRESTATAIRES } from '@/lib/billing/prestataires-connus';

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
 *
 * `geniuspay` manquait a son tour, pour la meme raison : la liste etait ecrite a
 * la main ici, loin de l'endroit ou l'on ajoute un prestataire. Elle vient
 * desormais de `PRESTATAIRES`, la source unique — ajouter un prestataire suffit
 * a le faire reconnaitre ici. `stripe` reste cite a part : il n'est pas un
 * prestataire du selecteur, mais un mode historique qu'un deploiement peut
 * encore porter, et le retirer basculerait ce deploiement en simule.
 */
const MODES_REELS = new Set<string>([...PRESTATAIRES, 'stripe']);

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
