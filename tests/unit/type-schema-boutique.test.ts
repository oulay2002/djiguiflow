import { describe, expect, it } from 'vitest';

/**
 * Le type schema.org d'une boutique, déduit de son métier.
 *
 * CE QU'IL DÉCIDE. Google présente richement un `Restaurant`, un
 * `ClothingStore` ou une `Pharmacy` — horaires, avis, plat du jour. Il ne fait
 * presque rien d'un `LocalBusiness`, qui ne dit que « c'est un commerce ».
 *
 * Une boutique de vêtements tombait sur ce repli, alors même que la plateforme
 * venait d'être outillée pour la mode : pointures, tailles, coloris. Le
 * commerce qu'on sert le mieux était celui qu'on décrivait le moins bien.
 *
 * ÉTENDRE CETTE TABLE NE COÛTE RIEN QUAND ELLE SE TROMPE. Le repli
 * `LocalBusiness` reste toujours valide : c'est l'inverse d'une liste fermée
 * qui refuse ce qu'elle ne connaît pas. On peut donc y ajouter généreusement,
 * là où une liste qui *décide* d'un comportement demanderait de la prudence.
 *
 * ON N'AFFIRME QUE CE QUI EST VÉRIFIABLE. Le registre ne stocke ni adresse
 * postale ni horaires : les déclarer ferait sanctionner la page par Google
 * pour données non conformes. Le type, lui, vient du métier que le marchand a
 * saisi — il est donc sien, pas inventé.
 */

/** La table, telle que la porte le layout des fiches boutique. */
const TYPES_SCHEMA: Record<string, string> = {
  restaurant: 'Restaurant',
  restauration: 'Restaurant',
  maquis: 'Restaurant',
  fastfood: 'FastFoodRestaurant',
  'fast food': 'FastFoodRestaurant',
  boulangerie: 'Bakery',
  patisserie: 'Bakery',
  pharmacie: 'Pharmacy',
  supermarche: 'GroceryStore',
  superette: 'GroceryStore',
  epicerie: 'GroceryStore',
  alimentation: 'GroceryStore',
  mode: 'ClothingStore',
  vetement: 'ClothingStore',
  vetements: 'ClothingStore',
  'vetements et accessoire': 'ClothingStore',
  'vetements et accessoires': 'ClothingStore',
  'pret-a-porter': 'ClothingStore',
  friperie: 'ClothingStore',
  chaussure: 'ShoeStore',
  chaussures: 'ShoeStore',
  bijouterie: 'JewelryStore',
  cosmetique: 'HealthAndBeautyBusiness',
  cosmetiques: 'HealthAndBeautyBusiness',
  beaute: 'HealthAndBeautyBusiness',
  coiffure: 'HairSalon',
  electronique: 'ElectronicsStore',
  telephone: 'ElectronicsStore',
  librairie: 'BookStore',
  quincaillerie: 'HardwareStore',
};

function typeSchema(secteur: string): string {
  const cle = secteur
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '');
  return TYPES_SCHEMA[cle] ?? 'LocalBusiness';
}

describe('type schema.org d une boutique', () => {
  describe('les accents ne changent rien', () => {
    it.each([
      ['Épicerie', 'GroceryStore'],
      ['epicerie', 'GroceryStore'],
      ['Pâtisserie', 'Bakery'],
      ['patisserie', 'Bakery'],
      ['Vêtements', 'ClothingStore'],
      ['vetements', 'ClothingStore'],
    ])('« %s » donne %s', (secteur, attendu) => {
      expect(typeSchema(secteur)).toBe(attendu);
    });
  });

  describe('la mode, que la table ignorait', () => {
    // Le secteur réel de la boutique qui tombait sur le repli.
    it('« Vêtements et accessoire » n est plus un LocalBusiness muet', () => {
      expect(typeSchema('Vêtements et accessoire')).toBe('ClothingStore');
    });

    it.each([
      ['Mode', 'ClothingStore'],
      ['Chaussures', 'ShoeStore'],
      ['Friperie', 'ClothingStore'],
      ['Prêt-a-porter', 'ClothingStore'],
    ])('« %s » donne %s', (secteur, attendu) => {
      expect(typeSchema(secteur)).toBe(attendu);
    });
  });

  describe('la restauration reste intacte', () => {
    it.each([
      ['Restaurant', 'Restaurant'],
      ['Maquis', 'Restaurant'],
      ['Fast food', 'FastFoodRestaurant'],
    ])('« %s » donne %s', (secteur, attendu) => {
      expect(typeSchema(secteur)).toBe(attendu);
    });
  });

  describe('le repli ne refuse jamais rien', () => {
    // C'EST CE QUI AUTORISE D ÉTENDRE LA TABLE SANS PRUDENCE. Un métier
    // inconnu obtient un type valide, jamais une erreur ni une page sans
    // données structurées.
    it.each(['', 'Commerce', 'Vente de pneus', 'Garba express', '   ', '???'])(
      'un metier inconnu (%s) reste un LocalBusiness valide',
      (secteur) => {
        expect(typeSchema(secteur)).toBe('LocalBusiness');
      },
    );
  });
});
