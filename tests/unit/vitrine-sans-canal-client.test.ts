import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANAL_DES_COMMANDES_VITRINE, vitrineSansCanalClient } from '@/lib/boutiquePrete';

/**
 * UNE BOUTIQUE EN LIGNE QUI NE PEUT PRÉVENIR AUCUN CLIENT DE SA VITRINE.
 *
 * ── LA CHAÎNE, VÉRIFIÉE MAILLON PAR MAILLON LE 3 SEPTEMBRE 2026 ────────────
 *
 * 1. `commander/route.ts` écrit `canal: 'whatsapp'` **en dur** sur chaque
 *    commande de vitrine — « un client de la vitrine laisse son numéro : c'est
 *    sur WhatsApp qu'on le joint ».
 * 2. Rose Monde, `actif = true`, n'a **pas** de jeton wasender : Telegram seul.
 * 3. `canaux.ts` refuse alors l'envoi en **424** — le repli plateforme a été
 *    retiré le 22 août, à raison : un numéro inconnu qui écrit au sujet de
 *    votre commande a la forme exacte d'une arnaque.
 * 4. Et `boutiquePeutVendre` répond pourtant **oui**, puisque son test accepte
 *    WhatsApp **ou** Telegram.
 *
 * Les cinq notifications de livraison — acceptée, partie, en route, livrée,
 * demande de note — échoueraient toutes.
 *
 * ── LE TROU QUE CES CONTRÔLES FERMENT ──────────────────────────────────────
 *
 * `client_non_prevenu` existe, mais ne se déclenche qu'**après** une commande
 * perdue, et « Tester ma boutique » suppose que le marchand le lance. Rien ne
 * prévenait l'exploitant **avant**. C'est le même motif que la vitrine muette,
 * en plus coûteux : on ne perd pas un visiteur, on prend la commande d'un
 * client et on le laisse sans nouvelles.
 *
 * L'enjeu n'est pas Rose Monde, qui est à nous : c'est le premier marchand qui
 * se branchera en Telegram seul.
 */

/** Rose Monde, telle que la production la portait le 3 septembre 2026. */
const roseMonde = {
  enLigne: true,
  essai: false,
  bancTelegramId: null,
  wasenderSecretId: null,
  telegramSecretId: '2ea91418-be90-4a18-aa96-a50761a86db6',
  groupeLivreurs: '-1003906513172',
  modeRecuperation: 'livraison',
};

/** Chez Zahara, le même jour : WhatsApp ET Telegram. */
const zahara = {
  ...roseMonde,
  wasenderSecretId: '9e2478ad-38aa-4baa-a45f-3f0b41b00125',
  telegramSecretId: '11b458fe-9493-4924-99b5-d9c5aa921dfc',
};

describe('la boutique en ligne sans le canal que sa vitrine ecrira', () => {
  it('signale Rose Monde : en ligne, Telegram seul', () => {
    expect(vitrineSansCanalClient(roseMonde)).toBe(true);
  });

  it('se tait sur Chez Zahara, qui a le jeton wasender', () => {
    expect(vitrineSansCanalClient(zahara)).toBe(false);
  });

  /**
   * TELEGRAM NE SAUVE PAS LA VITRINE, ET C'EST TOUT LE PROPOS.
   *
   * `boutiquePeutVendre` accepte l'un OU l'autre — et il a raison pour ce
   * qu'il mesure. Si ce contrôle-ci acceptait Telegram lui aussi, il rendrait
   * exactement le même verdict que lui et ne servirait plus à rien : Rose
   * Monde repasserait au vert alors qu'aucun de ses clients ne serait prévenu.
   */
  it('un jeton Telegram ne suffit PAS : la vitrine ecrit whatsapp', () => {
    expect(CANAL_DES_COMMANDES_VITRINE).toBe('whatsapp');
    expect(vitrineSansCanalClient({ ...roseMonde, telegramSecretId: 'un-jeton' })).toBe(true);
  });
});

