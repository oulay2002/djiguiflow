import { describe, expect, it } from 'vitest';
import { boutiquePeutVendre, estBoutiqueDeBanc } from '@/lib/boutiquePrete';

/**
 * « Une boutique n'est commandable que si elle est veritablement branchee. »
 *
 * CE QUE CETTE REGLE FERME. Le guide met les articles a l'etape 2 et les canaux
 * aux etapes 3 a 6 : en suivant l'ordre officiel, il existait une fenetre ou la
 * vitrine vend et ou PERSONNE n'est prevenu. Le client attend une commande que
 * rien n'a transmise, et il s'en prend au commercant.
 *
 * CE QUE CES TESTS PROTEGENT. Une regle de refus se trompe dans DEUX sens, et
 * les deux coutent :
 *   - trop laxiste, elle laisse passer la commande que personne ne traitera ;
 *   - trop stricte, elle FERME une boutique vivante -- ce qui est pire.
 *
 * Elle s'est deja trompee dans le second sens : n'ayant teste que `essai`, elle
 * a casse le banc de chaine des son premier passage (HTTP 409, plus aucune
 * execution n8n). C'est le banc qui l'a attrapee, et c'est pour ne plus en
 * dependre que ces tests existent.
 */

const branchee = {
  essai: false,
  bancTelegramId: null,
  wasenderSecretId: 'secret-wa',
  telegramSecretId: null,
  groupeLivreurs: '-1004461402565',
};

describe('une boutique branchee vend', () => {
  it('avec un jeton WhatsApp et un groupe', () => {
    expect(boutiquePeutVendre(branchee).peutVendre).toBe(true);
  });

  it('avec un jeton Telegram et un groupe', () => {
    const v = boutiquePeutVendre({
      ...branchee,
      wasenderSecretId: null,
      telegramSecretId: 'secret-tg',
    });
    expect(v.peutVendre).toBe(true);
  });
});

describe('une boutique non branchee ne vend pas', () => {
  it('sans aucun canal pour parler au client', () => {
    const v = boutiquePeutVendre({ ...branchee, wasenderSecretId: null, telegramSecretId: null });
    expect(v.peutVendre).toBe(false);
    expect(v.peutVendre === false && v.manque).toEqual(['canal_client']);
  });

  it('sans groupe de livreurs', () => {
    const v = boutiquePeutVendre({ ...branchee, groupeLivreurs: null });
    expect(v.peutVendre).toBe(false);
    expect(v.peutVendre === false && v.manque).toEqual(['groupe_livreurs']);
  });

  it('et nomme TOUT ce qui manque, pas seulement le premier', () => {
    const v = boutiquePeutVendre({
      ...branchee,
      wasenderSecretId: null,
      telegramSecretId: null,
      groupeLivreurs: '',
    });
    expect(v.peutVendre === false && v.manque).toEqual(['canal_client', 'groupe_livreurs']);
  });

  it('un groupe fait d espaces ne compte pas pour un groupe', () => {
    const v = boutiquePeutVendre({ ...branchee, groupeLivreurs: '   ' });
    expect(v.peutVendre).toBe(false);
  });
});

// LES TESTS QUI PORTENT LA DECISION : trop strict est pire que trop laxiste.
describe('les bancs restent dispenses', () => {
  it('le banc multi-marchand, par `essai`', () => {
    const v = boutiquePeutVendre({ essai: true });
    expect(v.peutVendre).toBe(true);
  });

  it('LE BANC DE CHAINE, par `banc_telegram_id` -- il porte `essai = false`', () => {
    // C'est le cas qui a casse : `essai` vaut faux EXPRES, pour que la chaine
    // s'execute en entier. Sans ce second marqueur, le seul essai qui exerce
    // le parcours jusqu'aux livreurs cesse de fonctionner.
    const v = boutiquePeutVendre({
      essai: false,
      bancTelegramId: '-1003994906478',
      wasenderSecretId: null,
      telegramSecretId: null,
      groupeLivreurs: '-1003994906478',
    });
    expect(v.peutVendre).toBe(true);
  });

  it('reconnait les deux marqueurs, et rien d autre', () => {
    expect(estBoutiqueDeBanc({ essai: true })).toBe(true);
    expect(estBoutiqueDeBanc({ bancTelegramId: '-100777' })).toBe(true);
    expect(estBoutiqueDeBanc({ essai: false, bancTelegramId: '' })).toBe(false);
    expect(estBoutiqueDeBanc({})).toBe(false);
  });
});

describe('une fiche illisible ne fait pas vendre', () => {
  it('un objet vide manque des deux', () => {
    const v = boutiquePeutVendre({});
    expect(v.peutVendre).toBe(false);
    expect(v.peutVendre === false && v.manque).toEqual(['canal_client', 'groupe_livreurs']);
  });
});
