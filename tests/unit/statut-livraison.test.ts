import { describe, expect, it } from 'vitest';
import {
  STATUT_LIVREE,
  VALEURS_LIVREE,
  canoniserStatutLivraison,
  estLivree,
} from '@/lib/livraison';

/**
 * Le vocabulaire de `commandes.statut_livraison`.
 *
 * CE QUI A MOTIVE CES TESTS. La colonne n'est tenue par aucune contrainte :
 * n8n y ecrit ce que le workflow a produit. La production du 25 aout 2026
 * portait TROIS ORTHOGRAPHES pour un seul etat — « livre » (21 commandes),
 * « livree » (4), « livrée » (2) — et trois lectures comparaient a l'egalite
 * stricte `= 'livre'`. Six commandes leur etaient invisibles, dont pour la
 * veille qui repere les livraisons dont les frais n'ont jamais ete annonces au
 * client, et pour le compteur de courses par livreur — lequel avait deja
 * affiche des chiffres faux une fois.
 *
 * Rien n'etait casse au moment de la decouverte : l'ecriture avait converge
 * sur « livre », et la veille ne regarde qu'une fenetre recente. C'est
 * precisement ce qui rendait le defaut dangereux — il attendait le prochain
 * chemin qui ecrirait autrement.
 *
 * LES DEUX MOITIES COMPTENT AUTANT. Reconnaitre une livraison quelle que soit
 * son orthographe, ET ne jamais en inventer une. Marquer « livree » une
 * commande au statut vide fermerait une course que personne n'a portee : le
 * gerant cesserait de la voir en retard, et le client attendrait sans que rien
 * ne le signale.
 */
describe('statut de livraison', () => {
  describe('reconnaitre une livraison', () => {
    it.each([...VALEURS_LIVREE])('« %s » est reconnu', (valeur) => {
      expect(estLivree(valeur)).toBe(true);
      expect(canoniserStatutLivraison(valeur)).toBe(STATUT_LIVREE);
    });

    it.each(['Livrée', 'LIVRE', 'livré', '  livree  '])(
      '« %s » aussi — casse, accent et espaces de bord',
      (valeur) => {
        expect(estLivree(valeur)).toBe(true);
        expect(canoniserStatutLivraison(valeur)).toBe(STATUT_LIVREE);
      },
    );
  });

  describe('ne rien inventer', () => {
    it.each([['', ''], [null, ''], [undefined, '']])(
      'un statut absent (%s) reste absent, jamais livre',
      (entree, attendu) => {
        expect(canoniserStatutLivraison(entree)).toBe(attendu);
        expect(estLivree(entree)).toBe(false);
      },
    );

    // Ces valeurs sont relues par des workflows n8n que ce depot ne controle
    // pas. Les reecrire casserait peut-etre une comparaison invisible d'ici :
    // la canonisation ne touche QUE la famille « livree ».
    it.each(['en attente', 'accepte', 'en route', 'parti'])(
      '« %s » traverse sans etre reecrit ni pris pour une livraison',
      (valeur) => {
        expect(estLivree(valeur)).toBe(false);
        expect(canoniserStatutLivraison(valeur)).toBe(valeur);
      },
    );
  });

  describe('le piege de l egalite stricte', () => {
    // L'echantillon reproduit la production : deux « livre », un « livree »,
    // un « livrée ».
    const historique = ['livre', 'livre', 'livree', 'livrée'];

    it('une egalite stricte n en voyait que la moitie', () => {
      expect(historique.filter((v) => v === STATUT_LIVREE)).toHaveLength(2);
    });

    it('la liste tolerante les voit toutes', () => {
      expect(
        historique.filter((v) => (VALEURS_LIVREE as readonly string[]).includes(v)),
      ).toHaveLength(4);
    });
  });

  describe('la liste et la fonction disent la meme chose', () => {
    // Sans cela, une orthographe pourrait entrer dans la liste sans que
    // `estLivree` la reconnaisse : les requetes en base et le code
    // divergeraient, et c'est le genre d'ecart qui ne se voit qu'en
    // production.
    it.each([...VALEURS_LIVREE])('« %s » est acceptee par estLivree', (valeur) => {
      expect(estLivree(valeur)).toBe(true);
    });

    it('la forme retenue appartient a la liste', () => {
      expect(VALEURS_LIVREE as readonly string[]).toContain(STATUT_LIVREE);
    });
  });
});
