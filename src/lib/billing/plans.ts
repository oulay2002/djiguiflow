/**
 * Grille tarifaire DjiguiFlow — Cote d'Ivoire.
 *
 * Deux principes gouvernent ces chiffres, et ils viennent des donnees de
 * l'instance, pas d'un usage du marche.
 *
 * 1. On facture au VOLUME DE COMMANDES, jamais « en illimite ». Une commande
 *    menee jusqu'a la livraison consomme 37 executions n8n — mesure faite le
 *    12 aout 2026 sur deux commandes de bout en bout. Un restaurant a 20
 *    commandes par jour, c'est 22 200 executions par mois pour lui seul. Le
 *    cout marginal n'est pas nul, il est meme le poste dominant : promettre
 *    l'illimite, c'est s'engager sur une facture qu'on ne controle pas. Et
 *    l'asymetrie est cruelle — relever un plafond est un cadeau, en introduire
 *    un apres coup est un reniement.
 *
 * 2. L'ecart de prix suit le cout, pas seulement la fonctionnalite. Le gros
 *    volume atterrit en Premium : c'est lui qui coute trois a cinq fois plus.
 *    Un Premium a 15 000 contre 10 000 le faisait payer 1,5 fois plus pour
 *    cinq fois la charge, et ne se serait de toute facon pas vendu — cinq
 *    mille francs d'ecart ne font monter personne.
 */

export type PlanKey = 'essai' | 'pro' | 'premium';

export type BillingPlan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  /**
   * Ce qui suit le prix a l'ecran. Il etait ecrit « FCFA / mois » en dur dans
   * la vitrine et dans la page Paiements : l'essai s'affichait donc
   * « 0 FCFA / mois », ce qui promet un gratuit perpetuel.
   */
  suffixePrix: string;
  amountFcfa: number;
  /** Commandes incluses par periode facturee. */
  commandesIncluses: number;
  /** Duree d'une periode, en jours. L'essai ne se renouvelle pas. */
  periodeJours: number;
  /** Un essai ne s'achete pas : il ne s'affiche pas dans le tunnel de paiement. */
  achetable: boolean;
  description: string;
  features: string[];
  popular: boolean;
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    key: 'essai',
    name: 'Essai gratuit',
    priceLabel: '0',
    suffixePrix: 'FCFA — 30 jours',
    amountFcfa: 0,
    commandesIncluses: 30,
    periodeJours: 30,
    achetable: false,
    // Volontairement nomme « essai » et non « Starter » : sous l'ancien nom,
    // le marchand croyait a un palier gratuit permanent et decouvrait le mur
    // au trente-et-unieme jour.
    description: '30 jours pour juger sur piece, toutes les fonctions ouvertes.',
    features: [
      'Bot WhatsApp + IA — 30 commandes',
      'Suivi client et livreurs',
      'Photos améliorées par IA',
      'Posts hebdomadaires Facebook et Instagram',
    ],
    popular: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    priceLabel: '10 000',
    suffixePrix: 'FCFA / mois',
    amountFcfa: 10000,
    commandesIncluses: 300,
    periodeJours: 30,
    achetable: true,
    description: 'Pour la boutique ou le restaurant de quartier.',
    features: [
      'Bot WhatsApp + IA — 300 commandes par mois',
      'Suivi client et livreurs',
      'Photos améliorées par IA',
      'Posts hebdomadaires Facebook et Instagram',
      'Support par e-mail',
    ],
    popular: true,
  },
  {
    key: 'premium',
    name: 'Premium',
    priceLabel: '25 000',
    suffixePrix: 'FCFA / mois',
    amountFcfa: 25000,
    commandesIncluses: 1000,
    periodeJours: 30,
    achetable: true,
    description: 'Pour les gros volumes et les marchands à plusieurs boutiques.',
    features: [
      'Bot WhatsApp + IA — 1 000 commandes par mois',
      'Suivi client et livreurs',
      'Photos améliorées par IA',
      'Posts hebdomadaires Facebook et Instagram',
      'Contenus prêts à publier TikTok et WhatsApp',
      'Plusieurs boutiques sur un même compte',
      'Support prioritaire',
    ],
    popular: false,
  },
];

/**
 * Durees achetables d'avance, et leur remise.
 *
 * Le Mobile Money ivoirien ne sait pas prelever tout seul : aucun mandat
 * recurrent fiable chez Orange, MTN, Moov ou Wave. Plutot que de subir cette
 * contrainte, on en fait un argument — le marchand achete plusieurs mois d'un
 * coup et paie moins cher. On encaisse d'avance, et le « il a oublie de
 * payer » disparait avec elle.
 */
export const DUREES_PREPAYEES = [
  { mois: 1, remise: 0, label: '1 mois' },
  { mois: 3, remise: 0.1, label: '3 mois' },
  { mois: 6, remise: 0.15, label: '6 mois' },
  { mois: 12, remise: 0.2, label: '12 mois' },
] as const;

export type DureePrepayee = (typeof DUREES_PREPAYEES)[number];

export function getBillingPlan(key: string): BillingPlan | null {
  const normalise = normaliserPlan(key);
  return BILLING_PLANS.find((plan) => plan.key === normalise) ?? null;
}

/**
 * Traduit les anciennes cles vers les nouvelles.
 *
 * `starter` a ete renomme `essai`. Des lignes de `subscriptions` portent
 * encore l'ancien nom, et une cle inconnue ferait perdre le plafond de
 * commandes du marchand — donc son acces.
 */
export function normaliserPlan(key: string | null | undefined): PlanKey | null {
  const brut = String(key ?? '').trim().toLowerCase();
  if (brut === 'starter' || brut === 'essai') return 'essai';
  if (brut === 'pro') return 'pro';
  if (brut === 'premium') return 'premium';
  return null;
}

/**
 * Montant a payer pour un plan et une duree, remise appliquee.
 *
 * Arrondi a la centaine de francs : le FCFA n'a pas de decimale, et les
 * operateurs Mobile Money refusent les montants qui n'en sont pas un multiple
 * rond. Un prix affiche « 67 500 » doit etre exactement celui qu'on debite.
 */
export function montantPrepaye(plan: BillingPlan, mois: number): number {
  const duree = DUREES_PREPAYEES.find((d) => d.mois === mois);
  if (!duree || !plan.achetable) return 0;

  const brut = plan.amountFcfa * duree.mois * (1 - duree.remise);
  return Math.round(brut / 100) * 100;
}

/**
 * Commandes incluses par fenetre de 30 jours.
 *
 * Le quota ne se cumule PAS sur la duree achetee. Un Pro paye douze mois a
 * droit a 300 commandes par mois, pas a 3 600 utilisables des janvier : c'est
 * ce que l'offre annonce, et c'est surtout ce qui borne la facture n8n. Mettre
 * l'annee en pot commun aurait permis a un marchand de concentrer une annee de
 * charge sur une semaine — precisement le risque que le plafond existe pour
 * ecarter.
 */
export function quotaCommandes(plan: BillingPlan): number {
  return plan.commandesIncluses;
}

/** Duree de la fenetre sur laquelle s'apprecie le quota, en jours. */
export const FENETRE_QUOTA_JOURS = 30;
