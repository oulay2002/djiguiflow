import { describe, expect, it } from 'vitest';
import { aplatir } from '@/lib/relances';

/**
 * L'appariement d'un article à son prix, sur le chemin de l'assistante.
 *
 * ── CE QUE CE FICHIER PROTÈGE ──────────────────────────────────────────────
 *
 * `/api/commandes/sync` reçoit les articles en **texte libre**, écrits par
 * l'assistante d'après ce que le client a dit. Elle retrouve leur prix dans le
 * catalogue par correspondance de nom, et écrivait :
 *
 *     prix_unitaire: priceMap.get(p.nom.toLowerCase()) ?? 0
 *
 * Une mise en minuscules ne rapproche pas « Café touba » de « cafe touba », ni
 * « Poulet  DG » de « Poulet DG ». La ligne tombait alors dans le `?? 0` et
 * s'enregistrait à **zéro franc**, en silence — le marchand découvrait un
 * détail de commande à 0 F sans savoir pourquoi.
 *
 * `prix_unitaire` est NOT NULL en base : on ne peut pas écrire « je ne sais
 * pas ». Le zéro subsiste donc quand rien ne correspond, mais il est désormais
 * journalisé — et surtout, il se produit beaucoup moins souvent.
 *
 * ── CE QU'ON NE FAIT PAS ───────────────────────────────────────────────────
 *
 * On ne devine pas les pluriels ni les à-peu-près. « Poulet » et « Poulets »
 * peuvent être deux articles d'un même marchand, et apparier au plus proche
 * ferait payer un article pour un autre — un défaut pire que celui qu'on
 * corrige.
 */

/** Le catalogue, indexé comme la route le fait. */
function catalogue(entrees: [string, number][]): Map<string, number> {
  return new Map(entrees.map(([nom, prix]) => [aplatir(nom), prix]));
}

const CATALOGUE = catalogue([
  ['Café touba', 500],
  ['Poulet DG', 4500],
  ['Attiéké poisson', 2000],
]);

const prixDe = (nom: string) => CATALOGUE.get(aplatir(nom));

describe('ce que l’assistante écrit retrouve son prix', () => {
  it.each([
    ['à l’identique', 'Café touba', 500],
    ['sans accent', 'Cafe touba', 500],
    ['tout en minuscules', 'café touba', 500],
    ['tout en majuscules', 'CAFÉ TOUBA', 500],
    ['avec des espaces en trop', '  Poulet   DG  ', 4500],
    ['avec une ponctuation parasite', 'Attiéké-poisson', 2000],
  ])('%s', (_cas, ecrit, attendu) => {
    expect(prixDe(ecrit), `« ${ecrit} » n’a pas retrouvé son prix`).toBe(attendu);
  });

  /**
   * LE CAS QUI A MOTIVÉ LE CORRECTIF.
   *
   * Avec `toLowerCase()` seul, « Cafe touba » — sans accent, comme l'écrit un
   * client pressé et comme le recopie l'assistante — ne trouvait rien et
   * partait à 0 F.
   */
  it('l’ancienne règle échouait là où la nouvelle réussit', () => {
    const ancien = new Map([['café touba', 500]]);
    expect(ancien.get('Cafe touba'.toLowerCase()), 'l’ancienne règle trouvait ?').toBeUndefined();
    expect(prixDe('Cafe touba')).toBe(500);
  });
});

describe('ce qui ne doit PAS être apparié', () => {
  /**
   * Un article absent reste absent : la route le journalise et l'enregistre à
   * zéro, faute de pouvoir écrire « inconnu ». Ce qu'on interdit, c'est de le
   * rapprocher d'un autre article — le client paierait alors le prix d'autre
   * chose.
   */
  it('un article qui n’est pas au catalogue ne trouve rien', () => {
    expect(prixDe('Pizza quatre fromages')).toBeUndefined();
  });

  it('le pluriel n’est pas deviné', () => {
    expect(prixDe('Poulets DG')).toBeUndefined();
  });

  it('un nom vide ne s’apparie à rien', () => {
    expect(prixDe('')).toBeUndefined();
    expect(prixDe('   ')).toBeUndefined();
  });

  /**
   * DEUX ARTICLES NE DOIVENT PAS SE CONFONDRE APRÈS APLATISSEMENT.
   *
   * Si un marchand vend « Café » et « Cafe », l'aplatissement les réunit et
   * l'un écrase l'autre dans la table. C'est le prix assumé de la tolérance —
   * et il est bien plus faible que celui du zéro silencieux. Ce test existe
   * pour que personne ne le découvre par surprise.
   */
  it('deux noms qui ne diffèrent que par l’accent se confondent — assumé', () => {
    const ambigu = catalogue([['Café', 500], ['Cafe', 900]]);
    expect(ambigu.size, 'les deux ont survécu, la note est à revoir').toBe(1);
    expect(ambigu.get(aplatir('Café'))).toBe(900);
  });
});
