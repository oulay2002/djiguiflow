import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALIERS, PREMIER_PALIER_CHIFFRE, ligneConfiance } from '@/lib/paliers';

/**
 * L'annuaire public ne publie plus un compte, il publie un palier.
 *
 * Ces tests existent parce que la branche du palier n'est exercee par AUCUNE
 * donnee de production : les boutiques en ligne ont des avis, et l'avis passe
 * en premier. Elle ne s'ouvrira qu'a l'arrivee d'un marchand qui livre sans
 * avoir encore d'avis — donc a chaque nouveau, au moment ou la plateforme
 * s'ouvre. Le chemin le moins couvert etait celui de l'arrivant.
 */
describe('la ligne de confiance de la vitrine', () => {
  it("met l'avis en premier, meme quand la boutique livre beaucoup", () => {
    expect(ligneConfiance({ avis: 5, palier: 1000 })).toBe('5 avis');
  });

  it('ne dit jamais « 0 avis » : sans avis, il passe au palier', () => {
    expect(ligneConfiance({ avis: 0, palier: 25 })).toBe('Plus de 25 commandes livrées');
  });

  // LE POINT DE LA DECISION. Un chiffre bas dessert le nouveau : « 3 commandes
  // livrees » se lit plus mal que « Nouvelle boutique ». Le premier palier ne
  // porte donc aucun nombre.
  it('ne met aucun chiffre sur le premier palier', () => {
    const ligne = ligneConfiance({ avis: 0, palier: 1 });
    expect(ligne).toBe('Premières commandes livrées');
    expect(ligne).not.toMatch(/\d/);
  });

  it('retombe sur « Nouvelle boutique » quand rien n a ete livre', () => {
    expect(ligneConfiance({ avis: 0, palier: 0 })).toBe('Nouvelle boutique');
  });

  it('accorde le pluriel sur chaque palier chiffre', () => {
    for (const palier of PALIERS.filter((p) => p >= PREMIER_PALIER_CHIFFRE)) {
      expect(ligneConfiance({ avis: 0, palier })).toBe(`Plus de ${palier} commandes livrées`);
    }
  });

  // Un palier absent de la table rendrait une phrase que personne n'a ecrite.
  // On verifie que la fonction reste lisible meme dans ce cas, sans le
  // legitimer : le test suivant, lui, empeche le cas d'exister.
  it('ne casse pas sur un palier hors table', () => {
    expect(ligneConfiance({ avis: 0, palier: 5000 })).toBe('Plus de 5000 commandes livrées');
  });
});

/**
 * LE GARDE CONTRE LA DERIVE ENTRE LE SQL ET LA PAGE.
 *
 * `vitrine_boutiques()` decide les paliers, `paliers.ts` les met en mots. Les
 * deux vivaient separes et rien ne verifiait qu'ils s'accordent : ajouter une
 * borne en SQL sans toucher au TypeScript aurait affiche un palier que personne
 * n'a redige. C'est le meme motif que la derive du schema — deux sources qui se
 * croient d'accord parce que personne ne les confronte.
 */
describe('le SQL et la page parlent des memes paliers', () => {
  it('rend exactement les bornes declarees dans PALIERS', () => {
    const dossier = join(process.cwd(), 'supabase', 'migrations');
    const fichier = readdirSync(dossier)
      .filter((n) => n.endsWith('_vitrine_paliers_de_livraison.sql'))
      .sort()
      .at(-1);
    expect(fichier, 'la migration des paliers doit exister dans le depot').toBeDefined();

    const sql = readFileSync(join(dossier, fichier as string), 'utf8');
    // Le bloc `case` est la source de verite : on lit ce que chaque branche
    // RETOURNE, pas les seuils qu'elle compare.
    const rendus = [...sql.matchAll(/then\s+(\d+)|else\s+(\d+)\s*\n\s*end/g)].map((m) =>
      Number(m[1] ?? m[2]),
    );

    expect(new Set(rendus)).toEqual(new Set(PALIERS));
  });
});
