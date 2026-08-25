import { describe, expect, it } from 'vitest';

/**
 * Le tri qui separe l'argent reel du bac a sable, dans le rattrapage.
 *
 * CE QUI A MOTIVE CE TEST — un incident, pas une hypothese.
 *
 * Le 24 aout 2026 a 13h33, un paiement d'essai est cree avec un jeton
 * `SANDBOX_FU8S34RCHMHQG8Z2`. Le prestataire ne sait pas dire s'il a abouti :
 * il reste `en_attente`, ce qui est le comportement voulu — un paiement
 * indetermine n'est pas un paiement refuse, et les confondre enterre de
 * l'argent encaisse.
 *
 * Mais le rattrapage LEVE quand un paiement depasse deux heures, pour reveiller
 * l'exploitant. Un blocage qui ne se resout jamais leve donc a CHAQUE PASSAGE :
 * quarante-deux executions en erreur le lendemain, toutes les quinze minutes,
 * pour un essai sans un franc en jeu.
 *
 * Le cout n'est pas le bruit, c'est l'AVEUGLEMENT. Une liste d'executions rouge
 * en permanence ne se lit plus, et la vraie panne du lendemain s'y perd.
 *
 * LES DEUX MOITIES COMPTENT AUTANT. Ecarter le bac a sable de l'alerte, ET ne
 * jamais ecarter un paiement reel — un marchand qui a paye sans recevoir son
 * acces est le pire etat que cette plateforme puisse produire.
 */

/** Le tri, tel que la route l'applique. Voir /api/internal/billing/rattrapage. */
const SEUIL_ALERTE_H = 2;

type Ligne = { reference: string; jeton: string | null; etat: string; heures: number };

const estBacASable = (jeton: string | null) =>
  String(jeton ?? '').trim().toUpperCase().startsWith('SANDBOX_');

const aAlerter = (l: Ligne) =>
  !estBacASable(l.jeton) && l.etat !== 'honore' && l.etat !== 'deja' && l.heures >= SEUIL_ALERTE_H;

describe('rattrapage des paiements — ce qui merite une alerte', () => {
  describe('le bac a sable ne reveille personne', () => {
    it('le jeton reel de l incident du 24 aout est reconnu', () => {
      expect(estBacASable('SANDBOX_FU8S34RCHMHQG8Z2')).toBe(true);
    });

    it.each(['sandbox_abc', 'Sandbox_ABC', '  SANDBOX_ABC  '])(
      'la casse et les espaces ne le font pas passer pour reel (%s)',
      (jeton) => {
        expect(estBacASable(jeton)).toBe(true);
      },
    );

    it('un paiement d essai bloque depuis 20h n alerte pas', () => {
      expect(
        aAlerter({
          reference: 'DJF-1787578421292-I9HRRT61',
          jeton: 'SANDBOX_FU8S34RCHMHQG8Z2',
          etat: 'indetermine',
          heures: 20,
        }),
      ).toBe(false);
    });
  });

  describe('un paiement reel reveille toujours', () => {
    it.each([
      ['indetermine', 3],
      ['acces_non_ouvert', 5],
      ['statut_non_enregistre', 48],
    ])('« %s » depuis %ih alerte', (etat, heures) => {
      expect(aAlerter({ reference: 'DJF-reel', jeton: 'GP_LIVE_XYZ', etat, heures })).toBe(true);
    });

    // Le cas qui coute le plus cher : un jeton absent ne doit JAMAIS etre pris
    // pour un bac a sable. Dans le doute, on alerte.
    it.each([null, '', '   '])('un jeton absent (%s) reste traite comme reel', (jeton) => {
      expect(estBacASable(jeton)).toBe(false);
      expect(aAlerter({ reference: 'DJF-reel', jeton, etat: 'indetermine', heures: 3 })).toBe(true);
    });

    it('un jeton qui contient « sandbox » sans commencer par lui reste reel', () => {
      expect(estBacASable('GP_LIVE_SANDBOX_PIEGE')).toBe(false);
    });
  });

  describe('ce qui n a jamais alerte continue de ne pas alerter', () => {
    it.each(['honore', 'deja'])('« %s » est un succes', (etat) => {
      expect(aAlerter({ reference: 'DJF-ok', jeton: 'GP_LIVE_XYZ', etat, heures: 99 })).toBe(false);
    });

    it('sous le seuil de deux heures, on laisse le temps au prestataire', () => {
      expect(
        aAlerter({ reference: 'DJF-reel', jeton: 'GP_LIVE_XYZ', etat: 'indetermine', heures: 1 }),
      ).toBe(false);
    });
  });
});
