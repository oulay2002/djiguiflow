import { describe, expect, it } from 'vitest';
import {
  analyserDocument,
  DOCUMENTS_LEGAUX,
  lireDocument,
  trouverDocument,
  dossierComplet,
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
   * LE MÊME DOCUMENT DOIT DONNER LE MÊME RÉSULTAT SOUS WINDOWS ET SOUS LINUX.
   *
   * En JavaScript, `.` ne franchit aucun terminateur de ligne — `\n`, mais
   * AUSSI `\r`. Sur un fichier en CRLF, `(?:>.*\n?)+` s'arrêtait donc après la
   * première ligne de la note, l'ancre `$` échouait, et la note restait
   * entière dans le document.
   *
   * Git stocke ces fichiers en LF et les rend en CRLF dans une copie de
   * travail Windows : la production allait bien — elle se construit sous
   * Linux — mais le poste de développement comptait un marqueur de plus, celui
   * qui vit dans la note. On croyait attendre une information qu'on possédait
   * déjà.
   *
   * Ce test échoue sur l'ancienne expression et passe sur la nouvelle. Sans
   * lui, la correction se déferait au premier remaniement, et personne ne le
   * verrait avant de publier une note « à supprimer avant publication ».
   */
  it('retire la note quelles que soient les fins de ligne', () => {
    const lf = '# Titre\n\nLe texte.\n\n---\n\n> **Note.**\n> Vérifier [À COMPLÉTER : le RCCM].\n> Et la relire.\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    for (const [nom, brut] of [['LF', lf], ['CRLF', crlf]] as const) {
      const r = analyserDocument(brut);
      expect(r.markdown, `${nom} : la note n’a pas été retirée`).not.toContain('Vérifier');
      expect(r.marqueursRestants, `${nom} : marqueur de la note compté à tort`).toBe(0);
      expect(r.publiable, `${nom} : document tenu pour incomplet à tort`).toBe(true);
    }
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
   * Le jour où ce test échoue, c'est que les trous ont été comblés : les cinq
   * pages deviennent alors publiques d'elles-mêmes, et il faudra le remplacer
   * par la vérification inverse. Ce n'est pas un test à supprimer sans y
   * penser — c'est le moment de relire les cinq documents une dernière fois.
   *
   * ── IL A DÉJÀ SERVI UNE FOIS, LE 28 AOÛT 2026 ──────────────────────────────
   *
   * Il portait alors sur CHAQUE document pris isolément. Renseigner la date de
   * mise en ligne a retiré le dernier marqueur des CGU, et ce test est tombé
   * en disant « cgu.md est devenu publiable » — exactement ce qu'il devait
   * faire.
   *
   * Ce que la chute a révélé n'était pas une erreur de saisie : des CGU
   * complètes seraient parties à l'indexation alors que les mentions légales
   * attendaient toujours l'adresse de l'exploitant. Des conditions opposables
   * publiées sans éditeur identifiable — le manquement même que les mentions
   * légales existent pour empêcher.
   *
   * D'où `dossierComplet()` : les cinq se publient d'un bloc, ou aucun. Ce test
   * porte donc désormais sur le dossier, et non plus sur chaque pièce.
   */
  it('le dossier n est pas encore publiable — il se publie d un bloc', async () => {
    expect(await dossierComplet(), 'le dossier est devenu publiable').toBe(false);
  });

  /**
   * ET IL FAUT QUE CE SOIT POUR UNE VRAIE RAISON.
   *
   * Sans ce second contrôle, `dossierComplet()` pourrait rendre `false` par
   * accident — un fichier illisible, un chemin faux — et l'on croirait le
   * dossier retenu par un trou à combler alors qu'il serait retenu par une
   * panne. Au moins un document doit porter un marqueur, et l'on veut savoir
   * lequel.
   */
  it('ce qui retient la publication est bien un marqueur, pas une panne', async () => {
    const restants = await Promise.all(
      DOCUMENTS_LEGAUX.map(async (doc) => ({
        fichier: doc.fichier,
        marqueurs: (await lireDocument(doc)).marqueursRestants,
      })),
    );
    const total = restants.reduce((s, r) => s + r.marqueurs, 0);
    const detail = restants.map((r) => `${r.fichier}=${r.marqueurs}`).join(', ');

    expect(total, `aucun marqueur nulle part (${detail})`).toBeGreaterThan(0);
  });
});
