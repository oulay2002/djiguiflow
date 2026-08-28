import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Le lien « Aller au contenu » doit mener quelque part, sur CHAQUE page.
 *
 * POURQUOI CE TEST EXISTE. `src/app/layout.tsx` pose un lien d'evitement en
 * premier element du document, et il vise `#contenu`. La cible, elle, se pose
 * a la main sur le `<main>` de chaque page — c'est-a-dire nulle part par
 * defaut. Le 28 aout 2026, quatre pages sur dix-sept l'avaient oubliee :
 * `mes-donnees`, `admin`, `admin/registre` et `legal/layout`. Sur celles-la,
 * le premier lien de la page ne faisait rien.
 *
 * CE QUE CA COUTE A QUELQU'UN. L'utilisateur au lecteur d'ecran ou au clavier
 * active ce lien pour sauter l'en-tete. S'il ne mene nulle part, il repart de
 * la barre du navigateur et retraverse tout — a chaque page, a chaque visite.
 * L'echec est SILENCIEUX : rien ne casse, rien ne s'affiche, et personne qui
 * navigue a la souris ne le verra jamais.
 *
 * POURQUOI TOUTES LES BALISES, ET PAS UNE PAR FICHIER. Une page a souvent
 * plusieurs `<main>` — un par etat : chargement, acces refuse, contenu. Si
 * l'etat de chargement n'a pas la cible, le lien meurt pendant tout le
 * chargement, c'est-a-dire exactement quand on cherche a sauter l'en-tete.
 *
 * CE QUE CE TEST NE DIT PAS. Il eprouve la PRESENCE de la cible, pas qu'elle
 * soit atteignable ni unique a l'ecran. Un `<main>` par etat est bien deux
 * `id` identiques dans le source, mais un seul rendu a la fois.
 */

function pages(racine: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(racine)) {
    const complet = join(racine, nom);
    if (statSync(complet).isDirectory()) sortie.push(...pages(complet));
    else if (nom.endsWith('.tsx')) sortie.push(complet.replace(/\\/g, '/'));
  }
  return sortie;
}

describe('la cible du lien d’évitement', () => {
  it('le gabarit vise bien #contenu', () => {
    const gabarit = readFileSync('src/app/layout.tsx', 'utf8');
    expect(gabarit).toContain('href="#contenu"');
  });

  it('chaque <main> de chaque page porte id="contenu"', () => {
    const orphelins: string[] = [];

    for (const fichier of pages('src/app')) {
      const source = readFileSync(fichier, 'utf8');
      const balises = source.match(/<main\b[^>]*>/g) ?? [];
      for (const balise of balises) {
        if (!balise.includes('id="contenu"')) orphelins.push(`${fichier} → ${balise}`);
      }
    }

    expect(
      orphelins,
      'Ces <main> n’ont pas id="contenu" : le lien « Aller au contenu » ne mène nulle part sur ces pages.\n'
      + orphelins.join('\n'),
    ).toEqual([]);
  });

  it('au moins une page porte la cible — le test se prouve utile', () => {
    const avecCible = pages('src/app').filter((f) => readFileSync(f, 'utf8').includes('id="contenu"'));
    expect(avecCible.length).toBeGreaterThan(10);
  });
});
