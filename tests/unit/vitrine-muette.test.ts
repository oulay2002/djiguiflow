import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { etatVitrine, vitrineASignaler, vitrineMuette } from '@/lib/vitrineComplete';

/**
 * UNE VITRINE EN LIGNE ET MUETTE — L'ANGLE MORT QUE L'EXCLUSION A CREE.
 *
 * ── CE QUI L'A RENDU VISIBLE ───────────────────────────────────────────────
 *
 * La sonde « vitrine complete » existe depuis le 1er septembre 2026, et
 * l'entonnoir la lit depuis le 3. Mais l'entonnoir EXCLUT nos propres boutiques
 * — a dessein, et c'est juste : les compter ferait croire a une activation
 * parfaite, puisque c'est nous qui les avons remplies.
 *
 * L'exclusion, juste pour un ratio, a ferme le seul oeil capable de voir
 * qu'une boutique de la plateforme est PUBLIQUEMENT EN LIGNE et muette.
 * Mesure du 3 septembre 2026 : Rose Monde, `actif = true`, repondait a
 * **1 question sur 5**. Elle ne disait ni ce qu'elle vend, ni ou elle livre,
 * ni en combien de temps, ni comment on la paie.
 *
 * C'est le motif du filet qui cree son angle mort : on corrige un comptage en
 * ecartant des lignes, et les lignes ecartees sortent aussi de la surveillance.
 *
 * ── POURQUOI « MUETTE » ET NON « INCOMPLETE » ──────────────────────────────
 *
 * Une boutique incomplete vend quand meme, et `vitrineComplete` prend soin de
 * ne jamais l'en empecher. Alerter des qu'une reponse manque ferait sonner la
 * veille sur toute boutique neuve, le jour meme de son ouverture — et une
 * veille qu'on bruite est une veille qu'on cesse de lire.
 *
 * Le seuil separe donc deux etats differents : celle a qui il manque une
 * finition, et celle qui ne dit RIEN. C'est ce que ces controles tiennent.
 */

/** Rose Monde, telle que la production la portait le 3 septembre 2026. */
const roseMonde = {
  description: null,
  mode_recuperation: 'livraison',
  delai_livraison: null,
  zones_livrees: null,
  paiements_acceptes: null,
  horaires: { lun: '08:00-20:00' },
};

/** Chez Zahara, le meme jour : elle repond a tout. */
const zahara = {
  description: 'Restaurant de cuisine ivoirienne',
  mode_recuperation: 'livraison',
  delai_livraison: '30 a 45 minutes',
  zones_livrees: ['Cocody', 'Riviera'],
  paiements_acceptes: ['Espèces', 'Wave'],
  horaires: { lun: '08:00-20:00' },
};

describe('la vitrine muette, telle que la production la portait', () => {
  it('declare Rose Monde muette — 1 reponse sur 5', () => {
    const etat = etatVitrine(roseMonde);
    expect(etat.posees).toBe(1);
    expect(etat.total).toBe(5);
    expect(vitrineMuette(etat)).toBe(true);
  });

  it('laisse Chez Zahara tranquille — elle repond a tout', () => {
    const etat = etatVitrine(zahara);
    expect(etat.posees).toBe(5);
    expect(vitrineMuette(etat)).toBe(false);
  });
});

describe('le seuil separe « muette » de « perfectible »', () => {
  /**
   * LE CONTROLE QUI TIENT TOUTE LA DECISION.
   *
   * Si la regle devenait « il manque quelque chose », ce cas passerait au
   * rouge — et la veille sonnerait pour une boutique qui dit ce qu'elle vend,
   * ou elle livre, en combien de temps et comment on la paie. C'est le
   * controle a muter en premier pour verifier que ce fichier tient encore.
   */
  it('se tait sur une boutique a qui il ne manque QUE les horaires — 4 sur 5', () => {
    const etat = etatVitrine({ ...zahara, horaires: null });
    expect(etat.posees).toBe(4);
    expect(vitrineMuette(etat)).toBe(false);
  });

  it('se tait encore a 3 reponses sur 5 : c est une finition, pas un silence', () => {
    const etat = etatVitrine({ ...zahara, horaires: null, paiements_acceptes: null });
    expect(etat.posees).toBe(3);
    expect(vitrineMuette(etat)).toBe(false);
  });

  it('parle des que la moitie manque — 2 reponses sur 5', () => {
    const etat = etatVitrine({
      ...zahara, horaires: null, paiements_acceptes: null, zones_livrees: null,
    });
    expect(etat.posees).toBe(2);
    expect(vitrineMuette(etat)).toBe(true);
  });

  it('parle sur une boutique qui ne dit rien du tout — 0 sur 5', () => {
    const etat = etatVitrine({ mode_recuperation: 'livraison' });
    expect(etat.posees).toBe(0);
    expect(vitrineMuette(etat)).toBe(true);
  });
});

/**
 * LE MODE DE RECUPERATION CHANGE LE TOTAL, DONC LE SEUIL.
 *
 * Une boutique de retrait ne se voit pas reclamer un delai de livraison
 * qu'elle n'aura jamais : elle a QUATRE questions, pas cinq. Un seuil ecrit en
 * dur — « moins de 3 reponses » — la jugerait sur une echelle qui n'est pas la
 * sienne. La regle se calcule donc sur `total`, jamais sur un nombre choisi.
 */
