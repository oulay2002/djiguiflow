import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clefBrouillon, ecrireBrouillon, lireBrouillon, type Brouillon } from '@/lib/vitrine/brouillon';

/**
 * Le brouillon d'une commande, garde le temps de l'onglet.
 *
 * LE DEFAUT QUE CES TESTS TIENNENT FERME. Un rechargement effacait le panier
 * et la saisie — mesure en production le 23 novembre 2026. Sur un Android
 * d'entree de gamme, passer sur WhatsApp suffit a faire decharger l'onglet.
 *
 * ET CE QU'ILS INTERDISENT. Le brouillon revient d'un stockage que n'importe
 * qui peut modifier, apres un delai pendant lequel le marchand a pu changer
 * son menu. Rien n'en est donc cru sur parole.
 */

const ARTICLES = [
  { id: 'burger', stock: null },
  { id: 'pizza', stock: 2 },
  { id: 'chaussure', stock: 3, attributValeurs: ['40', '41'] },
];
const LES_DEUX = ['livraison', 'retrait'] as const;

const COMPLET: Brouillon = {
  panier: { burger: 2, pizza: 1, 'chaussure::41': 1 },
  mode: 'retrait',
  heureRetrait: '12:30',
  nom: 'Awa Koné',
  tel: '07 08 09 10 11',
  adresse: 'Cocody Angré, près de la pharmacie',
  instructions: 'Sans piment',
};

const relire = (b: Brouillon, articles = ARTICLES, modes: readonly string[] = LES_DEUX) =>
  lireBrouillon(ecrireBrouillon(b), articles, modes as ('livraison' | 'retrait')[]);

describe('ce qui a ete compose revient tel quel', () => {
  it('panier, mode, heure et coordonnees survivent a l’aller-retour', () => {
    expect(relire(COMPLET)).toEqual(COMPLET);
  });

  it('une clef par boutique : le panier d’un commerce n’est pas celui du voisin', () => {
    expect(clefBrouillon('chez-awa')).not.toBe(clefBrouillon('chez-koffi'));
  });

  it('un brouillon vide ne s’ecrit pas — l’appelant efface la clef', () => {
    expect(ecrireBrouillon({
      panier: {}, mode: 'livraison', heureRetrait: '', nom: ' ', tel: '', adresse: '', instructions: '',
    })).toBeNull();
  });
});

describe('le menu a change pendant l’absence', () => {
  it('un article retire sort du panier, les autres restent', () => {
    const sansPizza = ARTICLES.filter((a) => a.id !== 'pizza');
    expect(relire(COMPLET, sansPizza)?.panier).toEqual({ burger: 2, 'chaussure::41': 1 });
  });

  it('une quantite se plie au stock du jour', () => {
    const r = relire({ ...COMPLET, panier: { pizza: 5 } });
    expect(r?.panier).toEqual({ pizza: 2 });
  });

  it('un article epuise sort du panier', () => {
    const epuise = [{ id: 'pizza', stock: 0 }];
    expect(relire({ ...COMPLET, panier: { pizza: 1 } }, epuise)?.panier).toEqual({});
  });

  it('le stock porte sur la SOMME des variantes, comme sur la vitrine', () => {
    // Trois paires en stock : on ne peut pas en garder deux en 40 ET deux en 41.
    const r = relire({ ...COMPLET, panier: { 'chaussure::40': 2, 'chaussure::41': 2 } });
    expect(r?.panier).toEqual({ 'chaussure::40': 2, 'chaussure::41': 1 });
  });

  it('une variante qui n’est plus proposee est ecartee', () => {
    expect(relire({ ...COMPLET, panier: { 'chaussure::45': 1, burger: 1 } })?.panier).toEqual({ burger: 1 });
  });

  it('un article a variantes sans variante, ou l’inverse, n’est pas commandable', () => {
    expect(relire({ ...COMPLET, panier: { chaussure: 1, 'burger::XL': 1, pizza: 1 } })?.panier).toEqual({ pizza: 1 });
  });

  it('un mode que la boutique ne propose plus est oublie, et l’heure avec lui', () => {
    const r = relire(COMPLET, ARTICLES, ['livraison']);
    expect(r?.mode).toBeNull();
    expect(r?.heureRetrait).toBe('');
  });
});

describe('ce stockage peut contenir n’importe quoi', () => {
  it.each([
    ['rien', null],
    ['du texte', 'pas du json'],
    ['un tableau', '[]'],
    ['une autre version', JSON.stringify({ v: 99, panier: { burger: 1 } })],
    ['un panier dont plus rien n’existe', JSON.stringify({ v: 1, panier: { fantome: 3 } })],
  ])('%s → aucun brouillon', (_nom, brut) => {
    expect(lireBrouillon(brut, ARTICLES, ['livraison'])).toBeNull();
  });

  it('une quantite qui n’est pas un entier positif est ecartee', () => {
    const brut = JSON.stringify({
      v: 1,
      panier: { burger: -2, pizza: 1.5, 'chaussure::40': '3' },
      nom: 'Awa',
    });
    expect(lireBrouillon(brut, ARTICLES, ['livraison'])?.panier).toEqual({});
  });

  it('une quantite demesuree est ramenee au plafond du panier', () => {
    const brut = JSON.stringify({ v: 1, panier: { burger: 1_000_000 } });
    expect(lireBrouillon(brut, ARTICLES, ['livraison'])?.panier).toEqual({ burger: 999 });
  });

  it('un champ qui n’est pas du texte devient vide, un texte trop long est borne', () => {
    const brut = JSON.stringify({
      v: 1, panier: { burger: 1 }, nom: { a: 1 }, tel: 42, adresse: 'x'.repeat(5000), instructions: null,
    });
    const r = lireBrouillon(brut, ARTICLES, ['livraison']);
    expect(r?.nom).toBe('');
    expect(r?.tel).toBe('');
    expect(r?.adresse).toHaveLength(300);
    expect(r?.instructions).toBe('');
  });

  it('une heure mal formee n’est pas restauree', () => {
    const brut = JSON.stringify({ v: 1, panier: { burger: 1 }, mode: 'retrait', heureRetrait: '25h' });
    expect(lireBrouillon(brut, ARTICLES, ['retrait'])?.heureRetrait).toBe('');
  });
});

describe('ce qui tient autour, dans la vitrine', () => {
  const vitrine = readFileSync('src/app/boutiques/[id]/Vitrine.tsx', 'utf8');

  it('le brouillon vit dans sessionStorage, jamais dans localStorage', () => {
    // Il porte un nom, un numero et une adresse : sur un telephone prete, il
    // ne doit pas attendre le prochain visiteur.
    expect(vitrine).toContain('sessionStorage');
    expect(vitrine).not.toContain('localStorage');
  });

  it('rien ne s’ecrit avant que le brouillon ait ete relu', () => {
    // Sans ce verrou, le premier rendu — panier vide — ecraserait le
    // brouillon qu'on s'appretait justement a restaurer.
    expect(vitrine).toMatch(/if \(!brouillonRelu\) return;/);
  });
});
