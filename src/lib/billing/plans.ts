export type PlanKey = 'starter' | 'pro' | 'premium';

export type BillingPlan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountFcfa: number;
  description: string;
  features: string[];
  popular: boolean;
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    key: 'starter',
    name: 'Starter',
    priceLabel: '25 000',
    amountFcfa: 25000,
    description: 'Pour les petits commerces qui veulent se structurer.',
    features: ['1 bot Telegram', 'Suivi de base', '3 workflows', 'Support email'],
    popular: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    priceLabel: '50 000',
    amountFcfa: 50000,
    description: 'Pour les boutiques et restaurants en croissance.',
    features: ['4 bots', 'Dashboard complet', '7 workflows', 'Support prioritaire', 'Analytics avances'],
    popular: true,
  },
  {
    key: 'premium',
    name: 'Premium',
    priceLabel: '100 000',
    amountFcfa: 100000,
    description: 'Pour les structures qui veulent l excellence.',
    features: ['Tout illimite', 'WhatsApp Business', 'Support 24/7', 'Formation sur site', 'Personnalisation complete'],
    popular: false,
  },
];

export function getBillingPlan(key: string): BillingPlan | null {
  return BILLING_PLANS.find((plan) => plan.key === key) ?? null;
}
