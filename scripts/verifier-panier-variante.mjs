/**
 * Banc d'essai du panier a plusieurs tailles.
 *
 *   node scripts/verifier-panier-variante.mjs
 *
 * IL REPOND A UNE SEULE QUESTION : deux pointures du meme modele peuvent-elles
 * se confondre en une seule ligne ?
 *
 * Le panier etait indexe par le seul identifiant de produit. Un client qui
 * demandait un 39 ET un 41 se serait vu livrer deux fois la meme taille — sans
 * qu'aucun ecran, ni le sien ni celui du marchand, ne montre l'erreur. Le
 * defaut n'apparait qu'a la livraison, chez le client.
 *
 * Les fonctions sont LUES DANS LA PAGE, jamais recopiees : une copie diverge,
 * et c'est toujours la copie qu'on eprouve pendant que la vraie derive.
 */

import { readFileSync } from 'node:fs';

const src = readFileSync('src/app/boutiques/[id]/page.tsx', 'utf8');

// Le fichier peut etre en CRLF : les motifs tolerent donc le retour chariot.
// Sans cela le banc echouerait en annoncant que la fonction a disparu, ce qui
// enverrait chercher un probleme qui n'existe pas.
const attraper = (motif, quoi) => {
  const m = src.match(motif);
  if (!m) throw new Error(`${quoi} : introuvable dans la page — renommee ?`);
  return m[0];
};

const blocClef = attraper(/const clefLigne = [\s\S]*?;\r?\n/, 'clefLigne');
const blocLit = attraper(/const litClef = \(clef: string\) => \{[\s\S]*?\r?\n {2}\};/, 'litClef');

const js = (blocClef + blocLit).replace(/: string/g, '').replace(/const /g, 'var ');

const { clefLigne, litClef } = eval(
  `(function(){ ${js}; return { clefLigne: clefLigne, litClef: litClef }; })()`,
);

let echecs = 0;
const verifier = (intitule, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) {
    echecs++;
    console.log(`RATE  ${intitule.padEnd(48)} ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`);
    return;
  }
  console.log(`OK    ${intitule.padEnd(48)} ${JSON.stringify(obtenu)}`);
};

// ---- L'aller-retour, sur ce qu'un vrai catalogue contient.
const CAS = [
  ['reference de menu, sans choix', 'P1755123456789', ''],
  ['reference de menu, pointure', 'P1755123456789', '39'],
  ['uuid, taille lettre', '3fd3ccda-21c4-44df-aadb-4100bde85941', 'M'],
  ['valeur avec espace', 'P1755123456789', '500 ml'],
  ['valeur avec tiret', 'P1755123456789', '38-39'],
  ['valeur accentuee', 'P1755123456789', 'Éclair'],
];

for (const [intitule, pid, variante] of CAS) {
  verifier(`aller-retour · ${intitule}`, litClef(clefLigne(pid, variante)), { pid, variante });
}

// ---- CE QUI MOTIVE LE BANC : deux tailles ne se confondent pas.
verifier('deux pointures donnent deux clefs distinctes', clefLigne('P1', '39') !== clefLigne('P1', '41'), true);
verifier('sans choix, la clef reste l identifiant nu', clefLigne('P1', ''), 'P1');
verifier('sans choix ne collisionne pas avec un choix', clefLigne('P1', '') !== clefLigne('P1', '39'), true);

// ---- La somme par article, celle qui borne le stock.
const panier = {
  [clefLigne('P1', '39')]: 2,
  [clefLigne('P1', '41')]: 1,
  [clefLigne('P2', '')]: 5,
};

const prisPour = (pid) =>
  Object.entries(panier)
    .filter(([clef]) => litClef(clef).pid === pid)
    .reduce((s, [, q]) => s + q, 0);

verifier('le stock se compte sur la SOMME des tailles', prisPour('P1'), 3);
verifier('un article sans taille se compte normalement', prisPour('P2'), 5);
verifier('un article absent vaut zero', prisPour('P3'), 0);

// ---- Le panier garde bien trois lignes, pas deux.
verifier('trois lignes distinctes en panier', Object.keys(panier).length, 3);

console.log();
if (echecs) {
  console.log(`${echecs} cas ne passent pas.`);
  process.exit(1);
}
console.log('Tous les cas passent — deux tailles du meme article restent deux lignes.');
