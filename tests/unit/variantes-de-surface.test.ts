import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Deux variantes de bouton dependent de la SURFACE, pas du geste.
 *
 * `Bouton.tsx` le dit lui-meme : « les deux dernieres existent parce qu'un
 * bouton bissap jurerait sur un bandeau colore — c'est la surface qui decide ».
 *
 * - `contraste` : blanc plein, pour une surface SOMBRE.
 * - `voile` : blanc a 15 %, texte blanc, pour une surface SOMBRE.
 *
 * ── CE QUE CE GARDE A COUTE ────────────────────────────────────────────────
 *
 * Le 2 septembre 2026, `voile` etait pose sur une carte vert PALE de l'ecran
 * Produits : texte blanc sur un blanc a 15 % au-dessus de `bg-accent-50`. Le
 * libelle « Tout remettre au catalogue » etait INVISIBLE. Trouve en chargeant
 * la page dans un vrai navigateur, a 390 px.
 *
 * ── POURQUOI AUCUN GARDE EXISTANT NE POUVAIT LE VOIR ───────────────────────
 *
 * `contraste.mjs` releve les paires fond/texte ecrites dans un MEME
 * `className`. Ici la couleur du texte vit dans `Bouton.tsx` et le fond reel
 * dans la page : les deux ne se rencontrent jamais dans une meme chaine. Meme
 * angle mort que l'element fixe survolant un fond changeant.
 *
 * ── CE QUE CELUI-CI SAIT, ET CE QU'IL NE SAIT PAS ──────────────────────────
 *
 * Il ne LIT PAS la surface — personne ne sait le faire statiquement. Il exige
 * que chaque emploi soit NOMME, avec la surface sur laquelle il repose. Poser
 * une de ces variantes coute donc une ligne argumentee, et c'est precisement
 * la relecture qui manquait.
 *
 * La verification par la mesure reste a faire dans un navigateur : c'est le
 * seul endroit ou l'on voit vraiment ce qui est peint.
 */

const VARIANTES_DE_SURFACE = ['voile', 'contraste'];

/**
 * Chaque emploi, avec la surface qui le justifie. Une entree sans surface
 * sombre nommee est une entree a refuser en relecture.
 */
const SURFACES: Record<string, string> = {
  'src/app/dashboard/products/page.tsx:contraste:Ajouter un produit':
    'bandeau de tete de la page, surface sombre — blanc plein, lisible.',
  'src/app/dashboard/products/page.tsx:voile:Actualiser':
    'meme bandeau sombre, geste secondaire a cote du bouton plein.',
};

function fichiers(racine: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(racine)) {
    const chemin = join(racine, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin));
    else if (nom.endsWith('.tsx')) sortie.push(chemin.replace(/\\/g, '/'));
  }
  return sortie;
}

/**
 * Le LIBELLE du bouton, extrait sans analyser le JSX.
 *
 * ── POURQUOI PAS « UNE ENTREE PAR FICHIER » ────────────────────────────────
 *
 * C'etait la premiere version, et la mutation l'a tuee : reposer `voile` sur
 * la carte claire de `products/page.tsx` ne la faisait PAS rougir, ce fichier
 * ayant deja un `voile` justifie pour son bandeau. Le garde n'aurait donc
 * jamais attrape le defaut qu'il pretendait empecher.
 *
 * On cle donc sur le libelle, qui est stable et qui dit a un relecteur DE QUEL
 * bouton on parle. Un nouvel emploi porte un autre libelle, donc une autre
 * cle, donc un argument a ecrire.
 *
 * Le balayage compte les profondeurs de `<>` et de `{}` : `onClick={() => …}`
 * contient un `>` qui trompe toute expression reguliere naive.
 */
function libelle(source: string, depart: number): string {
  let i = source.indexOf('>', depart);
  // Sauter les `>` qui appartiennent a une fleche ou a une accolade ouverte.
  let accolades = 0;
  for (let k = depart; k < source.length; k++) {
    const c = source[k];
    if (c === '{') accolades++;
    else if (c === '}') accolades--;
    else if (c === '>' && accolades === 0 && source[k - 1] !== '=') { i = k; break; }
  }

  const fin = source.indexOf('</Bouton>', i);
  if (fin < 0) return '';

  let texte = '';
  let balise = 0;
  accolades = 0;
  for (let k = i + 1; k < fin; k++) {
    const c = source[k];
    if (c === '<') balise++;
    else if (c === '>') { if (balise > 0) balise--; }
    else if (c === '{') accolades++;
    else if (c === '}') { if (accolades > 0) accolades--; }
    else if (balise === 0 && accolades === 0) texte += c;
  }
  return texte.replace(/\s+/g, ' ').trim();
}

const emplois: string[] = [];
for (const f of fichiers('src')) {
  const source = readFileSync(f, 'utf8');
  for (const v of VARIANTES_DE_SURFACE) {
    const motif = `variante="${v}"`;
    let i = source.indexOf(motif);
    while (i >= 0) {
      emplois.push(`${f}:${v}:${libelle(source, i) || '(sans libelle)'}`);
      i = source.indexOf(motif, i + motif.length);
    }
  }
}

describe('les variantes qui dependent de la surface sont nommees', () => {
  it('il y a bien des emplois a verifier', () => {
    // Zero emploi passerait au vert en ne verifiant rien — et voudrait dire
    // que les variantes sont mortes, ce qui est aussi une information.
    expect(emplois.length).toBeGreaterThan(0);
  });

  it.each(emplois)('%s', (emploi) => {
    expect(
      SURFACES[emploi],
      [
        `${emploi} n'est pas justifie.`,
        '`voile` et `contraste` peignent du blanc : elles ne sont lisibles que sur une',
        'surface SOMBRE. Posees sur une carte claire, leur libelle disparait.',
        'Ajoutez la surface dans SURFACES — et regardez la page dans un navigateur.',
      ].join('\n'),
    ).toBeTruthy();
  });

  it('aucune justification ne survit a son emploi', () => {
    // Une entree qui designe un emploi disparu ferait croire qu'on a examine
    // quelque chose qui n'existe plus.
    for (const cle of Object.keys(SURFACES)) {
      expect(emplois, `${cle} est justifie mais n'existe plus`).toContain(cle);
    }
  });
});
