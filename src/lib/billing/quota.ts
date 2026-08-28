import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { estAdmin } from '@/lib/adminAuth';
import { planApplicable } from '@/lib/billing/acces';
import {
  FENETRE_QUOTA_JOURS,
  getBillingPlan,
  quotaCommandes,
  type BillingPlan,
} from '@/lib/billing/plans';

/**
 * Consommation de commandes d'un compte, sur la fenetre en cours.
 *
 * Le quota borne la facture n8n : une commande menee jusqu'a la livraison
 * consomme 37 executions, et c'est le poste dominant. Sans ce comptage, le
 * plafond annonce dans la grille n'est qu'une phrase.
 *
 * Le quota s'apprecie par COMPTE et non par boutique : un Premium peut en
 * tenir plusieurs, et c'est l'abonnement qui est vendu, pas la boutique.
 */

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const FENETRE_MS = FENETRE_QUOTA_JOURS * MS_PAR_JOUR;

/** Seuils d'alerte, en part du quota. */
const SEUIL_PROCHE = 0.8;
const SEUIL_CRITIQUE = 0.95;

export type NiveauQuota = 'ok' | 'proche' | 'critique' | 'depasse';

export type EtatQuota = {
  plan: BillingPlan;
  quota: number;
  utilise: number;
  restant: number;
  niveau: NiveauQuota;
  /** Vrai des que la prochaine commande depasserait le plafond. */
  bloque: boolean;
  /** Compte interne : hors plafond, comme il est hors paywall. */
  exempt: boolean;
  fenetreDebut: string;
  fenetreFin: string;
};

/**
 * Bornes de la fenetre en cours.
 *
 * Les fenetres sont ancrees sur le debut de periode payee et avancent de
 * trente jours en trente jours. Un marchand qui achete douze mois voit donc
 * son compteur repartir chaque mois, comme l'offre le promet — et non une
 * seule fois par an.
 *
 * Sans date d'ancrage — acces ouvert a la main, compte sans abonnement — on
 * retombe sur les trente derniers jours glissants. C'est moins previsible pour
 * le marchand, mais ca ne laisse jamais un compteur sans borne.
 */
function fenetreCourante(debutPeriode: string | null): { debut: Date; fin: Date } {
  const maintenant = Date.now();
  const ancre = debutPeriode ? Date.parse(debutPeriode) : Number.NaN;

  if (!Number.isFinite(ancre) || ancre > maintenant) {
    return { debut: new Date(maintenant - FENETRE_MS), fin: new Date(maintenant) };
  }

  const ecoulees = Math.floor((maintenant - ancre) / FENETRE_MS);
  const debut = ancre + ecoulees * FENETRE_MS;
  return { debut: new Date(debut), fin: new Date(debut + FENETRE_MS) };
}

function niveauPour(utilise: number, quota: number): NiveauQuota {
  if (quota <= 0) return 'ok';
  if (utilise >= quota) return 'depasse';
  if (utilise >= quota * SEUIL_CRITIQUE) return 'critique';
  if (utilise >= quota * SEUIL_PROCHE) return 'proche';
  return 'ok';
}

/**
 * Etat du quota pour un compte. `null` si la base est injoignable — l'appelant
 * doit alors laisser passer plutot que de bloquer un marchand pour une panne
 * qui n'est pas la sienne.
 */
