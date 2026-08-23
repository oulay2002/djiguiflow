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
 * SECOND PASSAGE : LES OMBRES. Le 22 aout 2026, la seance visuelle a retire
 * NEUF ombres Tailwind par defaut — `shadow-sm`, `-lg`, `-xl`, `-2xl` — que ce
 * script n'avait jamais vues. La raison est structurelle, pas un oubli : il ne
 * cherche que `prefixe-famille-niveau`, et `shadow-lg` n'a ni famille ni
 * niveau. La marque « Tailwind par defaut » avait donc un angle mort, et il
 * s'appelait « les ombres ».
 *
 * Ce passage SIGNALE, il ne traduit pas. Une couleur a un equivalent maison ;
 * une ombre, non — son remplacement depend de ce qu'elle porte : une elevation
 * reelle devient `soft-shadow`, une ombre decorative disparait. Traduire a
 * l'aveugle rendrait le nivellement invisible, ce qui est exactement le defaut
 * qu'on corrige.
 *
 * Il attrape trois choses, dont une qu'on ne soupconnait pas :
 *   1. les ombres Tailwind par defaut ;
 *   2. les ombres ecrites a la main, `shadow-[...]` — dix-sept avaient ete
 *      trouvees, dont deux a UNE unite de rouge pres ;
 *   3. une COULEUR d'ombre sans ombre. Verifie dans le CSS compile :
 *      `shadow-bissap-500/35` n'emet que `--tw-shadow-color`, et
 *      `.soft-shadow` pose `box-shadow: var(--shadow-soft)` — une valeur
 *      litterale qui ne lit jamais cette variable. La classe ne fait RIEN.
 *      Elle se relit pourtant comme une intention, et c'est pire qu'absente.
 *
 * Usage : node scripts/palette-maison.mjs [--ecrire]
 * Sort en erreur si une ombre hors maison subsiste : le second passage est un
 * garde, pas un rapport.
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

// ---------------------------------------------------------------------------
// SECOND PASSAGE : LES OMBRES. Voir l'en-tete pour le pourquoi.
// ---------------------------------------------------------------------------

/** Les tailles du nuancier par defaut. `none` est legitime : il RETIRE. */
const TAILLES = '2xs|xs|sm|md|lg|xl|2xl|3xl|inner';

// `(?<![\w-])` empeche de mordre sur `soft-shadow`, qui est la maison, et sur
// `drop-shadow`, qui a son propre motif juste en dessous.
const OMBRES = [
  {
    motif: new RegExp(`(?<![\\w-])shadow-(?:${TAILLES})\\b`, 'g'),
    verdict: 'ombre Tailwind par defaut   → soft-shadow, ou rien',
  },
  {
    motif: /(?<![\w-])(?:drop-)?shadow-\[[^\]]*\]/g,
    verdict: 'ombre ecrite a la main      → declarer un jeton, ou soft-shadow',
  },
  {
    motif: new RegExp(`(?<![\\w-])drop-shadow-(?:${TAILLES})\\b`, 'g'),
    verdict: 'flou porte par defaut       → soft-shadow, ou rien',
  },
];

/**
 * Une COULEUR d'ombre sans taille d'ombre pour la consommer.
 *
 * Tailwind n'emet alors que `--tw-shadow-color`, et RIEN ne lit cette variable
 * — surtout pas `soft-shadow`, dont le `box-shadow` est litteral. La classe est
 * morte. On l'attrape en excluant les tailles et les valeurs arbitraires : ce
 * qui reste est forcement une couleur.
 */
const COULEUR_SEULE = new RegExp(
  `(?<![\\w-])shadow-(?!(?:${TAILLES}|none)\\b)(?!\\[)[a-z]+-\\d{2,3}(?:/\\d+)?\\b`,
  'g',
);

/**
 * TROISIEME REGLE : un niveau qui n'existe pas dans sa rampe.
 *
 * `text-primary-950` etait ecrit dans les bulles de l'assistante. La rampe
 * `primary` s'arrete a 900 : la classe ne produisait RIEN, et le texte heritait
 * sa couleur au lieu de la recevoir. Meme chose pour `text-chaux-700`, alors
 * que `chaux` s'arrete a 600. Quatre classes mortes ont ete trouvees en une
 * seance — deux ombres sans ombre, deux niveaux hors rampe — et aucune ne se
 * voyait : elles se relisaient toutes comme une intention.
 *
 * LES RAMPES SONT LUES DANS globals.css, jamais recopiees ici. Une table
 * dupliquee derive, et c'est precisement le defaut qu'on chasse : la table
 * `MAX` du premier passage borne la TRADUCTION, elle ne dit rien de ce qui est
 * deja ecrit.
 */
