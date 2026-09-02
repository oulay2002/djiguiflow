import { describe, expect, it } from 'vitest';
import { etatAbonnement, formuleDejaPayee } from '@/lib/billing/etatAbonnement';

/**
 * L'écran de facturation, vu par le marchand.
 *
 * Deux défauts mesurés en production le 2 septembre 2026, sur les deux seuls
 * comptes de la plateforme — tous deux en essai sur `pro` :
 *
 * 1. Le statut s'affichait en anglais technique, brut : « Trialing ».
 * 2. La formule Pro était grisée, marquée « Plan actif » : **le marchand ne
 *    pouvait pas payer les 10 000 F depuis son propre écran.**
 */

const FIN = '2026-09-23T00:00:00.000Z';

describe('le statut se dit en français', () => {
  it('LE DEFAUT : « trialing » devenait « Trialing »', () => {
    const e = etatAbonnement('trialing', FIN);
    expect(e.libelle).toBe('Essai gratuit');
    expect(e.libelle).not.toMatch(/trialing/i);
  });

  it('et il annonce LA DATE et ce qui se passe apres', () => {
    // En prepaye, rien ne se reconduit : a l'echeance le bot cesse de prendre
    // les commandes. L'ecran qui porte le mot « abonnement » doit le dire.
    const e = etatAbonnement('trialing', FIN);
    expect(e.explication).toContain('23 septembre 2026');
    expect(e.explication).toContain('rien ne se reconduit tout seul'.replace('rien', 'Rien'));
  });

  it('les etats d ECHEC sont nommes et sonnent l alerte', () => {
    // Ce sont les pires : « Past_due » et « Unpaid » en anglais, avec un
    // souligne, a un marchand dont l acces va se fermer.
    for (const s of ['past_due', 'unpaid', 'canceled', 'incomplete_expired']) {
      const e = etatAbonnement(s, FIN);
      expect(e.ton, s).toBe('alerte');
      expect(e.libelle, s).not.toMatch(/[a-z]+_[a-z]+/);
      expect(e.libelle, s).not.toMatch(/due|unpaid|cancel|expired/i);
    }
  });

  it('un paiement commence sans etre fini appelle a le reprendre, sans crier', () => {
    const e = etatAbonnement('incomplete', FIN);
    expect(e.ton).toBe('attention');
  });

  it('UN STATUT INCONNU se nomme, et rend son code brut au support', () => {
    // Traduire au hasard serait inventer ; le masquer serait le defaut
    // silencieux.
    const e = etatAbonnement('quelque_chose_de_neuf', FIN);
    expect(e.libelle).toBe('État inconnu');
    expect(e.explication).toContain('quelque_chose_de_neuf');
  });

  it('aucun abonnement du tout se dit aussi', () => {
    expect(etatAbonnement(null, null).explication).toContain('Aucun abonnement');
  });

  it('sans date de fin, elle n en invente pas', () => {
    const e = etatAbonnement('trialing', null);
    expect(e.explication).not.toMatch(/\d{4}/);
  });
});

describe('payer sa formule — le bouton qui etait grise', () => {
  it('LE DEFAUT : un essai sur « pro » bloquait l achat de Pro', () => {
    // `plan_key` pendant l'essai designe la formule qu'on AURA, pas celle
    // qu'on a achetee. Le marchand ne pouvait payer que Premium a 25 000 F.
    expect(formuleDejaPayee('pro', 'trialing', 'pro')).toBe(false);
  });

  it('temoin : une formule REELLEMENT payee reste grisee', () => {
    // Sans lui, « ce n est pas paye » serait vrai d une fonction qui rend
    // toujours faux, et on revendrait sa formule a qui l a deja.
    expect(formuleDejaPayee('pro', 'active', 'pro')).toBe(true);
  });

  it('une autre formule n est jamais la sienne', () => {
    expect(formuleDejaPayee('pro', 'active', 'premium')).toBe(false);
  });

  it('un retard ou un impaye laissent le bouton cliquable', () => {
    // C'est precisement le moment ou il faut pouvoir payer.
    for (const s of ['past_due', 'unpaid', 'canceled', 'incomplete']) {
      expect(formuleDejaPayee('pro', s, 'pro'), s).toBe(false);
    }
  });

  it('sans abonnement, rien n est paye', () => {
    expect(formuleDejaPayee(null, null, 'pro')).toBe(false);
  });
});
