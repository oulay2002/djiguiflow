/**
 * Verifie le contraste des paires fond/texte reellement ecrites dans le code.
 *
 * Traduire une palette peut produire des couples lisibles sur le papier et
 * illisibles a l'ecran : `amber-700` sur `amber-50` ne donne pas le meme
 * rapport que `mangue-700` sur `mangue-50`. On releve donc les paires telles
 * qu'elles apparaissent dans un meme attribut `className`, et on calcule.
 *
 * Seuil WCAG AA pour du texte courant : 4,5:1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Les valeurs sont celles declarees dans globals.css.
const PALETTE = {
  'nuit-50': '#eef0f8', 'nuit-100': '#d8dcee', 'nuit-200': '#b0badc', 'nuit-300': '#8090c2',
  'nuit-400': '#55679f', 'nuit-500': '#364a80', 'nuit-600': '#263566', 'nuit-700': '#1b2750',
  'nuit-800': '#131c3d', 'nuit-900': '#0c1229',
  'chaux-50': '#f8f7f3', 'chaux-100': '#eeece5', 'chaux-200': '#e0ddd3', 'chaux-300': '#c9c5b8',
  'chaux-400': '#a8a394', 'chaux-500': '#837e70', 'chaux-600': '#5f5b50',
  'bissap-50': '#fdf2f4', 'bissap-100': '#fadde3', 'bissap-200': '#f4b9c6', 'bissap-300': '#e8899f',
  'bissap-400': '#d85372', 'bissap-500': '#c4123f', 'bissap-600': '#a50e36', 'bissap-700': '#830b2b',
  'bissap-800': '#620821', 'bissap-900': '#440618',
  'accent-50': '#edfaf3', 'accent-100': '#d7f3e2', 'accent-200': '#b5e7ca', 'accent-300': '#8ad4ad',
  'accent-400': '#4dbb87', 'accent-500': '#1f9a70', 'accent-600': '#177a5d', 'accent-700': '#125d49',
  'accent-800': '#0f4738', 'accent-900': '#0b2f28',
  'mangue-50': '#fdf6e9', 'mangue-100': '#fbe9c8', 'mangue-200': '#f6d493', 'mangue-300': '#efb75a',
  'mangue-400': '#e9a23b', 'mangue-500': '#d1861f', 'mangue-600': '#a76518', 'mangue-700': '#7d4b13',

  // LE BLANC ET LE NOIR MANQUAIENT, ET C'ETAIT LE TROU LE PLUS LARGE.
  //
  // Ce releve ne reconnaissait que les teintes maison : TOUTE paire faisant
  // intervenir `text-white` ou `bg-white` lui etait invisible, meme ecrite dans
  // un seul et meme `className`. Trouve le 3 septembre 2026 par
  // `contraste-rendu.mjs` — le rang n°1 du podium, `bg-mangue-400 text-white`,
  // rendait 2,17:1 sur l'ecran d'accueil du marchand, et cette sonde-ci
  // annoncait « toutes au-dessus de 4,5:1 ».
  white: '#ffffff', black: '#000000',
  white: '#ffffff',
};

function luminance(hex) {
  const v = parseInt(hex.slice(1), 16);
  const canaux = [16, 8, 0].map((d) => {
    const u = ((v >> d) & 255) / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2];
}

function rapport(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const fichiers = [];
(function marcher(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) marcher(chemin);
    else if (nom.endsWith('.tsx')) fichiers.push(chemin);
  }
})('src');

const paires = new Map();
for (const fichier of fichiers) {
  const contenu = readFileSync(fichier, 'utf8');
  // Chaque chaine de classes est examinee separement : deux classes eloignees
  // dans le fichier ne s'appliquent pas au meme element.
  for (const [, classes] of contenu.matchAll(/(?:className=|color:\s*)["'`]([^"'`]+)["'`]/g)) {
    // Seul l'etat au repos est comparable : `group-hover:bg-nuit-900` va de
    // pair avec `group-hover:text-chaux-50`, et les confronter au texte au
    // repos ferait crier l'outil sur un couple qui n'existe jamais a l'ecran.
    const auRepos = classes
      .split(/\s+/)
      .filter((c) => !c.includes(':') || c.startsWith('sm:') || c.startsWith('lg:'))
      .join(' ');
    // UNE CLASSE A OPACITE N'EST PAS CALCULABLE ICI, ET LA COMPTER FAIT CRIER
    // A TORT. `bg-white/15` avec `text-white/90` se lisait « blanc sur blanc,
    // 1,00:1 » — alors que le fond reel est un voile blanc sur du sombre. Ce
    // qui se cache derriere un alpha releve de `contraste-rendu.mjs`, qui
    // compose les couches ; ici on se tait plutot que de deviner.
    const sansAlpha = auRepos.split(/\s+/).filter((c) => !c.includes('/')).join(' ');
    const fond = sansAlpha.match(/\bbg-((?:nuit|chaux|bissap|accent|mangue)-\d{2,3}|white|black)\b/)?.[1];
    const texte = sansAlpha.match(/\btext-((?:nuit|chaux|bissap|accent|mangue)-\d{2,3}|white|black)\b/)?.[1];
    if (!fond || !texte) continue;
    const cle = `${texte} sur ${fond}`;
    if (!paires.has(cle)) paires.set(cle, { texte, fond, ou: fichier.split('\\').join('/') });
  }
}

let echecs = 0;
for (const [cle, { texte, fond, ou }] of [...paires].sort()) {
  const r = rapport(PALETTE[texte], PALETTE[fond]);
  if (r >= 4.5) continue;
  echecs += 1;
  console.log(`${r.toFixed(2).padStart(5)}:1  ${cle.padEnd(34)} ${ou}`);
}

console.log(
  echecs === 0
    ? `${paires.size} paires examinees, toutes au-dessus de 4,5:1`
    : `\n${echecs} paires sous le seuil, sur ${paires.size} examinees`,
);