describe('ce que le controle doit taire', () => {
  it('se tait sur une boutique hors ligne : personne ne peut y commander', () => {
    expect(vitrineSansCanalClient({ ...roseMonde, enLigne: false })).toBe(false);
  });

  it('se tait sur une boutique d essai', () => {
    expect(vitrineSansCanalClient({ ...roseMonde, essai: true })).toBe(false);
  });

  /**
   * LE SECOND MARQUEUR DE BANC, ET IL EN FAUT DEUX.
   *
   * Le banc de chaîne porte `essai = false` EXPRÈS, pour que la chaîne
   * s'exécute en entier ; il se protège par `banc_telegram_id`. N'avoir testé
   * qu'`essai` l'a déjà cassé une fois — voir `estBoutiqueDeBanc`.
   */
  it('se tait sur le banc de chaine, qui porte essai = false EXPRES', () => {
    expect(vitrineSansCanalClient({ ...roseMonde, bancTelegramId: '-100123' })).toBe(false);
  });
});

/**
 * MÊME EN RETRAIT, IL FAUT POUVOIR DIRE QUE C'EST PRÊT.
 *
 * `boutiquePeutVendre` dispense la boutique de retrait du groupe de livreurs,
 * jamais du canal client — son commentaire le dit mot pour mot. Ce contrôle
 * suit la même ligne : une boutique à emporter dont le client ne sait pas quand
 * venir chercher est aussi cassée qu'une autre.
 */
describe('une boutique de retrait n est pas dispensee', () => {
  it('la signale aussi, en ligne et sans wasender', () => {
    expect(vitrineSansCanalClient({ ...roseMonde, modeRecuperation: 'retrait' })).toBe(true);
  });
});

/**
 * LE GARDE QUI EMPÊCHE LES DEUX FICHIERS DE DIVERGER.
 *
 * Tout ce contrôle repose sur un fait : la vitrine écrit `whatsapp` sur chaque
 * commande. Le jour où quelqu'un change cette valeur dans la route sans le
 * savoir, l'alerte deviendrait **silencieusement fausse** — elle réclamerait un
 * canal dont plus personne ne se sert. La route doit donc lire la constante,
 * jamais réécrire la chaîne.
 */
describe('la route de commande ne peut plus choisir son canal toute seule', () => {
  const ROUTE = readFileSync('src/app/api/boutiques/[id]/commander/route.ts', 'utf8');

  it('elle importe la constante, et l ecrit avec', () => {
    expect(ROUTE).toContain('CANAL_DES_COMMANDES_VITRINE');
    expect(ROUTE).toContain('canal: CANAL_DES_COMMANDES_VITRINE');
  });

  it('elle ne porte plus la valeur en dur', () => {
    // On ne compte que les AFFECTATIONS du champ : les commentaires de cette
    // route racontent le défaut d'origine et nomment le canal, et les compter
    // ferait tomber ce garde sur une phrase.
    expect(ROUTE).not.toMatch(/canal:\s*'whatsapp'/);
  });
});

/**
 * LE GARDE QUI RELIT LA VEILLE.
 *
 * Même raison qu'ailleurs dans ce dépôt : les contrôles ci-dessus resteraient
 * tous verts si la veille cessait d'appeler la règle, ou si elle reprenait la
 * décision à la main dans sa boucle.
 */
