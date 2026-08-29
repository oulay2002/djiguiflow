import { describe, it, expect } from 'vitest';
import { suggestionsPanier } from '@/lib/suggestionsPanier';

const a = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nom: id, categorie: 'Plats', prix: 1000, ...extra,
});

const noms = (l: { id: string }[]) => l.map(x => x.id);

describe('suggestionsPanier — ce qu on ne propose jamais', () => {
  it('ne propose pas un article deja au panier', () => {
    const r = suggestionsPanier({ catalogue: [a('x'), a('y')], auPanier: ['x'], combien: 3 });
    expect(noms(r)).toEqual(['y']);
  });

  /**
   * `stock === null` VEUT DIRE « LE MARCHAND NE COMPTE PAS », jamais zero.
   * Confondre les deux viderait la vitrine des boutiques qui ne suivent pas
   * leur stock — c'est-a-dire la plupart.
   */
  it('garde un article dont le stock n est pas suivi', () => {
    const r = suggestionsPanier({
      catalogue: [a('suivi', { stock: 0 }), a('nonSuivi', { stock: null }), a('absent')],
      auPanier: [], combien: 5,
    });
    expect(noms(r)).toEqual(['nonSuivi', 'absent']);
  });

  it('ne propose pas un article epuise', () => {
    const r = suggestionsPanier({ catalogue: [a('vide', { stock: 0 })], auPanier: [], combien: 3 });
    expect(r).toEqual([]);
  });

  /**
   * UN PRIX A ZERO EST UN DEFAUT, PAS UNE OFFRE — c'est le defaut ferme le
   * 29 aout 2026. On ne met surtout pas en avant un article que le marchand
   * livrerait gratuitement sans le savoir.
   */
  it('ne met pas en avant un article a prix nul ou absent', () => {
    const r = suggestionsPanier({
      catalogue: [a('gratuit', { prix: 0 }), a('sansPrix', { prix: null }), a('normal')],
      auPanier: [], combien: 5,
    });
    expect(noms(r)).toEqual(['normal']);
  });

  /**
   * UNE SUGGESTION S AJOUTE D UN SEUL GESTE. Un article qui exige une pointure
   * ou une taille ne peut donc pas y figurer : le bouton enverrait une variante
   * vide et le client recevrait une taille qu il n a pas choisie.
   */
  it('ne propose pas un article a declinaison', () => {
    const r = suggestionsPanier({
      catalogue: [
        a('chaussure', { attributNom: 'Pointure', attributValeurs: ['39', '41'] }),
        a('sansChoix', { attributNom: 'Pointure', attributValeurs: [] }),
        a('simple'),
      ],
      auPanier: [], combien: 5,
    });
    expect(noms(r)).toEqual(['sansChoix', 'simple']);
  });

  /**
   * UN GROUPE = UN SEUL ARTICLE EN PLUSIEURS COLORIS. Proposer trois couleurs
   * du meme t-shirt occupe la place de trois suggestions pour n'en dire qu'une.
   */
  it('ne propose qu un article par groupe', () => {
    const r = suggestionsPanier({
      catalogue: [
        a('rouge', { groupe: 'tshirt' }),
        a('bleu', { groupe: 'tshirt' }),
        a('autre'),
      ],
      auPanier: [], combien: 5,
    });
    expect(noms(r)).toEqual(['rouge', 'autre']);
  });
});

describe('suggestionsPanier — panier vide', () => {
  /**
   * LE MENU DU JOUR PASSE DEVANT : c'est le seul signal de mise en avant que
   * le marchand nous donne. On ne devine pas a sa place.
   */
  it('met le menu du jour en tete', () => {
    const r = suggestionsPanier({
      catalogue: [a('ordinaire'), a('duJour', { duJour: true })],
      auPanier: [], combien: 2,
    });
    expect(noms(r)).toEqual(['duJour', 'ordinaire']);
  });

  it('respecte le nombre demande', () => {
    const r = suggestionsPanier({
      catalogue: [a('1'), a('2'), a('3'), a('4')], auPanier: [], combien: 2,
    });
    expect(r).toHaveLength(2);
  });
});

describe('suggestionsPanier — panier commence', () => {
  /**
   * ON COMPLETE, ON NE REPETE PAS. Un client qui a pris un plat gagne a se voir
   * proposer une boisson ; lui proposer un second plat de la meme categorie
   * ressemble a du remplissage.
   */
  it('propose d abord une autre categorie que celles du panier', () => {
    const r = suggestionsPanier({
      catalogue: [
        a('platB', { categorie: 'Plats' }),
        a('boisson', { categorie: 'Boissons' }),
      ],
      auPanier: ['platA'],
      categoriesAuPanier: ['Plats'],
      combien: 2,
    });
    expect(noms(r)).toEqual(['boisson', 'platB']);
  });

  it('retombe sur la meme categorie quand il n y a rien d autre', () => {
    const r = suggestionsPanier({
      catalogue: [a('platB', { categorie: 'Plats' })],
      auPanier: ['platA'], categoriesAuPanier: ['Plats'], combien: 2,
    });
    expect(noms(r)).toEqual(['platB']);
  });
});

describe('suggestionsPanier — determinisme', () => {
  /**
   * AUCUN HASARD. Un tirage aleatoire ferait diverger le rendu serveur et le
   * rendu navigateur — l'hydratation casse — et rendrait ces tests instables.
   */
  it('rend deux fois le meme resultat', () => {
    const cat = [a('1'), a('2', { duJour: true }), a('3')];
    const un = suggestionsPanier({ catalogue: cat, auPanier: [], combien: 2 });
    const deux = suggestionsPanier({ catalogue: cat, auPanier: [], combien: 2 });
    expect(noms(un)).toEqual(noms(deux));
  });

  it('rend une liste vide plutot que de lever sur un catalogue vide', () => {
    expect(suggestionsPanier({ catalogue: [], auPanier: [], combien: 3 })).toEqual([]);
  });
});
