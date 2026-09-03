import { readFileSync } from 'node:fs';
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

type Ligne = {
  reference: string;
  jeton: string | null;
  etat: string;
  heures: number;
  /** Deja signale une fois. Voir « une fois puis silence » plus bas. */
  dejaSignale?: boolean;
};

const estBacASable = (jeton: string | null) =>
  String(jeton ?? '').trim().toUpperCase().startsWith('SANDBOX_');

const aAlerter = (l: Ligne) =>
  !estBacASable(l.jeton)
  && !l.dejaSignale
  && l.etat !== 'honore'
  && l.etat !== 'deja'
  && l.heures >= SEUIL_ALERTE_H;

/** Toujours bloque, deja signale : silencieux dans l'alerte, VISIBLE au rapport. */
const auRapport = (l: Ligne) =>
  Boolean(l.dejaSignale) && !estBacASable(l.jeton) && l.etat !== 'honore' && l.etat !== 'deja';

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

  describe('une fois puis silence', () => {
    const bloque: Ligne = {
      reference: 'DJF-reel',
      jeton: 'GP_LIVE_XYZ',
      etat: 'indetermine',
      heures: 5,
    };

    it('la premiere fois, on alerte', () => {
      expect(aAlerter(bloque)).toBe(true);
    });

    it('les fois suivantes, on se tait', () => {
      expect(aAlerter({ ...bloque, dejaSignale: true })).toBe(false);
    });

    // LA CONTREPARTIE INDISPENSABLE DU SILENCE. Se taire ET disparaitre, ce
    // serait remplacer un dossier bruyant par un dossier oublie — et un
    // marchand qui a paye sans recevoir son acces ne doit jamais sortir du
    // champ de vision.
    it('mais il reste au rapport, indefiniment', () => {
      expect(auRapport({ ...bloque, dejaSignale: true })).toBe(true);
      expect(auRapport({ ...bloque, dejaSignale: true, heures: 500 })).toBe(true);
    });

    it('un dossier resolu quitte le rapport', () => {
      expect(auRapport({ ...bloque, dejaSignale: true, etat: 'honore' })).toBe(false);
      expect(auRapport({ ...bloque, dejaSignale: true, etat: 'deja' })).toBe(false);
    });

    it('un bac a sable deja signale n encombre pas le rapport', () => {
      expect(auRapport({ ...bloque, jeton: 'SANDBOX_X', dejaSignale: true })).toBe(false);
    });
  });
});

/**
 * AUCUN PAIEMENT NE SORT DU CHAMP DE VISION.
 *
 * ── LE TROU, MESURÉ EN PRODUCTION LE 3 SEPTEMBRE 2026 ──────────────────────
 *
 * Le balayage exigeait `jeton_prestataire is not null`. C'est juste pour ce
 * qu'il fait — sans référence du prestataire, il n'y a rien à lui demander.
 * Mais ces paiements-là n'étaient alors **ni examinés, ni comptés, ni
 * signalés, ni listés dans les dossiers ouverts**. Ils disparaissaient.
 *
 * `scripts/essai-rattrapage.mjs` l'a montré avant qu'on y touche : deux
 * paiements en attente depuis trois heures, l'un porteur d'un jeton et
 * signalé, l'autre sans jeton et **invisible**.
 *
 * ── QUAND ÇA ARRIVE ────────────────────────────────────────────────────────
 *
 * Le jeton est écrit au checkout par une mise à jour séparée de l'insertion,
 * juste après l'appel au prestataire. Son échec n'est que journalisé — à
 * dessein, refuser la commande à ce stade serait pire. Mais le tunnel s'ouvre
 * quand même : le marchand peut payer, et plus rien ne le rattrapera.
 *
 * Ce garde relit la route. Il ne prouve pas le comportement — c'est le banc qui
 * le fait, contre un vrai serveur — il empêche que le filtre revienne en
 * silence, ce qui est exactement la façon dont ce défaut est né.
 */
describe('le rattrapage ne perd personne de vue', () => {
  const ROUTE = readFileSync('src/app/api/internal/billing/rattrapage/route.ts', 'utf8');

  it('il interroge le prestataire sur ceux qui ont un jeton', () => {
    expect(ROUTE).toContain(".not('jeton_prestataire', 'is', null)");
  });

  it('et il REGARDE aussi ceux qui n en ont pas', () => {
    expect(ROUTE).toContain(".is('jeton_prestataire', null)");
  });

  /**
   * `examines` DOIT COMPTER TOUT CE QU'ON A REGARDÉ.
   *
   * Le compter sur la seule liste interrogeable rassurerait à tort : c'est ce
   * chiffre-là qu'on lit dans l'exécution n8n, et il taisait la moitié de ce
   * qu'il prétendait couvrir.
   */
  it('le compte annonce couvre les deux listes', () => {
    expect(ROUTE).toContain('examines: resultats.length');
    expect(ROUTE).not.toContain('examines: lignes.length');
  });

  /**
   * ILS REJOIGNENT LA MÊME MACHINERIE.
   *
   * Une seconde voie d'alerte serait une voie de plus à oublier : ces
   * paiements entrent dans `resultats`, donc dans le seuil des deux heures, le
   * « une fois puis silence » et les dossiers ouverts.
   */
  it('ils entrent dans la meme file que les autres', () => {
    const bloc = ROUTE.slice(ROUTE.indexOf(".is('jeton_prestataire', null)"));
    expect(bloc).toContain('resultats.push(');
    expect(bloc).toContain("etat: 'sans_jeton'");
    // Sans jeton, impossible de savoir si c'est un essai : on ne l'ecarte donc
    // pas de l'alerte. Le repli penche du cote qui reveille.
    expect(bloc).toContain('bacASable: false');
  });
});
