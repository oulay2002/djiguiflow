import { describe, expect, it } from 'vitest';
import {
  JETON_EXIGE,
  JOURNAL_SANS_JETON,
  ageEnHeures,
  jetonRefuse,
  verdictJeton,
} from '@/lib/jetonSuivi';

/**
 * La regle du jeton, isolee.
 *
 * Elle vit dans un seul fichier parce que deux routes doivent l'appliquer
 * identiquement, et parce que la phase 4 consistera a en changer UNE ligne.
 * Ces tests sont ce qui garantit que cette ligne fait ce qu'elle annonce.
 */

const JETON = '14c4a9537efc462187eea030ea990e67';

describe('verdictJeton', () => {
  it('accepte le bon jeton', () => {
    expect(verdictJeton(JETON, JETON)).toBe('ok');
  });

  it('tolere les espaces autour, qu’un copier-coller ajoute', () => {
    expect(verdictJeton(`  ${JETON} `, JETON)).toBe('ok');
  });

  it('dit « absent » quand aucun jeton n’est fourni', () => {
    expect(verdictJeton('', JETON)).toBe('absent');
    expect(verdictJeton(null, JETON)).toBe('absent');
    expect(verdictJeton(undefined, JETON)).toBe('absent');
    expect(verdictJeton('   ', JETON)).toBe('absent');
  });

  it('dit « invalide » sur un jeton faux de meme longueur', () => {
    const faux = JETON.slice(0, -1) + (JETON.endsWith('7') ? '8' : '7');
    expect(verdictJeton(faux, JETON)).toBe('invalide');
  });

  it('dit « invalide » sur des longueurs differentes, sans lever', () => {
    // `timingSafeEqual` LEVE quand les longueurs different : la comparaison de
    // longueur doit passer avant, sinon la route rend 500 au lieu de refuser.
    expect(() => verdictJeton('court', JETON)).not.toThrow();
    expect(verdictJeton('court', JETON)).toBe('invalide');
    expect(verdictJeton(`${JETON}${JETON}`, JETON)).toBe('invalide');
  });

  it('dit « invalide » quand la commande n’a pas de jeton mais que l’appelant en presente un', () => {
    // Une commande d'avant la migration n'a pas de jeton. Un appelant qui en
    // presente un ne peut pas l'avoir recu de nous : c'est une tentative.
    expect(verdictJeton(JETON, null)).toBe('invalide');
    expect(verdictJeton(JETON, '')).toBe('invalide');
  });

  it('dit « absent » quand ni l’un ni l’autre n’en a', () => {
    expect(verdictJeton(null, null)).toBe('absent');
  });
});

describe('jetonRefuse — la porte', () => {
  it('refuse TOUJOURS un jeton invalide, meme en phase 3', () => {
    // C'est ce qui empeche le jeton d'etre purement decoratif : sans cela, un
    // enumerateur n'aurait qu'a envoyer n'importe quoi.
    expect(jetonRefuse('invalide')).toBe(true);
  });

  it('laisse passer un jeton correct', () => {
    expect(jetonRefuse('ok')).toBe(false);
  });

  it('suit le drapeau de phase sur un jeton absent', () => {
    expect(jetonRefuse('absent')).toBe(JETON_EXIGE);
  });
});

describe('la phase en cours', () => {
  it('est la PHASE 3 : le jeton n’est pas encore exige', () => {
    // TRIPWIRE VOLONTAIRE. Ce test echouera le jour ou l'on passera en phase 4.
    // C'est le but : il force a relire ce que ce passage implique — les liens
    // sans jeton encore dans les WhatsApp des clients cesseront de fonctionner,
    // et la saisie manuelle d'une reference sur /suivi aussi.
    expect(JETON_EXIGE).toBe(false);
  });

  it('expose un marqueur de journal stable, qu’on puisse compter', () => {
    // Le comptage de ces lignes est ce qui decidera de la phase 4. Un libelle
    // qui change d'une route a l'autre rendrait le chiffre faux.
    expect(JOURNAL_SANS_JETON).toBe('ACCES_SANS_JETON');
  });
});

describe('ageEnHeures', () => {
  it('rend l’age arrondi', () => {
    const ilYATroisHeures = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(ageEnHeures(ilYATroisHeures)).toBe(3);
  });

  it('rend null sur une date absente ou illisible', () => {
    expect(ageEnHeures(null)).toBeNull();
    expect(ageEnHeures('')).toBeNull();
    expect(ageEnHeures('pas une date')).toBeNull();
  });

  it('ne rend jamais d’age negatif', () => {
    const dansUneHeure = new Date(Date.now() + 3_600_000).toISOString();
    expect(ageEnHeures(dansUneHeure)).toBe(0);
  });
});
