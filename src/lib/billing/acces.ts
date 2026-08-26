/**
 * L'acces d'un compte est-il reellement ouvert ?
 *
 * ── POURQUOI CETTE REGLE A DU QUITTER SA ROUTE ────────────────────────────
 *
 * Elle vivait dans `/api/billing/subscription`, et elle etait juste. Son
 * probleme n'etait pas ce qu'elle disait, c'est QUI l'ecoutait : son unique
 * consommateur etait le NAVIGATEUR — un `router.replace` dans le layout du
 * tableau de bord.
 *
 * Toutes les decisions SERVEUR, elles, ne lisaient que `plan_key` :
 *
 *   - `etatQuota` interrogeait `plan_key, current_period_start` — ni `status`,
 *     ni `current_period_end` ;
 *   - `/api/internal/quota`, la seule garde que l'assistante consulte avant
 *     d'inscrire une commande, en derivait son verdict ;
 *   - `limiter_boutiques_par_plan` acceptait `plan_key = 'premium'` sans jamais
 *     regarder la periode.
 *
 * Consequence, mesuree a l'audit du 26 aout 2026 : un marchand qui cesse de
 * payer voit son tableau de bord le rediriger — et rien d'autre. Sa vitrine
 * continue de vendre, l'assistante continue de prendre des commandes, et le
 * plafond de son ancien forfait reste applique indefiniment, la fenetre de
 * facturation avancant toute seule depuis une ancre figee. Le courriel de
 * relance lui affirmait pourtant que « le bot ne prend plus de commande ».
 *
 * UNE PORTE QUE SEUL LE NAVIGATEUR SAIT FERMER N'EST PAS UNE PORTE.
 *
 * ── CE QU'ON NE FERME PAS, ET POURQUOI ────────────────────────────────────
 *
 * Un acces echu ne coupe pas le service : il retombe sur l'essai, le plan le
 * plus restrictif. Le marchand vend moins, il ne disparait pas. Fermer d'un
 * coup une boutique en activite pour un paiement en retard couterait un
 * commerce, la ou un plafond abaisse coute une relance.
 */

/** Les seuls statuts qui ouvrent quoi que ce soit. */
const STATUTS_OUVRANTS = new Set(['active', 'trialing']);

export type AbonnementLu = {
  status?: string | null;
  current_period_end?: string | null;
} | null;

export function accesOuvert(abonnement: AbonnementLu): boolean {
  if (!abonnement) return false;
  if (!abonnement.status || !STATUTS_OUVRANTS.has(abonnement.status)) return false;

  // PAS DE DATE DE FIN : ON NE FERME PAS UNE PORTE QU'ON NE SAIT PAS DATER.
  // Le cas se presente sur les acces ouverts a la main, avant le prepaye.
  if (!abonnement.current_period_end) return true;

  const fin = Date.parse(abonnement.current_period_end);
  // Une date illisible se lit comme une absence de date, pas comme une
  // echeance passee : le doute ne doit pas fermer un commerce.
  if (Number.isNaN(fin)) return true;

  return fin > Date.now();
}

/**
 * Le plan REELLEMENT applicable : celui du forfait s'il est ouvert, l'essai
 * sinon.
 *
 * C'est la fonction que doivent appeler toutes les decisions serveur. Lire
 * `plan_key` seul revient a croire sur parole une ligne que plus rien ne
 * revoque — aucune tache, aucun declencheur ne repasse derriere `prolonger_acces`.
 */
export function planApplicable(
  abonnement: (AbonnementLu & { plan_key?: string | null }) | null,
): string {
  if (!abonnement || !accesOuvert(abonnement)) return 'essai';
  return String(abonnement.plan_key ?? '') || 'essai';
}
