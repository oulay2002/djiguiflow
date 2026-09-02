import { describe, expect, it } from 'vitest';
import { composer, lieuDeLivraison } from '@/lib/contenus/hebdo';

/**
 * Ce que la publication hebdomadaire annonce comme zone desservie.
 *
 * L'appel a l'action disait « On livre a {zone} ». Or `zone` est le lieu de la
 * BOUTIQUE — le badge de l'annuaire — et non la liste des quartiers desservis,
 * qui vit dans `zones_livrees`.
 *
 * Une boutique de Cocody qui livre a Yopougon, Adjame et Plateau publiait donc
 * chaque semaine une promesse plus etroite que la verite, sur le contenu meme
 * qui doit lui amener des clients.
 */

describe('la liste des quartiers passe avant le lieu de la boutique', () => {
  it('LE DEFAUT : elle annoncait le quartier de la boutique', () => {
    expect(lieuDeLivraison('Yopougon, Adjamé, Plateau', 'Cocody'))
      .toBe('Yopougon, Adjamé, Plateau');
  });

  it('temoin : sans quartiers declares, le lieu de la boutique reste la meilleure reponse', () => {
    // Le champ s'est toujours appele « Zone de livraison » : le marchand qui
    // l'a rempli repondait bien a cette question-la.
    expect(lieuDeLivraison('', 'Cocody')).toBe('Cocody');
    expect(lieuDeLivraison(null, 'Cocody')).toBe('Cocody');
  });

  it('sans rien du tout, elle ne nomme aucun lieu', () => {
    expect(lieuDeLivraison(null, null)).toBe('');
    expect(lieuDeLivraison('   ', '  ')).toBe('');
  });
});

describe('une liste trop longue se tait plutot que de se tronquer', () => {
  it('elle rend la variante neutre, sans nommer de lieu', () => {
    // Couper au milieu publierait une promesse amputee : un client d'un
    // quartier coupe lirait qu'on ne va pas chez lui.
    const longue = 'Yopougon, Adjamé, Plateau, Marcory, Treichville, Koumassi, Abobo';
    expect(lieuDeLivraison(longue, 'Cocody')).toBe('');
  });

  it('et elle ne retombe PAS sur le quartier de la boutique', () => {
    // Le repli servirait ici a annoncer Cocody a une boutique qui a
    // explicitement declare livrer ailleurs. Se taire vaut mieux.
    expect(lieuDeLivraison('a'.repeat(80), 'Cocody')).not.toBe('Cocody');
  });

  it('temoin : une liste juste en dessous de la borne passe entiere', () => {
    // Sans lui, « se tait » serait vrai d'une fonction qui ne rend jamais rien.
    const courte = 'Yopougon, Adjamé, Plateau';
    expect(lieuDeLivraison(courte, 'Cocody')).toBe(courte);
  });
});

describe('la mise en forme, heritee de la zone', () => {
  it('une saisie en capitales ne part pas telle quelle dans la phrase', () => {
    // « ON LIVRE A YOPOUGON » a l'air d'un message automatique.
    expect(lieuDeLivraison('YOPOUGON, ADJAMÉ', '')).toBe('Yopougon, Adjamé');
  });

  it('le trait d union garde ses deux majuscules', () => {
    expect(lieuDeLivraison('', 'cocody - angré')).toBe('Cocody - Angré');
  });
});

/**
 * LE RACCORDEMENT, ET POURQUOI IL A SON PROPRE BANC.
 *
 * Les cas ci-dessus eprouvent une fonction pure. Le premier jet de ce
 * correctif la passait AUSSI, integralement au vert — parce que `composer`
 * continuait de donner `zone` a l'appel a l'action et n'employait jamais la
 * valeur calculee. Seul un avertissement de lint, « livraison defini mais
 * jamais utilise », l'a revele.
 *
 * Une fonction pure parfaite et mal cablee ne corrige rien. Ces trois cas
 * traversent la composition reelle.
 */
describe('la publication composee annonce les quartiers, pas le lieu de la boutique', () => {
  const composerTemoin = (zone: string, livraison: string) =>
    composer(
      { slug: 'boutique-banc', boutique_nom: 'Boutique du banc', note_moyenne: 0, avis: 0 },
      [{ slug: 'boutique-banc', produit: 'Attiéké poisson', quantite: 9 }],
      new Map([['attiéké poisson', { prix: 2500, photo: null }]]),
      'https://exemple.test',
      zone,
      livraison,
    );

  it('la legende nomme les quartiers desservis', () => {
    const c = composerTemoin('Cocody', 'Yopougon, Adjamé');
    expect(c?.legende).toContain('Yopougon, Adjamé');
  });

  it('et elle ne promet PLUS la livraison au quartier de la boutique', () => {
    // C'est le defaut d'origine : « On livre à Cocody » pour une boutique qui
    // livre ailleurs.
    const c = composerTemoin('Cocody', 'Yopougon, Adjamé');
    expect(c?.legende).not.toContain('Cocody');
  });

  it('mais le hashtag garde le lieu de la boutique — un tag veut UN endroit', () => {
    const c = composerTemoin('Cocody', 'Yopougon, Adjamé');
    expect(c?.hashtags).toContain('#Cocody');
  });
});
