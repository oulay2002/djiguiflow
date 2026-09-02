import { describe, expect, it } from 'vitest';
import { serieDesVentes, JOURS_DE_SERIE } from '@/lib/serieVentes';

/**
 * La carte « Evolution du CA · 7 jours » et son bandeau doivent dire LA MEME
 * CHOSE.
 *
 * Le bandeau affichait `caTotal` — toutes les commandes depuis l'ouverture —
 * au-dessus d'une courbe de sept jours. Mesure du 2 septembre 2026 sur le
 * compte de banc : 29 500 F annonces, courbe plate a zero.
 *
 * C'est le chiffre sur lequel un commercant juge sa semaine. Gonfle par son
 * historique, il masque une semaine creuse — exactement le moment ou il
 * faudrait qu'il s'en apercoive.
 */

const LE_2_SEPTEMBRE = new Date('2026-09-02T10:00:00.000Z');
const cmd = (jour: string, total: number) => ({ created_at: `${jour}T09:00:00.000Z`, total });

describe('la fenetre', () => {
  it('dessine sept jours, aujourd hui compris', () => {
    const { points } = serieDesVentes([], LE_2_SEPTEMBRE);
    expect(points).toHaveLength(JOURS_DE_SERIE);
  });

  it('LE DEFAUT : une commande plus ancienne que la fenetre n entre pas dans le total', () => {
    // Elle reste comptee dans `caTotal` cote route — c'est bien le CA depuis
    // le debut — mais elle n'a rien a faire dans une carte titree « 7 jours ».
    const { total } = serieDesVentes([cmd('2026-08-01', 29_500)], LE_2_SEPTEMBRE);
    expect(total).toBe(0);
  });

  it('temoin : la meme commande DANS la fenetre y entre bien', () => {
    // Sans lui, « n entre pas » serait vrai d'une fonction qui ne compte
    // jamais rien.
    const { total } = serieDesVentes([cmd('2026-09-02', 29_500)], LE_2_SEPTEMBRE);
    expect(total).toBe(29_500);
  });

  it('le septieme jour en arriere est INCLUS, le huitieme non', () => {
    // La borne est le genre de detail qui glisse d'un jour sans que personne
    // ne le voie.
    expect(serieDesVentes([cmd('2026-08-27', 100)], LE_2_SEPTEMBRE).total).toBe(100);
    expect(serieDesVentes([cmd('2026-08-26', 100)], LE_2_SEPTEMBRE).total).toBe(0);
  });
});

describe('le total ne peut pas diverger de la courbe', () => {
  it('il EST la somme des points dessines', () => {
    const { points, total } = serieDesVentes(
      [cmd('2026-08-31', 1_000), cmd('2026-09-01', 2_500), cmd('2026-09-01', 500)],
      LE_2_SEPTEMBRE,
    );
    expect(total).toBe(points.reduce((s, p) => s + p.ca, 0));
    expect(total).toBe(4_000);
  });

  it('et il compte les commandes autant que leur montant', () => {
    const { points } = serieDesVentes(
      [cmd('2026-09-01', 2_500), cmd('2026-09-01', 500)],
      LE_2_SEPTEMBRE,
    );
    const veille = points.find((p) => p.ca === 3_000);
    expect(veille?.nb).toBe(2);
  });
});

describe('ce qui ne doit pas faire tomber la courbe', () => {
  it('un montant absent vaut zero, il ne rend pas le total illisible', () => {
    const { total } = serieDesVentes(
      [{ created_at: '2026-09-01T09:00:00.000Z', total: null }, cmd('2026-09-01', 700)],
      LE_2_SEPTEMBRE,
    );
    expect(total).toBe(700);
  });

  it('une commande sans date est ignoree plutot que rangee au hasard', () => {
    const { total } = serieDesVentes([{ created_at: null, total: 9_999 }], LE_2_SEPTEMBRE);
    expect(total).toBe(0);
  });
});
