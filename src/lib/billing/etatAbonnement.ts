/**
 * CE QUE LE MARCHAND LIT SUR SON ÉCRAN DE FACTURATION.
 *
 * ── LE PREMIER DÉFAUT : DE L'ANGLAIS TECHNIQUE, BRUT ───────────────────────
 *
 * La tuile « Statut » affichait `subscription.status` tel quel, mis en capitale
 * par CSS. Le statut vient du fournisseur de paiement sans traduction : un
 * marchand abidjanais lisait donc « Trialing ». Mesuré le 2 septembre 2026 —
 * les DEUX comptes de la plateforme étaient dans ce cas.
 *
 * Et les valeurs qui comptent le plus sont les pires : `past_due` et `unpaid`
 * veulent dire « votre paiement a échoué », et se seraient affichées
 * « Past_due » et « Unpaid ». Le marchand dont l'accès va se fermer n'avait
 * aucune chance de le comprendre.
 *
 * ── LE SECOND : « ACTIF » NE DISAIT PAS CE QUI VA SE PASSER ────────────────
 *
 * Le bandeau annonçait « Actif » pendant un essai, à côté d'un statut
 * « Trialing », au-dessus d'une carte Pro marquée « Plan actif ». Trois
 * affirmations, et aucune ne disait la seule chose qui compte :
 *
 * **En prépayé, rien ne se reconduit tout seul.** `abonnements/echeances` le
 * dit en toutes lettres — le Mobile Money ivoirien n'offre aucun mandat
 * récurrent fiable. À l'échéance, le bot cesse de prendre les commandes et le
 * tableau de bord se ferme. Les données restent intactes, tout revient au
 * paiement.
 *
 * Un marchand qui lit « Actif » et perd son accès un matin n'a pas été prévenu
 * par cet écran. Il l'a été par Telegram (jalons 7, 3, 1 et 0 jours), mais
 * l'écran qui porte le mot « abonnement » doit le dire aussi.
 *
 * ── UN STATUT INCONNU NE SE TAIT PAS ───────────────────────────────────────
 *
 * Le fournisseur peut en introduire un demain. On ne le traduit pas au hasard
 * et on ne le masque pas : on le nomme « État inconnu » ET on rend le code
 * brut dans l'explication, pour que le support sache quoi chercher. Traduire à
 * l'aveugle serait inventer ; masquer serait le défaut silencieux.
 */

export type TonEtat = 'ok' | 'attention' | 'alerte';

export type EtatAbonnement = {
  /** Le mot que porte le bandeau. En français, toujours. */
  libelle: string;
  ton: TonEtat;
  /** Ce que le marchand doit comprendre, avec la date quand elle existe. */
  explication: string;
};

/** Le rappel qui vaut pour tout accès qui court : il n'y a pas de reconduction. */
const RIEN_NE_SE_RECONDUIT =
  'Rien ne se reconduit tout seul : sans paiement avant cette date, le bot cesse '
  + 'de prendre vos commandes. Vos données restent intactes.';

function leJour(fin: string | null | undefined): string {
  const t = Date.parse(String(fin ?? ''));
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Abidjan',
  });
}

export function etatAbonnement(
  statut: string | null | undefined,
  finDePeriode?: string | null,
): EtatAbonnement {
  const s = String(statut ?? '').trim().toLowerCase();
  const jour = leJour(finDePeriode);
  const jusqua = jour ? ` jusqu’au ${jour}` : '';

  switch (s) {
    case 'trialing':
      return {
        libelle: 'Essai gratuit',
        ton: 'ok',
        explication: jour
          ? `Votre essai est gratuit jusqu’au ${jour}. ${RIEN_NE_SE_RECONDUIT}`
          : `Votre essai est en cours. ${RIEN_NE_SE_RECONDUIT}`,
      };

    case 'active':
      return {
        libelle: 'Actif',
        ton: 'ok',
        explication: jour
          ? `Votre accès court${jusqua}. ${RIEN_NE_SE_RECONDUIT}`
          : `Votre accès est ouvert. ${RIEN_NE_SE_RECONDUIT}`,
      };

    case 'past_due':
      return {
        libelle: 'Paiement en retard',
        ton: 'alerte',
        explication:
          'Votre dernier paiement n’a pas abouti. Réglez-le pour que le bot '
          + 'continue de prendre vos commandes.',
      };

    case 'unpaid':
      return {
        libelle: 'Impayé',
        ton: 'alerte',
        explication:
          'Le paiement n’a pas été reçu et l’accès est suspendu. Vos données sont '
          + 'intactes : tout revient dès le règlement.',
      };

    case 'canceled':
      return {
        libelle: 'Résilié',
        ton: 'alerte',
        explication:
          'Votre abonnement est arrêté. Choisissez une formule ci-dessous pour '
          + 'rouvrir votre accès — vos données vous attendent.',
      };

    case 'incomplete':
      return {
        libelle: 'Paiement à finir',
        ton: 'attention',
        explication:
          'Un paiement a été commencé sans être terminé. Reprenez-le ci-dessous, '
          + 'ou écrivez-nous si vous avez été débité.',
      };

    case 'incomplete_expired':
      return {
        libelle: 'Paiement abandonné',
        ton: 'alerte',
        explication:
          'Le paiement commencé n’a jamais abouti et la demande a expiré. '
          + 'Choisissez une formule ci-dessous pour reprendre.',
      };

    case 'paused':
      return {
        libelle: 'En pause',
        ton: 'attention',
        explication: 'Votre abonnement est suspendu. Écrivez-nous pour le reprendre.',
      };

    default:
      return {
        libelle: 'État inconnu',
        ton: 'attention',
        // LE CODE BRUT RESTE LISIBLE, et c'est volontaire : traduire au hasard
        // serait inventer, le masquer serait mentir. Le marchand nous ecrit, on
        // sait quoi chercher.
        explication: s
          ? `Nous ne savons pas interpréter l’état « ${s} ». Écrivez-nous, nous vérifions.`
          : 'Aucun abonnement enregistré pour ce compte.',
      };
  }
}

/**
 * CETTE FORMULE EST-ELLE DÉJÀ PAYÉE ?
 *
 * ── LE DÉFAUT QUI BLOQUAIT LA CONVERSION ───────────────────────────────────
 *
 * L'écran désactivait le bouton d'une formule dès que `plan_key` correspondait
 * ET que l'abonnement était « actif » — un ensemble qui contenait `trialing`.
 *
 * Or l'essai porte DÉJÀ `plan_key = 'pro'` : c'est la formule qu'on aura, pas
 * celle qu'on a achetée. Un marchand en essai voyait donc Pro grisé, marqué
 * « Plan actif », et ne pouvait acheter que Premium à 25 000 F. **Il lui était
 * impossible de payer les 10 000 F de Pro depuis son propre écran.**
 *
 * Mesuré en production le 2 septembre 2026, sur les deux seuls comptes de la
 * plateforme — tous deux en essai sur `pro`.
 *
 * Payé veut dire `active`, et rien d'autre. Un essai, un retard, un impayé :
 * autant de raisons de laisser le bouton cliquable.
 */
export function formuleDejaPayee(
  planDuCompte: string | null | undefined,
  statut: string | null | undefined,
  formule: string,
): boolean {
  return String(planDuCompte ?? '') === formule
    && String(statut ?? '').trim().toLowerCase() === 'active';
}
