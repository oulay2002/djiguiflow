import { describe, it, expect } from 'vitest';
import {
  etatLivraisonOfferte,
  etatMinimum,
  objectifPanier,
  phraseObjectif,
} from '@/lib/objectifsPanier';

/**
 * CE QUE CES TESTS PROTEGENT.
 *
 * La vitrine ne doit JAMAIS dire au client autre chose que ce que la route
 * appliquera. Le seuil du minimum est recopie ici depuis
 * `src/app/api/boutiques/[id]/commander/route.ts:530` :
 *
 *     Number.isFinite(minimum) && minimum > 0 && total < minimum
 *
 * Si l'un des deux bouts change, ces tests doivent tomber.
 */

const livraison = { mode: 'livraison' as const };

/**
 * L'ESPACE QUI N'EN EST PAS UNE.
 *
 * `toLocaleString('fr-FR')` separe les milliers par une ESPACE FINE INSECABLE
 * (U+202F), pas par l'espace ordinaire du clavier. Ecrire « 5 000 » a la main
 * dans un test le fait echouer sur une implementation pourtant juste — c'est
 * arrive ici meme.
 *
 * A retenir au-dela de ces tests : ce caractere casse `Number()` encore plus
 * surement qu'une espace normale, et c'est celui que le client copie quand il
 * recopie un prix affiche. Voir la memoire « lire un montant saisi a la main ».
 */
const ESP = ' ';
/** Seules les espaces ENTRE CHIFFRES deviennent fines : pas celles des mots. */
const montant = (n: string) => n.replace(/(\d) (?=\d)/g, `$1${ESP}`);

describe('objectifPanier — le minimum de commande', () => {
  it('annonce ce qui manque quand le total est sous le minimum', () => {
    const o = objectifPanier({ ...livraison, total: 4500, minimum: 5000, offerteDes: null });
    expect(o).toEqual({ type: 'minimum', manque: 500, seuil: 5000 });
  });

  it('se tait des que le minimum est atteint', () => {
    expect(objectifPanier({ ...livraison, total: 5000, minimum: 5000, offerteDes: null })).toBeNull();
  });

  it('se tait sur un panier vide — il n y a rien a completer', () => {
    expect(objectifPanier({ ...livraison, total: 0, minimum: 5000, offerteDes: null })).toBeNull();
  });

  it('ignore un minimum absent, nul ou negatif', () => {
    for (const minimum of [null, undefined, 0, -100]) {
      expect(objectifPanier({ ...livraison, total: 100, minimum, offerteDes: null })).toBeNull();
    }
  });

  /**
   * LE PIEGE DU BOOLEEN. `Number(true)` vaut 1 : un minimum a `true` deviendrait
   * un minimum d'un franc, et la vitrine annoncerait un objectif imaginaire.
   * Voir la memoire « lire un montant saisi a la main ».
   */
  it('refuse un booleen et une chaine, plutot que de les convertir', () => {
    for (const minimum of [true, '5000', '12 000', {}, [] as unknown]) {
      expect(objectifPanier({ ...livraison, total: 100, minimum, offerteDes: null })).toBeNull();
    }
  });
});

describe('objectifPanier — la livraison offerte', () => {
  it('annonce ce qui manque pour atteindre le seuil', () => {
    const o = objectifPanier({ ...livraison, total: 8800, minimum: null, offerteDes: 10000 });
    expect(o).toEqual({ type: 'livraison', manque: 1200, seuil: 10000 });
  });

  it('se tait quand le seuil est atteint', () => {
    expect(objectifPanier({ ...livraison, total: 10000, minimum: null, offerteDes: 10000 })).toBeNull();
  });

  /**
   * ZERO VEUT DIRE « TOUJOURS OFFERTE ». Le traiter comme un seuil ferait
   * annoncer un objectif deja atteint, et pire, `manque` serait negatif.
   */
  it('ne fait pas un objectif d un seuil a zero', () => {
    expect(objectifPanier({ ...livraison, total: 500, minimum: null, offerteDes: 0 })).toBeNull();
  });

  it('se tait en retrait — il n y a pas de livraison a offrir', () => {
    const o = objectifPanier({ mode: 'retrait', total: 8800, minimum: null, offerteDes: 10000 });
    expect(o).toBeNull();
  });
});

describe('objectifPanier — priorite', () => {
  /**
   * LE MINIMUM PASSE DEVANT : il BLOQUE la commande, la livraison offerte
   * n'est qu'un bonus. Annoncer le bonus a un client qui sera refuse serait
   * lui faire perdre son temps deux fois.
   */
  it('annonce le minimum plutot que la livraison quand les deux manquent', () => {
    const o = objectifPanier({ ...livraison, total: 1000, minimum: 5000, offerteDes: 10000 });
    expect(o).toEqual({ type: 'minimum', manque: 4000, seuil: 5000 });
  });

  it('passe a la livraison une fois le minimum atteint', () => {
    const o = objectifPanier({ ...livraison, total: 5000, minimum: 5000, offerteDes: 10000 });
    expect(o).toEqual({ type: 'livraison', manque: 5000, seuil: 10000 });
  });
});

