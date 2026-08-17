/**
 * La liste des prestataires de paiement, et RIEN d'autre.
 *
 * CE FICHIER N'IMPORTE RIEN, ET C'EST TOUT SON INTERET.
 *
 * `mode.ts` a besoin de cette liste pour reconnaitre `BILLING_MODE=<nom>` comme
 * un mode REEL, et `mode.ts` est charge par le NAVIGATEUR — le tableau de bord
 * appelle `isMockBillingMode()`. Quand la liste vivait dans `prestataire.ts`,
 * `mode.ts` entrainait donc avec lui `cinetpay.ts`, qui importe
 * `node:dns/promises`, jusque dans le paquet client. Le build echouait sur
 * « the chunking context does not support external modules », et le typecheck,
 * lui, ne voyait rien : c'est une contrainte d'empaquetage, pas de types.
 *
 * Une constante partagee de part et d'autre de la frontiere serveur/navigateur
 * doit etre une FEUILLE. Ajouter le moindre import ici ramenerait la panne.
 */
export const PRESTATAIRES = ['geniuspay', 'cinetpay'] as const;

export type Prestataire = (typeof PRESTATAIRES)[number];
