import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { etatInitial } from '@/lib/vitrine/etatInitial';
import type { FicheVitrine } from '@/lib/vitrine/donnees';

/**
 * LA VITRINE DOIT NOMMER LE COMMERCE DES LE PREMIER RENDU.
 *
 * LE DEFAUT, mesure sur la production le 4 septembre 2026. La page
 * `/boutiques/[id]` etait un composant client qui chargeait sa fiche PUIS son
 * menu dans un `useEffect`. Sur un Galaxy S9+ en 3G lente avec le processeur
 * ralenti x4 — le telephone que `PRODUCT.md` decrit —, le `<h1>` disait
 * « Boutique » a 1,1 s, le nom du commerce arrivait a 10,9 s et le premier
 * produit a 11,5 s. Le HTML servi ne contenait ni le nom ni un seul article :
 * aucun robot qui n'execute pas de JavaScript ne voyait le catalogue.
 *
 * CE QUI REND LE DEFAUT SILENCIEUX : il ne se voit sur AUCUN poste de
 * developpement. En fibre, avec un processeur de bureau, le nom apparaissait
 * en 1,5 s et tout semblait normal. Seul un profil bride le montre.
 *
 * POURQUOI CE GARDE EST FAIT DE DEUX MORCEAUX. La suite tourne en
 * environnement `node`, sans navigateur : elle ne peut pas mesurer un rendu.
 * Elle peut faire deux choses qui, ensemble, tiennent :
 *
 *   1. verifier que l'etat de DEPART porte deja le commerce et ses articles ;
 *   2. relire la page elle-meme, pour qu'elle ne redevienne pas un composant
 *      client qui chargerait a nouveau apres coup.
 *
 * Le second point suit la lecon de `contact-support` : des tests qui eprouvent
 * une fonction que personne n'appelle au bon endroit restent verts pendant que
 * le defaut vit.
 */

const PAGE = readFileSync('src/app/boutiques/[id]/page.tsx', 'utf8');
const VITRINE = readFileSync('src/app/boutiques/[id]/Vitrine.tsx', 'utf8');

const FICHE: FicheVitrine = {
  id: 'zahara',
  nom: 'Chez Zahara',
  secteur: 'restaurant',
  emoji: '🍽️',
  logo: '',
  ouvert: true,
  messageHoraire: null,
  fiche: {
    zone: 'Cocody',
    delai_livraison: '30',
    zones_livrees: 'Abidjan',
    paiements_acceptes: ['Orange Money', ''],
    commande_minimum: 2000,
    mode_recuperation: 'les_deux',
    delai_preparation_min: 20,
    livraison_offerte_des: 0,
  },
};

const ARTICLE = {
  id: 'P1',
  nom: 'Attiéké poisson',
  categorie: 'Plats',
  prix: 2500,
  description: '',
  image: '',
  duJour: false,
  stock: null,
  groupe: '',
  couleur: '',
  marque: '',
  publicVise: '',
  attributNom: '',
  attributValeurs: [],
};

describe('le premier rendu porte deja le commerce', () => {
  it('LE DEFAUT : le titre disait « Boutique » pendant dix secondes', () => {
    const e = etatInitial(FICHE, [ARTICLE]);
    expect(e.header.nom).toBe('Chez Zahara');
    expect(e.header.nom).not.toBe('Boutique');
    expect(e.header.secteur).toBe('restaurant');
  });

  it('et le catalogue est la, pas en chemin', () => {
    const e = etatInitial(FICHE, [ARTICLE]);
    expect(e.produits).toHaveLength(1);
    expect(e.produits[0].nom).toBe('Attiéké poisson');
    // Rien a attendre : l'ecran ne doit pas afficher « Chargement du menu… »
    // sur un catalogue qu'il tient deja.
    expect(e.chargement).toBe(false);
  });

  it('la fiche du marchand voyage entiere', () => {
    const e = etatInitial(FICHE, []);
    expect(e.zone).toBe('Cocody');
    expect(e.infos.delai).toBe('30');
    expect(e.infos.zones).toBe('Abidjan');
    expect(e.infos.minimum).toBe(2000);
    // Les entrees vides sont ecartees, jamais rendues comme un moyen de
    // paiement sans nom.
    expect(e.infos.paiements).toEqual(['Orange Money']);
  });
});

