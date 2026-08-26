import { describe, expect, it } from 'vitest';
import { accesOuvert, planApplicable } from '@/lib/billing/acces';

/**
 * « Un abonnement echu ne donne plus les droits du forfait. »
 *
 * CE QUE CES TESTS FERMENT. La regle existait et elle etait juste — mais son
 * unique consommateur etait le NAVIGATEUR. Les decisions serveur, elles, ne
 * lisaient que `plan_key` : le quota, la garde de l'assistante et le
 * declencheur multi-boutiques accordaient donc les droits d'un forfait paye un
 * seul mois, indefiniment.
 *
 * CES TESTS PROTEGENT LES DEUX SENS. Trop laxiste, on offre le produit ; trop
 * strict, on ferme un commerce en activite pour une date qu'on a mal lue — et
 * c'est le second qui coute le plus cher.
 */

const dans = (jours: number) =>
  new Date(Date.now() + jours * 24 * 3600 * 1000).toISOString();

describe('ce qui ouvre l acces', () => {
  it('un forfait actif dont la periode court', () => {
    expect(accesOuvert({ status: 'active', current_period_end: dans(10) })).toBe(true);
  });

  it('un essai en cours', () => {
    expect(accesOuvert({ status: 'trialing', current_period_end: dans(3) })).toBe(true);
  });

  it('SANS DATE DE FIN, ON N OUVRE PAS UNE PORTE QU ON NE SAIT PAS DATER', () => {
    // Les acces ouverts a la main, avant le prepaye, n'ont pas de date.
    expect(accesOuvert({ status: 'active', current_period_end: null })).toBe(true);
  });

  it('une date illisible se lit comme une absence, jamais comme une echeance', () => {
    // Le doute ne doit pas fermer un commerce.
    expect(accesOuvert({ status: 'active', current_period_end: 'bientot' })).toBe(true);
  });
});

describe('ce qui le ferme', () => {
  it('LA PERIODE ECHUE — c est la faille', () => {
    expect(accesOuvert({ status: 'active', current_period_end: dans(-1) })).toBe(false);
  });

  it('un statut qui n ouvre rien, meme dans les temps', () => {
    for (const status of ['canceled', 'past_due', 'unpaid', 'incomplete', '']) {
      expect(accesOuvert({ status, current_period_end: dans(10) })).toBe(false);
    }
  });

  it('aucune ligne d abonnement', () => {
    expect(accesOuvert(null)).toBe(false);
  });
});

describe('le plan REELLEMENT applicable', () => {
  it('un Premium en cours reste Premium', () => {
    expect(planApplicable({ plan_key: 'premium', status: 'active', current_period_end: dans(5) }))
      .toBe('premium');
  });

  it('UN PREMIUM ECHU RETOMBE SUR L ESSAI, il ne disparait pas', () => {
    // Le marchand vend moins ; sa boutique ne ferme pas. Couper d un coup un
    // commerce en activite pour un retard de paiement couterait le commerce.
    expect(planApplicable({ plan_key: 'premium', status: 'active', current_period_end: dans(-1) }))
      .toBe('essai');
  });

  it('sans abonnement, c est l essai — le plan le plus restrictif', () => {
    expect(planApplicable(null)).toBe('essai');
    expect(planApplicable({ plan_key: '', status: 'active', current_period_end: dans(5) }))
      .toBe('essai');
  });
});