describe('phraseObjectif', () => {
  it('dit ce qui manque pour commander, sans jargon', () => {
    expect(phraseObjectif({ type: 'minimum', manque: 500, seuil: 5000 }))
      .toBe(montant('Il vous manque 500 FCFA pour atteindre le minimum de 5 000 FCFA.'));
  });

  it('dit ce qui manque pour la livraison offerte', () => {
    expect(phraseObjectif({ type: 'livraison', manque: 1200, seuil: 10000 }))
      .toBe(montant('Plus que 1 200 FCFA et la livraison vous est offerte.'));
  });

  it('ne dit rien quand il n y a pas d objectif', () => {
    expect(phraseObjectif(null)).toBe('');
  });

  /**
   * Les montants sont formates a la francaise, avec un espace insecable etroit
   * pour les milliers. Le test le fige : « 5000 FCFA » se lit mal sur une
   * ardoise comme a l'ecran.
   */
  it('formate les milliers des DEUX montants du minimum', () => {
    const p = phraseObjectif({ type: 'minimum', manque: 12000, seuil: 25000 });
    expect(p).toContain(montant('12 000'));
    expect(p).toContain(montant('25 000'));
  });

  /**
   * LA PHRASE DE LIVRAISON NE REPETE PAS LE SEUIL, et c'est voulu : il est
   * deja affiche en haut de page par `mentionFrais`. On dit ce que le client
   * GAGNE, pas ce qu'il doit atteindre.
   */
  it('ne repete pas le seuil dans la phrase de livraison', () => {
    const p = phraseObjectif({ type: 'livraison', manque: 12000, seuil: 25000 });
    expect(p).toContain(montant('12 000'));
    expect(p).not.toContain(montant('25 000'));
  });
});

/**
 * CE QUE LE MARCHAND VOIT DE SES PROPRES LEVIERS.
 *
 * ── POURQUOI CE BLOC EXISTE ────────────────────────────────────────────────
 *
 * Le 3 septembre 2026, le parcours d'accueil ne parlait jamais de ces deux
 * réglages : un marchand qui le terminait avait une boutique qui marche, sans
 * minimum ni seuil de livraison offerte, et **rien ne l'avait invité à y
 * penser**. Le bloc facultatif ajouté à `/onboarding` les lui nomme et lui dit
 * où ils se règlent — il n'écrit rien, pour qu'un seul écran garde ces
 * colonnes.
 *
 * ── LE PIÈGE QUE CES TESTS TIENNENT ────────────────────────────────────────
 *
 * `livraison_offerte_des` a **trois** états, pas deux. Un écran qui lit
 * `!valeur` confond le `0` — « toujours offerte », un choix délibéré — avec le
 * `NULL` — « le livreur annonce ». Il annoncerait « pas encore posé » à un
 * marchand qui offre la livraison à tout le monde depuis le premier jour.
 *
 * C'est exactement le motif du défaut silencieux : une valeur par défaut qui
 * masque une donnée présente.
 */
describe('etatMinimum — ce que le marchand a posé', () => {
  it('dit le vide quand rien n est pose', () => {
    expect(etatMinimum(null)).toEqual({ phrase: 'pas encore posé', pose: false });
    expect(etatMinimum(undefined).pose).toBe(false);
  });

  it('dit le montant quand il est pose', () => {
    const e = etatMinimum(5000);
    expect(e.pose).toBe(true);
    expect(e.phrase).toContain(montant('5 000'));
  });

  /**
   * UN MINIMUM DE ZÉRO N'EST PAS UN MINIMUM.
   *
   * Contrairement à la livraison offerte, le zéro n'a ici aucun sens propre :
   * « les commandes commencent à 0 F » ne contraint rien. La route de commande
   * l'ignore déjà (`minimum > 0`) ; l'écran doit dire la même chose, sans quoi
   * le marchand croirait avoir posé une règle qui ne s'applique pas.
   */
  it('un zero ne compte pas comme un minimum pose', () => {
    expect(etatMinimum(0).pose).toBe(false);
  });

  it('une valeur qui n est pas un nombre ne pose rien', () => {
    expect(etatMinimum('5000').pose).toBe(false);
    expect(etatMinimum(true).pose).toBe(false);
    expect(etatMinimum(Number.NaN).pose).toBe(false);
  });
});

describe('etatLivraisonOfferte — les TROIS etats, pas deux', () => {
  it('NULL veut dire que le livreur annonce ses frais', () => {
    const e = etatLivraisonOfferte(null);
    expect(e.pose).toBe(false);
    expect(e.phrase).toContain('livreur');
  });

  /**
   * LE CONTRÔLE QUI PORTE TOUT LE BLOC.
   *
   * Si celui-ci tombe, un marchand qui a choisi d'offrir la livraison à tout
   * le monde lit « pas encore posé » — et pourrait la reposer, ou croire que
   * son réglage n'a pas été enregistré.
   */
  it('ZERO veut dire toujours offerte, et c est un CHOIX', () => {
    const e = etatLivraisonOfferte(0);
    expect(e.pose).toBe(true);
    expect(e.phrase).toBe('toujours offerte');
    expect(e.phrase).not.toContain('pas encore');
  });

  it('un seuil se dit avec son montant', () => {
    const e = etatLivraisonOfferte(10000);
    expect(e.pose).toBe(true);
    expect(e.phrase).toContain(montant('10 000'));
  });

  it('une valeur qui n est pas un nombre retombe sur le livreur', () => {
    expect(etatLivraisonOfferte('10000').pose).toBe(false);
    expect(etatLivraisonOfferte(Number.NaN).pose).toBe(false);
  });

  it('la phrase n est jamais vide — un ecran ne doit pas afficher un trou', () => {
    for (const v of [null, undefined, 0, 10000, 'x', Number.NaN]) {
      expect(etatLivraisonOfferte(v).phrase.length).toBeGreaterThan(0);
      expect(etatMinimum(v).phrase.length).toBeGreaterThan(0);
    }
  });
});
