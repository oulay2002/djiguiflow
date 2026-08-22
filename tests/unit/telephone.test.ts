import { describe, expect, it } from 'vitest';
import { normaliserTelephoneCI } from '@/lib/canaux';

/**
 * Les bornes du controle 1 du diagnostic.
 *
 * Il declare un numero valide quand la normalisation rend au moins onze
 * chiffres commencant par 225. Ces cas-la sont ceux qui decident si un message
 * part ou non : un numero mal forme consomme un envoi pour rien et rend une
 * erreur wasender illisible.
 */

const valide = (brut: unknown) => {
  const n = normaliserTelephoneCI(brut);
  return n.length >= 11 && n.startsWith('225');
};

describe('normaliserTelephoneCI', () => {
  it('laisse intact un numero deja international', () => {
    expect(normaliserTelephoneCI('2250759486701')).toBe('2250759486701');
  });

  it('prefixe un numero local ecrit avec son zero', () => {
    expect(normaliserTelephoneCI('0759486701')).toBe('2250759486701');
  });

  it('ignore les espaces et le plus', () => {
    expect(normaliserTelephoneCI('+225 07 59 48 67 01')).toBe('2250759486701');
  });

  it('rend une chaine vide sur une saisie sans chiffre', () => {
    expect(normaliserTelephoneCI('')).toBe('');
    expect(normaliserTelephoneCI(null)).toBe('');
    expect(normaliserTelephoneCI('   ')).toBe('');
  });
});

describe('la borne du controle 1', () => {
  it('accepte un numero ivoirien complet, ecrit de trois facons', () => {
    expect(valide('2250759486701')).toBe(true);
    expect(valide('0759486701')).toBe(true);
    expect(valide('+225 07 59 48 67 01')).toBe(true);
  });

  it('refuse le vide et les fragments', () => {
    expect(valide('')).toBe(false);
    expect(valide(null)).toBe(false);
    expect(valide('0759')).toBe(false);
  });
});
