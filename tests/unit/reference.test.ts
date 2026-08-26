import { describe, expect, it } from 'vitest';
import { motifExact, referenceRecevable } from '@/lib/reference';

/**
 * CE SONT LES TESTS D'UNE FAILLE, PAS D'UNE FONCTIONNALITE.
 *
 * `motifExact` echappait `\`, `%` et `_` — et laissait passer `*`, que
 * PostgREST traite comme un alias du `%`. Mesure du 26 aout 2026 sur la base
 * reelle : le motif « * » rendait TOUTE la table.
 *
 * Ce que cela ouvrait :
 *   - `/api/internal/commandes/livraison` fait un `update ... ilike(reference)`.
 *     Une requete portant `reference: "*"` basculait toutes les commandes de
 *     tous les marchands en « livree ».
 *   - `/api/confirmation/position` cherchait par ce motif SANS jeton : un
 *     prefixe designait une commande vivante sans en connaitre la reference.
 *
 * Le premier test ci-dessous est celui qui aurait crie. Les autres verifient
 * qu'on n'a pas ferme la porte sur les references legitimes.
 */

describe('la forme d une reference', () => {
  it('accepte les trois familles en circulation', () => {
    expect(referenceRecevable('ZAH-1787137637166-2219')).toBe(true); // vitrine
    expect(referenceRecevable('APP-2250102030405-1787137637166')).toBe(true); // assistante
    expect(referenceRecevable('ATT-1000000006')).toBe(true); // compteur
  });

  it('REFUSE LE JOKER, sous toutes ses formes', () => {
    expect(referenceRecevable('*')).toBe(false);
    expect(referenceRecevable('ZAH-*')).toBe(false);
    expect(referenceRecevable('%')).toBe(false);
    expect(referenceRecevable('ZAH-1787%')).toBe(false);
    expect(referenceRecevable('_')).toBe(false);
  });

  it('refuse le vide, l espace et la ponctuation', () => {
    for (const brut of ['', '   ', 'ZAH 1787', 'ZAH.1787', "ZAH'1787", 'ZAH/1787']) {
      expect(referenceRecevable(brut)).toBe(false);
    }
  });

  it('refuse une reference demesuree', () => {
    // Un motif long est coûteux a evaluer, et aucune reference n'a cette forme.
    expect(referenceRecevable('A'.repeat(64))).toBe(true);
    expect(referenceRecevable('A'.repeat(65))).toBe(false);
  });

  it('tolere les bords : null, undefined, espaces autour', () => {
    expect(referenceRecevable(null)).toBe(false);
    expect(referenceRecevable(undefined)).toBe(false);
    expect(referenceRecevable('  ZAH-1787  ')).toBe(true);
  });
});

describe('le second rideau : ce que motifExact neutralise', () => {
  it('LE JOKER `*` EST ECHAPPE — c est la faille', () => {
    expect(motifExact('*')).toBe('\\*');
    expect(motifExact('ZAH-*')).toBe('ZAH-\\*');
  });

  it('les trois anciens restent echappes', () => {
    expect(motifExact('%')).toBe('\\%');
    expect(motifExact('_')).toBe('\\_');
    expect(motifExact('\\')).toBe('\\\\');
  });

  it('L ANTISLASH PASSE EN PREMIER, sinon on double ce qu on vient de poser', () => {
    // Si `\` etait echappe apres `*`, « \* » deviendrait « \\\\* » et ne
    // designerait plus le meme motif.
    expect(motifExact('\\*')).toBe('\\\\\\*');
  });

  it('une reference legitime traverse sans une marque', () => {
    expect(motifExact('ZAH-1787137637166-2219')).toBe('ZAH-1787137637166-2219');
  });
});
