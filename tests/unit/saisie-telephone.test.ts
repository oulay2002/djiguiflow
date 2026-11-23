import { describe, expect, it } from 'vitest';
import { formaterTelephone, normaliserTelephone } from '@/lib/telephone';

/**
 * Le numero que le client tape dans la vitrine.
 *
 * LE DEFAUT QUE CES TESTS TIENNENT FERME. `formaterTelephone` coupait a dix
 * chiffres AVANT que l'indicatif soit retire. Un numero colle depuis un
 * contact, ou pose par le remplissage automatique d'Android, arrive en
 * `+225 07 08 09 10 11` : il en restait `22 50 70 80 91`, et le client lisait
 * « Le numero doit commencer par 0 » devant un numero juste. Constate sur la
 * vitrine en production le 23 novembre 2026.
 *
 * Ce que le champ affiche doit toujours etre ce que `normaliserTelephone`
 * accepte : les deux fonctions sont eprouvees ENSEMBLE, parce que c'est leur
 * desaccord qui faisait le defaut, et qu'aucune des deux n'etait fausse seule.
 */

describe('un numero ivoirien, sous toutes les formes ou il arrive', () => {
  it.each([
    ['0708091011'],
    ['07 08 09 10 11'],
    ['+225 07 08 09 10 11'],
    ['+2250708091011'],
    ['2250708091011'],
    ['00225 0708091011'],
    ['+225-07-08-09-10-11'],
  ])('%s devient 07 08 09 10 11, et il est accepte', (saisie) => {
    const affiche = formaterTelephone(saisie);
    expect(affiche).toBe('07 08 09 10 11');
    expect(normaliserTelephone(affiche)).toMatchObject({ ok: true, national: '0708091011' });
  });
});

describe('pendant la frappe', () => {
  it('le champ ne se vide pas sous les doigts de celui qui tape l’indicatif', () => {
    // Tant qu'aucun chiffre ne suit, on ne sait pas encore que c'est un
    // indicatif : on laisse ce qui est tape.
    expect(formaterTelephone('+2')).toBe('2');
    expect(formaterTelephone('+22')).toBe('22');
    expect(formaterTelephone('+225')).toBe('22 5');
    // Le premier chiffre du numero arrive : l'indicatif s'efface.
    expect(formaterTelephone('+2250')).toBe('0');
    expect(formaterTelephone('+22507')).toBe('07');
  });

  it('un numero national se groupe par deux, et s’arrete a dix chiffres', () => {
    expect(formaterTelephone('0')).toBe('0');
    expect(formaterTelephone('070')).toBe('07 0');
    expect(formaterTelephone('07080910119999')).toBe('07 08 09 10 11');
  });

  it('un numero qui commence par 00 sans etre un indicatif n’est pas ampute', () => {
    expect(formaterTelephone('0012345678')).toBe('00 12 34 56 78');
  });
});

describe('ce qui n’est pas un numero ivoirien reste refuse', () => {
  it('un indicatif etranger n’est pas pris pour le notre', () => {
    // 228 = Togo. Le champ ne le retire pas, et le controle le refuse.
    const affiche = formaterTelephone('+228 90 12 33 81');
    expect(affiche).toBe('22 89 01 23 38');
    expect(normaliserTelephone(affiche).ok).toBe(false);
  });

  it('un numero dont le zero a ete perdu derriere l’indicatif reste refuse', () => {
    // `+225 708091011` : neuf chiffres. On ne devine pas le zero manquant.
    const affiche = formaterTelephone('+225708091011');
    expect(normaliserTelephone(affiche).ok).toBe(false);
  });

  it('une saisie vide ou sans chiffre rend une chaine vide', () => {
    expect(formaterTelephone('')).toBe('');
    expect(formaterTelephone('abc')).toBe('');
  });
});