describe('la veille ne decide pas a la place de la regle', () => {
  const VEILLE = readFileSync('src/app/api/internal/veille/chaines/route.ts', 'utf8');

  /**
   * ⚠ LA BORNE EST « LE PROCHAIN BLOC », JAMAIS UN BLOC NOMMÉ — sinon insérer
   * un contrôle entre les deux ferait avaler le bloc voisin et tomber ce garde
   * alors que rien n'est cassé. C'est arrivé le jour même, à son voisin.
   */
  /**
   * ⚠ AUCUN `expect` ICI, ET C'EST DÉLIBÉRÉ. Un échec au moment de composer le
   * `describe` fait ÉCHOUER LE FICHIER : vitest résume alors « 16 passed » sans
   * afficher un seul test rouge. La CI le voit, un humain pressé non — et un
   * test qui disparaît se lit moins bien qu'un test rouge.
   *
   * Le bloc introuvable rend donc une chaîne vide, et c'est le contrôle nommé
   * ci-dessous qui l'annonce.
   */
  const BLOC = (() => {
    const debut = VEILLE.indexOf('// ---- 4 quinquies.');
    if (debut < 0) return '';
    const fin = VEILLE.indexOf('\n    // ---- ', debut + 20);
    return fin > debut ? VEILLE.slice(debut, fin) : '';
  })();

  it('le bloc du controle existe toujours dans la veille', () => {
    expect(BLOC).not.toBe('');
  });

  it('la regle est importee, et le bloc l appelle', () => {
    expect(VEILLE).toContain("from '@/lib/boutiquePrete'");
    expect(BLOC).toContain('vitrineSansCanalClient({');
  });

  /**
   * LES DEUX MARQUEURS DE BANC DOIVENT LUI PARVENIR.
   *
   * `essai` seul ne suffit pas : le banc de chaîne porte `essai = false`
   * exprès et se protège par `banc_telegram_id`. Ne transmettre que le premier
   * ferait crier la veille à chaque passage du banc.
   */
  it('elle recoit les deux marqueurs de banc et le jeton qui decide', () => {
    const appel = BLOC.slice(BLOC.indexOf('vitrineSansCanalClient({'));
    const arguments_ = appel.slice(0, appel.indexOf('})'));
    expect(arguments_).toContain('enLigne');
    expect(arguments_).toContain('essai');
    expect(arguments_).toContain('bancTelegramId');
    expect(arguments_).toContain('wasenderSecretId');
  });

  /**
   * LE CONTRÔLE QUI TIENT TOUT — et il a résisté à sa première écriture.
   *
   * Découper le bloc ligne par ligne ne marche pas ici : l'appel est
   * multiligne, et son `continue` vit sur la ligne de fermeture. C'est donc le
   * motif de `contact-support` qui s'applique — **les marqueurs ne sont lus QUE
   * dans l'appel**. Un `b.actif` ou un `b.essai` ailleurs dans la boucle, et la
   * décision serait redevenue locale : invisible à toute mutation de la règle,
   * donc hors de portée de chaque contrôle de ce fichier.
   */
  it('les marqueurs ne sont lus QUE dans l appel a la regle', () => {
    const debut = BLOC.indexOf('vitrineSansCanalClient({');
    const appel = BLOC.slice(debut, BLOC.indexOf('}))', debut));

    for (const lu of ['b.actif', 'b.essai', 'b.banc_telegram_id', 'b.wasender_secret_id']) {
      const partout = BLOC.split(lu).length - 1;
      const dansLAppel = appel.split(lu).length - 1;
      // Un témoin : sans cette borne, un marqueur absent du fichier passerait
      // le contrôle avec 0 === 0.
      expect(partout).toBeGreaterThan(0);
      expect(dansLAppel).toBe(partout);
    }
  });

  it('la boucle n ecarte que le slug vide, tout le reste est la regle', () => {
    const ecarts = BLOC.split('\n').filter(
      (l) => l.includes('continue') && !l.trim().startsWith('//'),
    );
    expect(ecarts).toHaveLength(2);
    expect(ecarts[0]).toContain('!slug');
  });

  /**
   * LE JETON DOIT VRAIMENT ÊTRE LU EN BASE.
   *
   * La règle peut être parfaite et recevoir `undefined` : une colonne absente
   * du `select` rendrait `wasenderSecretId` toujours vide, et la veille
   * crierait sur TOUTES les boutiques, Zahara comprise. Ce genre d'erreur ne
   * se voit sur aucun test de règle.
   */
  it('les colonnes qui la nourrissent sont demandees a la base', () => {
    for (const c of ['wasender_secret_id', 'telegram_secret_id', 'banc_telegram_id']) {
      expect(VEILLE).toContain(c);
    }
  });
});
