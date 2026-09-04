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
const PAGE_ANNUAIRE = readFileSync('src/app/boutiques/page.tsx', 'utf8');
const ANNUAIRE = readFileSync('src/app/boutiques/Annuaire.tsx', 'utf8');
const LIB_ANNUAIRE = readFileSync('src/lib/vitrine/annuaire.ts', 'utf8');

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

describe("l'annuaire aussi part du serveur", () => {
  /**
   * MEME DEFAUT QUE LA FICHE, MEME REMEDE. `/boutiques` appelait
   * `vitrine_boutiques()` dans un `useEffect` : son HTML ne contenait pas un
   * seul nom de commerce, et un robot qui n'execute pas de JavaScript n'y
   * voyait aucune boutique a suivre. C'est pourtant la page d'entree.
   *
   * Mesure du 4 septembre 2026, meme profil bride : la premiere boutique etait
   * nommee a 16,1 s en production, contre 2,5 s une fois rendue par le serveur.
   */
  it("LE DEFAUT : la page d'entree etait 'use client' de bout en bout", () => {
    expect(PAGE_ANNUAIRE).not.toMatch(/^\s*['"]use client['"]/m);
    expect(PAGE_ANNUAIRE).toContain('chargerAnnuaire');
    expect(PAGE_ANNUAIRE).toMatch(/boutiques=\{boutiques\}/);
  });

  it('le rendu reste dynamique : les cartes portent un etat d ouverture', () => {
    // Mis en cache, l'annuaire annoncerait « ouvert » sur des commerces fermes
    // depuis des heures — et le compte d'articles et la note bougent aussi.
    expect(PAGE_ANNUAIRE).toMatch(/export const dynamic = ['"]force-dynamic['"]/);
  });

  it('UNE PANNE DE LECTURE N EST PAS UNE PLACE DE MARCHE VIDE', () => {
    // `null` doit rester distinct de `[]` jusqu'a l'ecran : sinon une base
    // muette se lit « aucun commercant n'est branche ».
    expect(ANNUAIRE).toMatch(/listeServeur === null/);
    expect(LIB_ANNUAIRE).toMatch(/Promise<BoutiqueAnnuaire\[\] \| null>/);
  });

  it("les squelettes d'attente ont ete RETIRES, pas rendus inatteignables", () => {
    // Un ecran de chargement qui ne peut plus s'afficher est un mensonge dans
    // le code : la liste arrive avec la page.
    expect(ANNUAIRE).not.toContain('animate-pulse');
    // L'APPEL, pas le mot : le commentaire en tete du fichier raconte le
    // defaut et nomme `useEffect` pour l'expliquer.
    expect(ANNUAIRE).not.toMatch(/\buseEffect\(/);
  });

  it("et la porte reste `vitrine_boutiques`, jamais la table", () => {
    // Lire `boutiques` directement ne rend que ses propres enseignes des qu'on
    // est connecte : la place de marche se vidait pour un marchand qui la
    // consultait.
    expect(LIB_ANNUAIRE).toContain('vitrine_boutiques');
    expect(LIB_ANNUAIRE).not.toMatch(/\.from\(['"]boutiques['"]\)/);
  });
});

describe('le catalogue ne part pas en photos d un coup', () => {
  /**
   * MESURE LE 4 SEPTEMBRE 2026 : 475 ko de photos pour les CINQ articles de
   * Chez Zahara, toutes chargees a l'ouverture. Un marchand a trente articles
   * en enverrait deux a trois megaoctets, dont vingt-huit sous la ligne de
   * flottaison — sur un forfait ou chaque megaoctet se paie.
   *
   * LE RENDU SERVEUR REND CE POINT PLUS URGENT, PAS MOINS : le navigateur voit
   * desormais toutes les balises des le HTML et lance tous les
   * telechargements a la fois, en concurrence avec le JavaScript.
   */
  it('LE DEFAUT : aucune photo n etait differee', () => {
    expect(VITRINE).toMatch(/loading=\{immediate \? 'eager' : 'lazy'\}/);
  });

  it('mais les premieres NE LE SONT PAS — une photo vue en retard est pire', () => {
    expect(VITRINE).toMatch(/const PHOTOS_IMMEDIATES = \d/);
    // Deux cartes tiennent dans une fenetre de 390 px. En differer davantage
    // ferait attendre le client sur ce qu'il regarde deja.
    const n = Number(VITRINE.match(/const PHOTOS_IMMEDIATES = (\d+)/)?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(4);
  });

  it('le rang traverse les DEUX sections', () => {
    // Sans le decalage, les premieres cartes de « À la carte » se croiraient
    // en haut de page alors qu'elles sont sous le menu du jour.
    expect(VITRINE).toMatch(/rang=\{depart \+ i\}/);
    expect(VITRINE).toMatch(/grille\(grouperEnArticles\(carte\), enVedette\.length\)/);
  });

  it('les vignettes de coloris sont differees SANS exception', () => {
    // Elles vivent sous la photo de leur carte : jamais dans la premiere
    // fenetre, et un article a quatre coloris en porte quatre.
    const vignette = VITRINE.slice(VITRINE.indexOf('src={v.image}'));
    expect(vignette.slice(0, 200)).toContain("loading=\"lazy\"");
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
