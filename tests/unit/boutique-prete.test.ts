import { describe, expect, it } from 'vitest';
import { boutiqueLivre, boutiquePeutVendre, estBoutiqueDeBanc } from '@/lib/boutiquePrete';

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

/**
 * LE RETRAIT OUVRE LA PLATEFORME A QUI N'A PAS DE LIVREUR.
 *
 * Exiger un groupe de livreurs d'un maquis qui ne fait que de l'a-emporter ne
 * le servait pas mal : ca l'EXCLUAIT. Il ne pouvait pas remplir la condition,
 * donc il ne pouvait pas vendre.
 *
 * C'est le second sens de l'erreur — trop strict — celui que ces tests
 * surveillent en premier, parce qu'il ferme des boutiques vivantes.
 */
describe('le groupe de livreurs n est exige que de qui livre', () => {
  it('une boutique de RETRAIT vend sans aucun groupe', () => {
    const v = boutiquePeutVendre({
      ...branchee,
      groupeLivreurs: null,
      modeRecuperation: 'retrait',
    });
    expect(v.peutVendre).toBe(true);
  });

  it('mais il lui faut toujours un canal pour prevenir le client', () => {
    // Meme en retrait, quelqu'un doit dire au client que sa commande est prete.
    const v = boutiquePeutVendre({
      ...branchee,
      wasenderSecretId: null,
      telegramSecretId: null,
      groupeLivreurs: null,
      modeRecuperation: 'retrait',
    });
    expect(v.peutVendre === false && v.manque).toEqual(['canal_client']);
  });

  it('« les deux » livre, donc le groupe reste exige', () => {
    const v = boutiquePeutVendre({
      ...branchee,
      groupeLivreurs: null,
      modeRecuperation: 'les_deux',
    });
    expect(v.peutVendre === false && v.manque).toEqual(['groupe_livreurs']);
  });

  it('un mode absent se lit « livraison » — les boutiques en service ne bougent pas', () => {
    const v = boutiquePeutVendre({ ...branchee, groupeLivreurs: null });
    expect(v.peutVendre === false && v.manque).toEqual(['groupe_livreurs']);
  });

  it('UN MODE INCONNU RETOMBE DU COTE STRICT', () => {
    // Une valeur imprevue ne doit jamais SUPPRIMER une exigence : sinon une
    // faute de frappe en base ouvrirait la vente sans personne pour porter.
    expect(boutiqueLivre('retait')).toBe(true);
    expect(boutiqueLivre(null)).toBe(true);
    expect(boutiqueLivre('')).toBe(true);
    expect(boutiqueLivre('livraison')).toBe(true);
    expect(boutiqueLivre('les_deux')).toBe(true);
    expect(boutiqueLivre('retrait')).toBe(false);
    expect(boutiqueLivre('  retrait  ')).toBe(false);
  });
});

describe('une fiche illisible ne fait pas vendre', () => {
  it('un objet vide manque des deux', () => {
    const v = boutiquePeutVendre({});
    expect(v.peutVendre).toBe(false);
    expect(v.peutVendre === false && v.manque).toEqual(['canal_client', 'groupe_livreurs']);
  });
});
