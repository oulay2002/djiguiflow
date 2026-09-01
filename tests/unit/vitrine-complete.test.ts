import { describe, expect, it } from 'vitest';
import { etatVitrine } from '@/lib/vitrineComplete';

/**
 * « La boutique répond-elle aux questions du client ? »
 *
 * ── LES DEUX SENS, ET LE SECOND EST LE PLUS FACILE À RATER ─────────────────
 *
 * Trop laxiste, l'indicateur dit « tout va bien » à une vitrine muette — et le
 * marchand ne vendra pas sans jamais savoir pourquoi.
 *
 * Trop exigeant, il réclame des choses qui ne regardent pas le client — un
 * minimum de commande, un seuil de livraison offerte — et devient une liste de
 * fonctions à cocher. **Un indicateur qui réclame tout ne se lit plus.**
 *
 * Ces tests tiennent la ligne : ce que le CLIENT a besoin de savoir, et rien
 * d'autre.
 */

const pleine = {
  description: 'Cuisine ivoirienne à Cocody',
  horaires: { lun: '08:00-20:00' },
  delai_livraison: '30 à 45 min',
  zones_livrees: ['Cocody', 'Riviera'],
  paiements_acceptes: ['especes', 'wave'],
  mode_recuperation: 'livraison',
};

describe('une vitrine qui répond à tout', () => {
  it('ne manque rien', () => {
    const e = etatVitrine(pleine);
    expect(e.manquantes).toEqual([]);
    expect(e.posees).toBe(e.total);
  });
});

describe('une vitrine muette', () => {
  const e = etatVitrine({ mode_recuperation: 'livraison' });

  it('signale chaque question sans réponse', () => {
    expect(e.posees).toBe(0);
    expect(e.manquantes.map((m) => m.cle).sort()).toEqual(
      ['delai_livraison', 'description', 'horaires', 'paiements_acceptes', 'zones_livrees'],
    );
  });

  it('chaque manque porte une QUESTION, pas un nom de champ', () => {
    for (const m of e.manquantes) {
      expect(m.question).toMatch(/\?$/);
      expect(m.question).not.toContain('_');
      expect(m.sinon.length).toBeGreaterThan(10);
    }
  });
});

describe('ce qui NE compte PAS, et c est deliberé', () => {
  it('NI LE MINIMUM NI LA LIVRAISON OFFERTE : le client n en a pas besoin', () => {
    const cles = etatVitrine({ mode_recuperation: 'livraison' }).manquantes.map((m) => m.cle);
    expect(cles).not.toContain('commande_minimum');
    expect(cles).not.toContain('livraison_offerte_des');
  });

  it('une boutique complète le reste sans poser de minimum', () => {
    expect(etatVitrine({ ...pleine, commande_minimum: null }).manquantes).toEqual([]);
  });
});

describe('le délai dépend du mode de récupération', () => {
  it('une boutique de RETRAIT ne se voit pas reclamer un delai de livraison', () => {
    const cles = etatVitrine({ mode_recuperation: 'retrait' }).manquantes.map((m) => m.cle);
    expect(cles).toContain('delai_preparation_min');
    expect(cles).not.toContain('delai_livraison');
    // Ni les zones : elle ne livre pas, elle n en aura jamais.
    expect(cles).not.toContain('zones_livrees');
  });

  it('tout ce qui n est pas « retrait » livre — meme une valeur absente', () => {
    const cles = etatVitrine({}).manquantes.map((m) => m.cle);
    expect(cles).toContain('delai_livraison');
  });
});

describe('ce qui compte comme rempli', () => {
  it('une chaine d espaces ne repond a aucune question', () => {
    expect(etatVitrine({ ...pleine, description: '   ' }).manquantes.map((m) => m.cle))
      .toEqual(['description']);
  });

  it('UN TABLEAU VIDE NON PLUS — le piege des colonnes de listes', () => {
    expect(etatVitrine({ ...pleine, zones_livrees: [] }).manquantes.map((m) => m.cle))
      .toEqual(['zones_livrees']);
  });

  it('un objet horaires vide non plus', () => {
    expect(etatVitrine({ ...pleine, horaires: {} }).manquantes.map((m) => m.cle))
      .toEqual(['horaires']);
  });

  it('un zero n est pas un delai', () => {
    expect(etatVitrine({ mode_recuperation: 'retrait', delai_preparation_min: 0 })
      .manquantes.map((m) => m.cle)).toContain('delai_preparation_min');
  });
});
