import { describe, expect, it } from 'vitest';
import {
  croissanceRevenu,
  dansLaPeriode,
  fenetrePeriode,
  periodePrecedente,
} from '@/lib/periodeAnalyse';

/**
 * L'écran « Pilotage détaillé » et sa période.
 *
 * Le sélecteur ne filtrait RIEN : « Cette semaine », « Ce mois » et « Cette
 * année » rendaient les mêmes chiffres. Et la « croissance » coupait la liste
 * des commandes en deux PAR LE NOMBRE, pas par le temps.
 */

// Un mercredi. La semaine ISO commence le lundi 31 août 2026.
const MERCREDI_2_SEPT = new Date('2026-09-02T10:00:00.000Z');
const cmd = (jour: string, total: number) => ({ created_at: `${jour}T09:00:00.000Z`, total });

describe('les bornes de la periode', () => {
  it('la semaine commence le LUNDI', () => {
    const f = fenetrePeriode('week', MERCREDI_2_SEPT);
    expect(f.debut.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(f.debutPrecedent.toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('un DIMANCHE appartient a la semaine qui vient de s ecouler', () => {
    // `getUTCDay()` rend 0 le dimanche : sans correction il ouvrirait une
    // semaine a lui seul.
    const f = fenetrePeriode('week', new Date('2026-09-06T10:00:00.000Z'));
    expect(f.debut.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('le mois commence le 1er, et le precedent est le mois d avant', () => {
    const f = fenetrePeriode('month', MERCREDI_2_SEPT);
    expect(f.debut.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(f.debutPrecedent.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('janvier retombe sur decembre de l annee precedente', () => {
    // La borne la plus facile a rater.
    const f = fenetrePeriode('month', new Date('2026-01-15T10:00:00.000Z'));
    expect(f.debutPrecedent.toISOString().slice(0, 10)).toBe('2025-12-01');
  });

  it('l annee commence le 1er janvier', () => {
    const f = fenetrePeriode('year', MERCREDI_2_SEPT);
    expect(f.debut.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(f.debutPrecedent.toISOString().slice(0, 10)).toBe('2025-01-01');
  });
});

describe('le filtre, qui n existait pas', () => {
  const lignes = [
    cmd('2026-08-14', 5_000), // aout : hors semaine, hors mois
    cmd('2026-08-31', 1_000), // lundi de cette semaine
    cmd('2026-09-02', 2_000), // aujourd hui
  ];

  it('LE DEFAUT : la semaine ne retient que ses propres commandes', () => {
    const f = fenetrePeriode('week', MERCREDI_2_SEPT);
    expect(dansLaPeriode(lignes, f).map((l) => l.total)).toEqual([1_000, 2_000]);
  });

  it('le mois en retient une de moins que l annee', () => {
    const mois = dansLaPeriode(lignes, fenetrePeriode('month', MERCREDI_2_SEPT));
    const annee = dansLaPeriode(lignes, fenetrePeriode('year', MERCREDI_2_SEPT));
    expect(mois).toHaveLength(1);
    expect(annee).toHaveLength(3);
  });

  it('temoin : les trois periodes ne rendent PAS la meme chose', () => {
    // C'etait exactement le defaut — trois options, un seul resultat.
    const n = (p: 'week' | 'month' | 'year') =>
      dansLaPeriode(lignes, fenetrePeriode(p, MERCREDI_2_SEPT)).length;
    expect(new Set([n('week'), n('month'), n('year')]).size).toBe(3);
  });

  it('une date illisible est ecartee plutot que rangee au hasard', () => {
    const f = fenetrePeriode('year', MERCREDI_2_SEPT);
    expect(dansLaPeriode([{ created_at: null, total: 9 }], f)).toEqual([]);
  });
});

describe('la croissance, qui n en etait pas une', () => {
  it('compare la periode a CELLE D AVANT, et non deux moities de liste', () => {
    const lignes = [
      cmd('2026-08-25', 10_000), // semaine precedente
      cmd('2026-09-01', 15_000), // cette semaine
    ];
    const f = fenetrePeriode('week', MERCREDI_2_SEPT);
    expect(periodePrecedente(lignes, f).map((l) => l.total)).toEqual([10_000]);
    expect(croissanceRevenu(lignes, f)).toBeCloseTo(50, 5);
  });

  it('une baisse se dit, elle aussi', () => {
    const lignes = [cmd('2026-08-25', 10_000), cmd('2026-09-01', 4_000)];
    expect(croissanceRevenu(lignes, fenetrePeriode('week', MERCREDI_2_SEPT))).toBeCloseTo(-60, 5);
  });

  it('SANS RIEN A COMPARER elle rend null, jamais zero', () => {
    // Zero se lit « je stagne » ; la verite est « il n y a rien a comparer ».
    const lignes = [cmd('2026-09-01', 15_000)];
    expect(croissanceRevenu(lignes, fenetrePeriode('week', MERCREDI_2_SEPT))).toBeNull();
  });

  it('l ancien calcul aurait rendu un chiffre la ou il n y en a pas', () => {
    // Sept commandes du mois d aout, aucune cette semaine : couper la liste en
    // deux donnait « +68,2 % ». La bonne reponse est « rien a comparer ».
    const aout = [14, 15, 16, 17, 18, 19, 20].map((d) => cmd(`2026-08-${d}`, 1_000 * d));
    expect(croissanceRevenu(aout, fenetrePeriode('week', MERCREDI_2_SEPT))).toBeNull();
  });
});