const rampes = new Map();
for (const [, famille, niveau] of readFileSync('src/app/globals.css', 'utf8').matchAll(
  /--color-([a-z]+)-(\d{2,3})\s*:/g,
)) {
  if (!rampes.has(famille)) rampes.set(famille, new Set());
  rampes.get(famille).add(niveau);
}

const HORS_RAMPE = new RegExp(`(?<![\\w-])(?:${PREFIXES})-([a-z]+)-(\\d{2,3})`, 'g');

/**
 * DES UTILITAIRES QUI N'ACCEPTENT AUCUNE VALEUR ENTRE CROCHETS.
 *
 * `overflow-y-auto-[2rem]` a vecu dans le tiroir de navigation du tableau de
 * bord : Tailwind n'emet AUCUNE regle pour cette classe. Le tiroir avait donc
 * une hauteur maximale sans defilement, et « Deconnexion » sortait de l'ecran
 * des que le clavier s'ouvrait. Trouve le 23 aout 2026.
 *
 * C'est la MEME FAMILLE que « niveau hors rampe » — une classe qui a l'air
 * juste et ne produit rien — et ce garde ne la voyait pas : il ne surveillait
 * que les couleurs. Deux occurrences dans la meme journee en ont fait une regle.
 *
 * La liste est volontairement COURTE ET SURE : uniquement des utilitaires dont
 * la valeur est un mot-cle ferme. En ajouter un qui accepte l'arbitraire
 * produirait de fausses alertes — et une alerte fausse fait cesser de lire les
 * vraies.
 */
const SANS_VALEUR_ARBITRAIRE = [
  'overflow-x', 'overflow-y', 'overflow',
  'flex-wrap', 'whitespace', 'pointer-events', 'cursor',
];

const CLASSE_MORTE = new RegExp(
  `(?<![\\w-])(?:${SANS_VALEUR_ARBITRAIRE.join('|')})-[a-z]+-\\[[^\\]]+\\]`,
  'g',
);

// Les deux passages de CONTROLE balayent tout `src`, la ou la TRADUCTION reste
// bornee aux ecrans qui n'avaient jamais recu le systeme. Un controle qui ne
// regarde qu'une partie du code laisse le defaut renaitre dans l'autre.
let defauts = 0;

for (const fichier of fichiers('src')) {
  const lignes = readFileSync(fichier, 'utf8').split(/\r?\n/);
  lignes.forEach((ligne, i) => {
    const signaler = (classe, verdict) => {
      defauts += 1;
      console.log(
        `  ${fichier.replace(/\\/g, '/')}:${i + 1}  ${classe.padEnd(24)} ${verdict}`,
      );
    };

    for (const { motif, verdict } of OMBRES) {
      for (const trouve of ligne.matchAll(motif)) signaler(trouve[0], verdict);
    }

    // Une couleur d'ombre n'est morte que si AUCUNE taille ne l'accompagne
    // sur la meme ligne : `shadow-lg shadow-bissap-500` est coherent — et se
    // fait de toute facon signaler par la premiere regle.
    const porteUneTaille = new RegExp(`(?<![\\w-])shadow-(?:${TAILLES})\\b`).test(ligne);
    if (!porteUneTaille) {
      for (const trouve of ligne.matchAll(COULEUR_SEULE)) {
        signaler(trouve[0], 'couleur d ombre sans ombre  → classe morte, a retirer');
      }
    }

    for (const trouve of ligne.matchAll(CLASSE_MORTE)) {
      signaler(trouve[0], 'valeur entre crochets refusee ici → classe morte');
    }

    for (const [classe, famille, niveau] of ligne.matchAll(HORS_RAMPE)) {
      // Une famille inconnue n'est pas un defaut ici : c'est le travail du
      // premier passage, qui la traduit. On ne juge que les familles maison.
      const rampe = rampes.get(famille);
      if (rampe && !rampe.has(niveau)) {
        const bornes = [...rampe].sort((a, b) => a - b).join(' ');
        signaler(classe, `niveau hors rampe → classe morte (${famille} : ${bornes})`);
      }
    }
  });
}

console.log(
  defauts === 0
    ? '\nControles : aucune ombre hors maison, aucun niveau hors rampe, aucune classe morte.'
    : `\nControles : ${defauts} defaut(s). La seule ombre declaree est --shadow-soft ;` +
        ' les rampes sont celles de globals.css.',
);
if (defauts > 0) process.exitCode = 1;