export async function etatQuota(userId: string): Promise<EtatQuota | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  // L'equipe DjiguiFlow n'est pas soumise a son propre plafond, comme elle
  // n'est pas soumise a son paywall. L'exemption existait dans la garde
  // d'acces mais pas ici : le compte qui fait tourner l'activite — 38
  // commandes, aucune ligne d'abonnement — se serait retrouve bloque par son
  // propre produit des l'activation du plafond. Constate en testant, avant.
  //
  // Elle ne dispense que du BLOCAGE : le comptage reste fait et rendu tel
  // quel. Un compte interne qui verrait « 0 commande » lirait un chiffre faux,
  // et c'est precisement sur ce tableau qu'on juge la consommation reelle.
  /*
    UN COMPTE INTROUVABLE N'EST PAS UN APPEL FAUTIF, ET ON LE DIT ICI.

    Ce code appelait `estAdmin(u?.user?.email, u?.user?.id)` sans regarder si
    la resolution avait abouti. Quand `getUserById` ne rend rien — une fiche
    boutique qui pointe un compte disparu de `auth`, ce que les boutiques du
    banc produisent —, `estAdmin` recevait deux `undefined` et journalisait
    « C'est un defaut d'appel, pas de configuration. » C'etait faux : l'appel
    etait juste. Constate le 28 aout 2026 a 16:00:00 sur la veille des chaines,
    ou ce message envoyait verifier `ADMIN_USER_IDS` pendant que la vraie cause
    — un `user_id` orphelin — restait invisible.

    Le verdict ne change pas d'un iota : compte introuvable, donc pas exempt.
    Seul le diagnostic devient vrai. Une ligne de journal qui nomme une cause
    qu'elle n'a pas verifiee coute le temps de celui qui la croit.
  */
  const { data: utilisateur } = await sb.auth.admin.getUserById(userId);
  const compte = utilisateur?.user;

  if (!compte) {
    console.error(
      `etatQuota — aucun compte auth pour user_id ${userId} : quota calcule`
      + ' sans exemption. Verifier la fiche boutique, pas ADMIN_USER_IDS.',
    );
  }

  const exempt = compte ? estAdmin(compte.email, compte.id) : false;

  const { data: abonnement } = await sb
    .from('subscriptions')
    .select('plan_key, current_period_start, current_period_end, status')
    .eq('user_id', userId)
    .maybeSingle();

  /**
   * LE PLAN APPLICABLE, PAS LE PLAN INSCRIT.
   *
   * Cette lecture ne demandait que `plan_key` et `current_period_start`. Ni le
   * statut, ni la date de fin — alors que RIEN ne revoque une ligne
   * d'abonnement : `prolonger_acces` la pose, et aucune tache, aucun
   * declencheur ne repasse derriere. Un forfait paye un seul mois accordait
   * donc son plafond indefiniment, la fenetre de facturation avancant toute
   * seule depuis une ancre figee.
   *
   * La seule lecture qui tenait compte de l'echeance vivait dans une route que
   * seul le NAVIGATEUR consultait — une porte que le client ferme n'est pas
   * une porte. Elle vit maintenant dans `acces.ts`, et c'est le serveur qui la
   * lit.
   *
   * Sans abonnement — ou avec un abonnement echu — le compte retombe sur
   * l'essai : le plan le plus restrictif, et le repli doit toujours accorder
   * le moins.
   */
  const plan = getBillingPlan(planApplicable(abonnement)) ?? getBillingPlan('essai');
  if (!plan) return null;

  const { debut, fin } = fenetreCourante(abonnement?.current_period_start ?? null);

  const { data: boutiques, error: erreurBoutiques } = await sb
    .from('boutiques')
    .select('id')
    .eq('user_id', userId);

  if (erreurBoutiques) {
    console.error('Quota — lecture des boutiques impossible :', erreurBoutiques);
    return null;
  }

  const ids = (boutiques ?? []).map((b) => b.id);
  const quota = quotaCommandes(plan);

  // Aucun magasin : rien a compter, et surtout rien a bloquer.
  if (ids.length === 0) {
    return {
      plan,
      quota,
      utilise: 0,
      restant: quota,
      niveau: 'ok',
      bloque: false,
      exempt,
      fenetreDebut: debut.toISOString(),
      fenetreFin: fin.toISOString(),
    };
  }

  // `head: true` : on ne veut que le compte, pas les lignes. Sur un marchand a
  // gros volume, rapatrier les commandes pour les compter cote application
  // serait absurde.
  const { count, error } = await sb
    .from('commandes')
    .select('id', { count: 'exact', head: true })
    .in('boutique_id', ids)
    .gte('created_at', debut.toISOString());

  if (error) {
    console.error('Quota — comptage des commandes impossible :', error);
    return null;
  }

  const utilise = count ?? 0;

  return {
    plan,
    quota,
    utilise,
    restant: Math.max(0, quota - utilise),
    niveau: exempt ? 'ok' : niveauPour(utilise, quota),
    bloque: !exempt && utilise >= quota,
    exempt,
    fenetreDebut: debut.toISOString(),
    fenetreFin: fin.toISOString(),
  };
}