describe('les valeurs absentes gardent leur sens', () => {
  it('ZERO N EST PAS RIEN : « toujours offerte » survit au chargement', () => {
    // Un `|| null` ferait de « livraison toujours offerte » un « le livreur
    // annonce ses frais » — l'exact contraire, et le client paierait une
    // course que le marchand croyait offrir.
    expect(etatInitial(FICHE, []).recuperation.offerteDes).toBe(0);
  });

  it('et `null` reste `null` : le livreur annonce', () => {
    const sansGratuite: FicheVitrine = {
      ...FICHE,
      fiche: { ...FICHE.fiche!, livraison_offerte_des: null },
    };
    expect(etatInitial(sansGratuite, []).recuperation.offerteDes).toBeNull();
  });

  it('une boutique hors registre laisse la page attendre son repli', () => {
    // `fiche` a `null` veut dire « pas au registre » : la page doit continuer
    // d'aller chercher `vitrine_boutique` depuis le navigateur, donc rester en
    // chargement plutot que d'afficher un catalogue vide.
    const e = etatInitial(null, null);
    expect(e.chargement).toBe(true);
    expect(e.pannePage).toBe('');
    expect(e.header.nom).toBe('Boutique');
    expect(e.estMarchandSheets).toBe(false);
  });

  it('UN MENU ILLISIBLE N EST PAS UN CATALOGUE VIDE', () => {
    // La boutique existe et sa base n'a pas repondu : le taire afficherait
    // « ce commercant n'a pas encore publie d'article » sur une boutique
    // pleine. C'est le motif du defaut silencieux, deja paye une fois.
    const e = etatInitial(FICHE, null);
    expect(e.pannePage).toBe('reseau');
    expect(e.produits).toEqual([]);
  });

  it('un menu VRAIMENT vide ne crie pas a la panne', () => {
    expect(etatInitial(FICHE, []).pannePage).toBe('');
  });
});

describe('la page reste un composant serveur', () => {
  it("LE DEFAUT : elle etait 'use client' de bout en bout", () => {
    expect(PAGE).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('elle charge la fiche ET le menu avant de rendre', () => {
    expect(PAGE).toContain('chargerFicheBoutique');
    expect(PAGE).toContain('chargerMenuBoutique');
    // En parallele : les enchainer rendrait au serveur le defaut qu'on vient
    // de retirer au navigateur.
    expect(PAGE).toContain('Promise.all');
  });

  it('et elle les PASSE a la vitrine — les charger sans les transmettre ne servirait a rien', () => {
    expect(PAGE).toMatch(/fiche=\{fiche\}/);
    expect(PAGE).toMatch(/menu=\{menu\}/);
  });

  it('le rendu reste dynamique : un stock en cache commanderait un plat epuise', () => {
    expect(PAGE).toMatch(/export const dynamic = ['"]force-dynamic['"]/);
  });

  it("l'ecran part de cet etat, au lieu d'un gabarit", () => {
    expect(VITRINE).toContain('etatInitial');
    expect(VITRINE).toMatch(/useState\(depart\./);
  });

  it("et le navigateur ne recharge plus ce que le serveur a deja lu", () => {
    // Le repli par `vitrine_boutique` reste, mais il ne doit s'executer que
    // pour une boutique absente du registre. Sans cette garde, la page
    // referait les deux allers-retours et le travail serait annule.
    expect(VITRINE).toMatch(/if \(!slug \|\| ficheServeur\) return;/);
    expect(VITRINE).not.toContain('fetch(`/api/boutiques/${slug}`)');
  });
});
