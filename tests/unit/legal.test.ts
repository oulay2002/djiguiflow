import { describe, expect, it } from 'vitest';
import {
  analyserDocument,
  DOCUMENTS_LEGAUX,
  lireDocument,
  trouverDocument,
} from '@/lib/legal';

/**
 * Le garde-fou des pages juridiques.
 *
 * CE QU'IL PROTÈGE. Les documents de `docs/legal/` sont des PROJETS : ils
 * portent des marqueurs `[À COMPLÉTER]` là où manquent le nom de l'exploitant,
 * son RCCM ou une décision commerciale non tranchée. Publiés tels quels, un
 * marchand — ou l'ARTCI — lit des mentions légales avec des trous dedans.
 *
 * POURQUOI CE FICHIER EXISTE PLUTÔT QU'UN DRAPEAU À LA MAIN. Une liste
 * `publiable: true` se bascule trop tôt, ou pas du tout. Le marqueur est donc
 * la seule source, et ces tests vérifient qu'il commande réellement les quatre
 * décisions qui en dépendent : bandeau, noindex, sitemap, pied de page.
 *
 * LE CAS DANGEREUX est le faux positif : un document tenu pour publiable alors
 * qu'il ne l'est pas. C'est celui qui met un trou en ligne, et c'est celui que
 * la plupart des cas ci-dessous éprouvent.
 */

describe('legal — le marqueur commande la publication', () => {
  it('un document sans marqueur est publiable', () => {
    const r = analyserDocument('# Titre\n\nUn texte complet, sans trou.\n');
    expect(r.publiable).toBe(true);
    expect(r.marqueursRestants).toBe(0);
  });

  it('un seul marqueur suffit à retenir tout le document', () => {
    const r = analyserDocument(
      '# Titre\n\nÉditeur : [À COMPLÉTER : nom de l’exploitant]\n',
    );
    expect(r.publiable).toBe(false);
    expect(r.marqueursRestants).toBe(1);
  });

  it('compte chaque marqueur, y compris plusieurs sur la même ligne', () => {
    const r = analyserDocument(
      'RCCM [À COMPLÉTER : rccm] et capital [À COMPLÉTER : capital]\n',
    );
    expect(r.marqueursRestants).toBe(2);
  });

  /**
   * L'ACCENT NE DOIT PAS DÉCIDER DE LA MISE EN LIGNE.
   *
   * Les fichiers écrivent « [À COMPLÉTER ». Si le garde-fou ne reconnaissait
   * que cette forme, un document réencodé — ou une ligne écrite « A COMPLETER »
   * un jour de clavier récalcitrant — passerait pour complet et partirait en
   * ligne avec son trou. Les deux formes sont donc retenues.
   */
  it('reconnaît le marqueur avec ou sans accent', () => {
    expect(analyserDocument('[À COMPLÉTER : x]').publiable).toBe(false);
    expect(analyserDocument('[A COMPLETER : x]').publiable).toBe(false);
    expect(analyserDocument('[à compléter : x]').publiable).toBe(false);
  });

  /**
   * Le compteur ne doit pas être juste une fois sur deux.
   *
   * Une expression régulière globale porte un `lastIndex` : réutilisée d'un
   * appel à l'autre, elle repart du milieu du texte précédent. Deux analyses
   * successives du même contenu doivent donner le même compte.
   */
  it('donne le même compte à chaque appel', () => {
    const texte = 'a [À COMPLÉTER : un] b [À COMPLÉTER : deux] c\n';
    expect(analyserDocument(texte).marqueursRestants).toBe(2);
    expect(analyserDocument(texte).marqueursRestants).toBe(2);
    expect(analyserDocument(texte).marqueursRestants).toBe(2);
  });
});

describe('legal — la note de rédaction ne va pas à l écran', () => {
  it('retire la note finale', () => {
    const r = analyserDocument(
      '# Titre\n\nLe texte qui compte.\n\n---\n\n> **Note de rédaction.**\n> À faire relire.\n',
    );
    expect(r.markdown).toContain('Le texte qui compte.');
    expect(r.markdown).not.toContain('Note de rédaction');
    expect(r.markdown).not.toContain('À faire relire');
  });

  /**
   * Un marqueur qui ne vit QUE dans la note ne doit pas retenir le document :
   * la note est retirée avant le comptage, sinon un document par ailleurs
   * complet resterait éternellement « projet » à cause de sa propre note.
   */
  it('ne compte pas les marqueurs situés dans la note retirée', () => {
    const r = analyserDocument(
      '# Titre\n\nTexte complet.\n\n---\n\n> Vérifier [À COMPLÉTER : le RCCM].\n',
    );
    expect(r.publiable).toBe(true);
    expect(r.marqueursRestants).toBe(0);
  });

  it('laisse intact un document sans note', () => {
    const brut = '# Titre\n\nTexte seul.';
    expect(analyserDocument(brut).markdown).toBe(brut);
  });

  /**
   * Une règle horizontale au MILIEU du document sépare deux sections ; elle ne
   * doit pas emporter tout ce qui la suit. Seule la note finale part.
   */
  it('ne tronque pas sur une règle horizontale intermédiaire', () => {
    const r = analyserDocument(
      '# Titre\n\nArticle 1.\n\n---\n\n## Article 2\n\nLe contenu de l’article 2.\n',
    );
    expect(r.markdown).toContain('Article 2');
    expect(r.markdown).toContain('contenu de l’article 2');
  });
});

describe('legal — le registre des documents', () => {
  it('expose cinq documents aux slugs uniques', () => {
    expect(DOCUMENTS_LEGAUX).toHaveLength(5);
    const slugs = DOCUMENTS_LEGAUX.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(5);
  });

  it('ne résout que les slugs connus', () => {
    expect(trouverDocument('cgv')?.fichier).toBe('cgv.md');
    expect(trouverDocument('inconnu')).toBeNull();
    expect(trouverDocument('../../.env')).toBeNull();
  });

  /**
   * Le fichier doit exister : un document déclaré mais absent ferait échouer le
   * build, et c'est bien ce qu'on veut — mais autant l'apprendre ici.
   */
  it('chaque document déclaré se lit réellement sur le disque', async () => {
    for (const doc of DOCUMENTS_LEGAUX) {
      const contenu = await lireDocument(doc);
      expect(contenu.markdown.length).toBeGreaterThan(500);
    }
  });

  /**
   * L'ÉTAT DU JOUR, ET IL DOIT ÊTRE FAUX.
   *
   * Les cinq documents portent aujourd'hui des marqueurs. Le jour où ce test
   * échoue, c'est que les trous ont été comblés : les pages deviennent alors
   * publiques d'elles-mêmes, et il faudra remplacer ce test par la vérification
   * inverse. Ce n'est pas un test à supprimer sans y penser — c'est le moment
   * de relire les cinq documents une dernière fois.
   */
  it('aucun document n est encore publiable — ils sont tous des projets', async () => {
    for (const doc of DOCUMENTS_LEGAUX) {
      const contenu = await lireDocument(doc);
      expect(contenu.publiable, `${doc.fichier} est devenu publiable`).toBe(false);
    }
  });
});
