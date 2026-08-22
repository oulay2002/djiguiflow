import { describe, expect, it } from 'vitest';
import {
  JETON_EXIGE,
  JOURNAL_SANS_JETON,
  PLAFOND_PREUVES_PAR_COMMANDE,
  ageEnHeures,
  jetonRefuse,
  verdictJeton,
  verdictTelephone,
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
  it('refuse TOUJOURS un jeton invalide, quelle que soit la phase', () => {
    // C'est ce qui empeche le jeton d'etre purement decoratif : sans cela, un
    // enumerateur n'aurait qu'a envoyer n'importe quoi.
    expect(jetonRefuse('invalide')).toBe(true);
  });

  it('laisse passer un jeton correct', () => {
    expect(jetonRefuse('ok')).toBe(false);
  });

  // PHASE 4 : l'absence est desormais refusee. Le test lit le drapeau plutot
  // que de recopier `true` — le jour d'un retour arriere, il suivra au lieu de
  // mentir.
  it('suit le drapeau de phase sur un jeton absent', () => {
    expect(jetonRefuse('absent')).toBe(JETON_EXIGE);
  });

  it('est en PHASE 4 : le jeton est exige', () => {
    expect(JETON_EXIGE).toBe(true);
    expect(jetonRefuse('absent')).toBe(true);
  });
});

describe('la phase en cours', () => {
  it('est la PHASE 4 : le jeton est exige', () => {
    // LE TRIPWIRE A SERVI. Il a echoue a la bascule du 22 aout 2026, comme
    // prevu, et a force a relire ce que ce passage implique. Il garde le meme
    // role dans l'autre sens : revenir en arriere rouvre l'enumeration, et ne
    // doit pas pouvoir se faire d'un caractere sans que rien ne rougisse.
    //
    // Ce qui a permis de basculer n'est pas un delai mais une mesure : 57
    // commandes, ZERO sans jeton, et une seule confirmation en attente, vieille
    // de 7,5 jours et deja abandonnee.
    expect(JETON_EXIGE).toBe(true);
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

describe('verdictTelephone — la seconde preuve', () => {
  const TEL = '2250759486701';

  it('accepte les quatre derniers chiffres', () => {
    expect(verdictTelephone('6701', TEL)).toBe('ok');
  });

  it('ignore ce qui n’est pas un chiffre, qu’un client colle parfois', () => {
    expect(verdictTelephone('67 01', TEL)).toBe('ok');
    expect(verdictTelephone('-6701-', TEL)).toBe('ok');
  });

  it('dit « absent » quand rien n’est saisi', () => {
    expect(verdictTelephone('', TEL)).toBe('absent');
    expect(verdictTelephone(null, TEL)).toBe('absent');
    expect(verdictTelephone('abcd', TEL)).toBe('absent');
  });

  it('refuse quatre mauvais chiffres', () => {
    expect(verdictTelephone('0000', TEL)).toBe('invalide');
  });

  it('refuse une saisie qui n’a pas exactement quatre chiffres', () => {
    // Trois chiffres justes ne suffisent pas, et huit non plus : accepter un
    // prefixe reviendrait a diviser l'espace de recherche par dix.
    expect(verdictTelephone('701', TEL)).toBe('invalide');
    expect(verdictTelephone('486701', TEL)).toBe('invalide');
  });

  it('refuse quand la commande n’a pas de telephone', () => {
    expect(verdictTelephone('6701', null)).toBe('invalide');
    expect(verdictTelephone('6701', '12')).toBe('invalide');
  });

  it('borne les essais a dix par commande et par jour', () => {
    // C'est CE plafond qui rend quatre chiffres tenables : 10 000 possibilites
    // a dix essais par jour font un millier de jours. Sans lui, l'obstacle
    // tomberait en quelques heures.
    expect(PLAFOND_PREUVES_PAR_COMMANDE).toBe(10);
  });
});
