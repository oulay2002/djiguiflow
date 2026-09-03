import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compteAAnnoncer,
  JOURS_OU_L_ON_REDIT_LE_COMPTE,
  MINUTES_AVANT_D_ANNONCER_UN_COMPTE,
} from '@/lib/compteSansBoutique';

/**
 * « QUELQU'UN A FRAPPÉ » — l'alerte qui n'existait pas.
 *
 * ── CE QU'ELLE A COÛTÉ AVANT D'EXISTER ─────────────────────────────────────
 *
 * Les 24 et 25 août 2026, deux personnes ont créé un compte. Aucune n'a jamais
 * eu de boutique : personne ne peut ouvrir la sienne à sa place. Elles sont
 * reparties, et **rien, nulle part, n'a dit qu'elles étaient venues** — on l'a
 * découvert dix jours plus tard, dans un entonnoir lu à la main.
 *
 * Ces gardes tiennent les trois décisions de la règle : quand on parle, quand
 * on se tait, et quand on cesse de parler.
 */

const MINUTE = 1;
const JOUR = 24 * 60;

describe('quand on annonce un compte', () => {
  it('se tait sur un compte qui vient de naitre', () => {
    expect(compteAAnnoncer({
      aUneBoutique: false,
      ageMinutes: MINUTES_AVANT_D_ANNONCER_UN_COMPTE - MINUTE,
    })).toBe(false);
  });

  it('parle des le delai franchi', () => {
    expect(compteAAnnoncer({
      aUneBoutique: false,
      ageMinutes: MINUTES_AVANT_D_ANNONCER_UN_COMPTE,
    })).toBe(true);
  });

  /**
   * LE CONTRÔLE QUI ÉTEINT L'ALERTE SANS RIEN À ACQUITTER.
   *
   * L'exploitant ouvre la boutique : l'alerte doit cesser d'elle-même, à
   * l'instant, et sans qu'il ait à cliquer sur quoi que ce soit. Une alerte
   * qu'on doit faire taire à la main finit par n'être plus lue.
   */
  it('se tait des que la boutique existe, EN PLEINE FENETRE D ALERTE', () => {
    /**
     * L'ÂGE EST CHOISI POUR QUE RIEN D'AUTRE NE PUISSE FAIRE TAIRE L'ALERTE.
     *
     * La première version de ce contrôle prenait 10 jours et 0 minute — deux
     * âges déjà hors fenêtre, donc silencieux pour une tout autre raison.
     * Retirer la ligne `aUneBoutique` du code laissait le test VERT : il ne
     * tenait rien. Trouvé en le mutant, pas en le relisant.
     */
    const enPleineFenetre = MINUTES_AVANT_D_ANNONCER_UN_COMPTE + 30;

    expect(compteAAnnoncer({ aUneBoutique: false, ageMinutes: enPleineFenetre })).toBe(true);
    expect(compteAAnnoncer({ aUneBoutique: true, ageMinutes: enPleineFenetre })).toBe(false);
  });

  it('redit tant que la piste est fraiche', () => {
    expect(compteAAnnoncer({
      aUneBoutique: false,
      ageMinutes: JOURS_OU_L_ON_REDIT_LE_COMPTE * JOUR,
    })).toBe(true);
  });

  /**
   * UNE PISTE DE PLUS DE TROIS JOURS N'EST PLUS UNE PISTE.
   *
   * La redire chaque matin jusqu'à la fin des temps ferait exactement ce que
   * cette veille se refuse à faire : occuper le canal avec ce qu'on ne
   * traitera pas. Si ce contrôle tombait, l'alerte deviendrait un bruit
   * quotidien permanent — et c'est ainsi qu'on cesse de lire une veille.
   */
  it('se tait au-dela, definitivement', () => {
    expect(compteAAnnoncer({
      aUneBoutique: false,
      ageMinutes: JOURS_OU_L_ON_REDIT_LE_COMPTE * JOUR + MINUTE,
    })).toBe(false);
    expect(compteAAnnoncer({ aUneBoutique: false, ageMinutes: 365 * JOUR })).toBe(false);
  });

  it('ne conclut rien d un age illisible', () => {
    expect(compteAAnnoncer({ aUneBoutique: false, ageMinutes: Number.NaN })).toBe(false);
  });
});

