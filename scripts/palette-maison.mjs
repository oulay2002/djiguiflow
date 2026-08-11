/**
 * Traduit les couleurs Tailwind par defaut vers la palette « indigo & ticket ».
 *
 * Le tableau de bord n'avait jamais recu le systeme visuel : il tirait ses
 * couleurs du nuancier par defaut — slate, amber, emerald, rose, blue, purple —
 * soit six familles sans role, la ou la maison en compte cinq et les nomme.
 * Passer d'une vitrine a son outil donnait l'impression de changer de produit.
 *
 * La traduction respecte les roles declares dans globals.css :
 *   nuit    structure, texte, surfaces de nuit
 *   chaux   papier, filets, mentions secondaires
 *   bissap  action, prix, urgence, annulation
 *   feuille confirme, livre, encaisse           (jetons `accent-*`)
 *   mangue  en cours, en attente, a surveiller
 *
 * Les gris les plus pales (`-400`, `-500`) remontent volontairement a
 * `chaux-600` : `slate-400` sur blanc tombe sous le seuil de contraste pour du
 * petit texte, et la moitie du tableau de bord s'en servait pour des libelles.
 *
 * Usage : node scripts/palette-maison.mjs [--ecrire]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ECRIRE = process.argv.includes('--ecrire');

const RACINES = [
  'src/app/dashboard',
  'src/app/onboarding',
  'src/app/login',
  'src/app/register',
  'src/app/suivi',
  'src/components',
];

/** Familles neutres : toutes vers nuit (texte, structure) ou chaux (papier). */
const NEUTRES = ['slate', 'gray', 'zinc', 'neutral', 'stone'];

/** Familles porteuses de sens, vers le jeton qui porte le meme role. */
const ROLES = {
  emerald: 'accent',
  green: 'accent',
  teal: 'accent',
  lime: 'accent',
  cyan: 'accent',
  rose: 'bissap',
  red: 'bissap',
  pink: 'bissap',
  amber: 'mangue',
  yellow: 'mangue',
  orange: 'mangue',
  blue: 'nuit',
  sky: 'nuit',
  indigo: 'nuit',
  violet: 'nuit',
  purple: 'nuit',
};

/** Bornes reelles de chaque echelle : deborder produirait une classe morte. */
const MAX = { nuit: 900, chaux: 600, bissap: 900, accent: 900, mangue: 700 };

function borner(jeton, niveau) {
  const echelle = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].filter(
    (n) => n <= MAX[jeton],
  );
  const n = Number(niveau);
  return echelle.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
}

const PREFIXES = 'bg|text|border|from|to|via|ring|divide|fill|stroke|decoration|outline|shadow|placeholder|accent|caret';

function traduire(source) {
  let s = source;

  // 1. Les filets. Un filet n'a pas de couleur propre dans le systeme : il a
  //    un jeton, `--hairline`, que le mode sombre et les surfaces teintees
  //    savent redefinir.
  s = s.replace(
    new RegExp(`\\bborder-(?:${NEUTRES.join('|')})-(?:100|200|300)\\b`, 'g'),
    'border-[var(--hairline)]',
  );

  // 2. Les mentions secondaires trop pales. Traite avant la regle generale,
  //    sinon `slate-400` deviendrait `chaux-400` et resterait illisible.
  s = s.replace(
    new RegExp(`\\btext-(?:${NEUTRES.join('|')})-(?:300|400|500|600)\\b`, 'g'),
    'text-chaux-600',
  );

  // 3. Le reste des neutres : le texte et les bordures vont a l'indigo, les
  //    surfaces au papier.
  s = s.replace(
    new RegExp(`\\b(${PREFIXES})-(?:${NEUTRES.join('|')})-(\\d{2,3})(/\\d+)?\\b`, 'g'),
    (_, prefixe, niveau, alpha = '') => {
      const surface = prefixe === 'bg' || prefixe === 'from' || prefixe === 'to' || prefixe === 'via';
      const jeton = surface ? 'chaux' : 'nuit';
      return `${prefixe}-${jeton}-${borner(jeton, niveau)}${alpha}`;
    },
  );

  // 4. Les familles porteuses de sens.
  for (const [famille, jeton] of Object.entries(ROLES)) {
    s = s.replace(
      new RegExp(`\\b(${PREFIXES})-${famille}-(\\d{2,3})(/\\d+)?\\b`, 'g'),
      (_, prefixe, niveau, alpha = '') =>
        `${prefixe}-${jeton}-${borner(jeton, niveau)}${alpha}`,
    );
  }

  return s;
}

function fichiers(chemin) {
  const sortie = [];
  for (const nom of readdirSync(chemin)) {
    const complet = join(chemin, nom);
    if (statSync(complet).isDirectory()) sortie.push(...fichiers(complet));
    else if (nom.endsWith('.tsx') || nom.endsWith('.ts')) sortie.push(complet);
  }
  return sortie;
}

let totalFichiers = 0;
let totalRemplacements = 0;

for (const racine of RACINES) {
  for (const fichier of fichiers(racine)) {
    const avant = readFileSync(fichier, 'utf8');
    const apres = traduire(avant);
    if (avant === apres) continue;

    // Compte les classes effectivement traduites, pas les caracteres.
    const motif = new RegExp(
      `\\b(?:${PREFIXES})-(?:${[...NEUTRES, ...Object.keys(ROLES)].join('|')})-\\d{2,3}\\b`,
      'g',
    );
    const n = (avant.match(motif) ?? []).length;
    totalFichiers += 1;
    totalRemplacements += n;
    console.log(`${String(n).padStart(4)}  ${fichier.replace(/\\/g, '/')}`);
    if (ECRIRE) writeFileSync(fichier, apres, 'utf8');
  }
}

console.log(
  `\n${totalRemplacements} classes traduites dans ${totalFichiers} fichiers` +
    (ECRIRE ? '' : '  — essai a blanc, relancer avec --ecrire'),
);