describe('une boutique de retrait est jugee sur ses propres questions', () => {
  const retrait = {
    description: 'Atelier de couture',
    mode_recuperation: 'retrait',
    delai_preparation_min: 45,
    paiements_acceptes: ['Espèces'],
    horaires: { lun: '08:00-20:00' },
  };

  it('compte quatre questions, pas cinq', () => {
    expect(etatVitrine(retrait).total).toBe(4);
  });

  it('se tait a 2 reponses sur 4', () => {
    const etat = etatVitrine({ ...retrait, paiements_acceptes: null, horaires: null });
    expect(etat.posees).toBe(2);
    expect(vitrineMuette(etat)).toBe(false);
  });

  it('parle a 1 reponse sur 4', () => {
    const etat = etatVitrine({
      ...retrait, delai_preparation_min: null, paiements_acceptes: null, horaires: null,
    });
    expect(etat.posees).toBe(1);
    expect(vitrineMuette(etat)).toBe(true);
  });
});

/**
 * CE QUE LA VEILLE DOIT DIRE, ET CE QU'ELLE DOIT TAIRE.
 *
 * Ces trois conditions portent tout le sens du contrôle, et elles sont
 * remontées dans la règle précisément pour être ici. Laissées dans la boucle
 * de la route, elles auraient été les seules lignes qu'aucun test n'atteint —
 * le défaut exact du 2 septembre 2026, où une fonction parfaitement éprouvée
 * n'était pas appelée au bon endroit.
 */
describe('la veille ne parle que d une vitrine EN LIGNE et muette', () => {
  const muette = etatVitrine(roseMonde);
  const complete = etatVitrine(zahara);

  it('parle de Rose Monde : en ligne, et muette', () => {
    expect(vitrineASignaler({ enLigne: true, deBanc: false, etat: muette })).toBe(true);
  });

  /**
   * ATELIER TÉMOIN, LE 3 SEPTEMBRE 2026 : `actif = false`, et 1 réponse sur 5.
   *
   * Aussi muette que Rose Monde, et pourtant ce n'est rien du tout — personne
   * ne voit sa page. Sans cette ligne, la veille annoncerait une urgence pour
   * une boutique en préparation, et le contrôle perdrait sa crédibilité au
   * premier passage.
   */
  it('se tait sur une boutique hors ligne, MEME MUETTE', () => {
    expect(vitrineASignaler({ enLigne: false, deBanc: false, etat: muette })).toBe(false);
  });

  it('se tait sur une boutique de banc, MEME EN LIGNE ET MUETTE', () => {
    expect(vitrineASignaler({ enLigne: true, deBanc: true, etat: muette })).toBe(false);
  });

  it('se tait sur une boutique en ligne qui repond a tout', () => {
    expect(vitrineASignaler({ enLigne: true, deBanc: false, etat: complete })).toBe(false);
  });
});

/**
 * LE GARDE QUI RELIT LA ROUTE ELLE-MÊME.
 *
 * Les contrôles ci-dessus éprouvent la règle. Ils resteraient tous verts si la
 * veille cessait de l'appeler, ou si elle reprenait la décision à la main dans
 * sa boucle — **c'est exactement ce qui s'est produit le 2 septembre 2026** :
 * `porteSupport` était parfaitement testée, et l'écran ne l'appelait pas au bon
 * endroit. Le défaut a vécu sous une suite verte.
 *
 * Ces trois contrôles relisent donc le texte du bloc « 4 quater », comme
 * `contact-support` relit celui de la porte.
 */
describe('la veille ne peut plus decider a la place de la regle', () => {
  const ROUTE = readFileSync('src/app/api/internal/veille/chaines/route.ts', 'utf8');

  /** Le bloc du contrôle, isolé de tout le reste du fichier. */
  const BLOC = (() => {
    const debut = ROUTE.indexOf('// ---- 4 quater.');
    const fin = ROUTE.indexOf('// ---- 4 ter.');
    // Un témoin : sur un bloc renommé, les deux index vaudraient -1 et les
    // contrôles passeraient sur une chaîne vide sans rien prouver.
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
    return ROUTE.slice(debut, fin);
  })();

  it('la regle est importee, et le bloc l appelle', () => {
    expect(ROUTE).toContain("from '@/lib/vitrineComplete'");
    expect(BLOC).toContain('vitrineASignaler({');
  });

  it('elle recoit les DEUX conditions, pas seulement l etat', () => {
    const appel = BLOC.slice(BLOC.indexOf('vitrineASignaler({'));
    const arguments_ = appel.slice(0, appel.indexOf('}'));
    expect(arguments_).toContain('enLigne');
    expect(arguments_).toContain('deBanc');
  });

  /**
   * LE CONTRÔLE QUI TIENT TOUT.
   *
   * Un `continue` sur `actif` ou `essai` dans cette boucle, et la décision
   * serait redevenue locale — invisible à toute mutation de la règle, donc
   * hors de portée de chaque test de ce fichier.
   */
  it('aucun ecart n est decide dans la boucle', () => {
    const ecarts = BLOC.split('\n').filter(
      (l) => l.includes('continue') && !l.trim().startsWith('//'),
    );

    // Deux, et deux seulement : le slug vide, et la règle.
    expect(ecarts).toHaveLength(2);
    expect(ecarts[0]).toContain('!slug');
    expect(ecarts[1]).toContain('vitrineASignaler');
  });
});