/**
 * L'ADRESSE NE S'ÉCRIT PAS DANS CE QUI RESTE.
 *
 * `anomalies_signalees` garde `reference`, `type` et `boutique` — et rien ne
 * la purge : c'est la mémoire qui empêche de redire deux fois la même chose.
 * `detail`, lui, ne fait que passer vers Telegram.
 *
 * L'adresse d'une personne qui n'est jamais devenue cliente n'a donc rien à
 * faire dans la référence. Ce garde relit le fichier, parce que l'inversion
 * est facile à écrire et invisible à la relecture.
 */
describe('la donnee personnelle reste du cote qui s efface', () => {
  const source = readFileSync('src/app/api/internal/veille/chaines/route.ts', 'utf8');

  const bloc = source.slice(
    source.indexOf("type: 'compte-sans-boutique'"),
    source.indexOf("// ---- 5. LE COMPTE WASENDER"),
  );

  it('le bloc a bien ete trouve', () => {
    // Un bloc vide passerait au vert sans rien verifier.
    expect(bloc.length).toBeGreaterThan(200);
  });

  it('la reference porte l identifiant, jamais l adresse', () => {
    const ligne = bloc.split('\n').find((l) => l.includes('reference:')) ?? '';
    expect(ligne).toContain('String(u.id)');
    expect(ligne).not.toContain('u.email');
  });

  it('l adresse ne vit que dans le detail, qui ne se conserve pas', () => {
    const detail = bloc.slice(bloc.indexOf('detail:'));
    expect(detail).toContain('u.email');
  });
});

/**
 * L'ÉCRAN ÉCRIT, L'ALERTE LIT — ET LES DEUX DOIVENT PARLER DES MÊMES CLÉS.
 *
 * ── LE DÉFAUT QUE CE BLOC ÉCARTE ───────────────────────────────────────────
 *
 * `business_name` est écrit par `/register` et par l'écran Profil, et **lu par
 * personne** côté serveur : la route de provisioning prend son nom et son slug
 * dans son corps de requête. C'est un réglage mort — exactement ce que les
 * PR #151 et #154 ont retiré ailleurs.
 *
 * L'écran « Votre boutique, pas encore » écrit désormais trois champs. S'ils
 * n'étaient lus nulle part, on aurait ajouté trois morts de plus. C'est
 * l'alerte `compte-sans-boutique` qui les lit, et ces gardes tiennent la
 * jonction : un renommage d'un seul côté la briserait **en silence**, puisque
 * rien n'échoue quand une clé absente rend `undefined`.
 */
describe('ce que l ecran ecrit est bien ce que l alerte lit', () => {
  const ECRAN = readFileSync('src/components/dashboard/SansBoutique.tsx', 'utf8');
  const REGLE = readFileSync('src/lib/demandeBoutique.ts', 'utf8');
  const VEILLE = readFileSync('src/app/api/internal/veille/chaines/route.ts', 'utf8');

  const CLES = ['business_name', 'phone', 'zone_livree'];

  it.each(CLES)('« %s » est ecrite par l ecran et lue par la regle', (cle) => {
    // ANCRE A GAUCHE, SINON LE PIEGE DU SOUS-MOT. « telephone: » contient
    // « phone: » : sans cette borne, renommer la cle d'un seul cote laissait
    // ce garde vert. Trouve en le mutant, pas en le relisant.
    expect(ECRAN).toMatch(new RegExp(`(^|[^A-Za-z0-9_])${cle}:`, 'm'));
    expect(REGLE).toMatch(new RegExp(`m\\.${cle}(?![A-Za-z0-9_])`, 'm'));
  });

  it('l ecran passe par la regle plutot que d assainir a sa facon', () => {
    expect(ECRAN).toContain("from '@/lib/demandeBoutique'");
    expect(ECRAN).toContain('normaliserDemande(');
  });

  /**
   * ET L'ALERTE LES PORTE VRAIMENT.
   *
   * Sans cette ligne, les trois champs seraient écrits, lus par une fonction
   * pure… et jamais montrés à personne. La chaîne doit aller jusqu'au bout.
   */
  it('l alerte porte ce que le marchand a dit', () => {
    expect(VEILLE).toContain('resumeDemande(lireDemande(u.user_metadata))');

    const bloc = VEILLE.slice(
      VEILLE.indexOf("type: 'compte-sans-boutique'"),
      VEILLE.indexOf('// ---- 5. LE COMPTE WASENDER'),
    );
    expect(bloc.length).toBeGreaterThan(200);
    expect(bloc).toContain('dit');
  });
});
