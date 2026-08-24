/**
 * Banc d'essai de la caracteristique d'un article — pointure, taille, contenance.
 *
 *   node scripts/verifier-caracteristique.mjs
 *
 * IL REPOND A UNE SEULE QUESTION : peut-on enregistrer une caracteristique A
 * MOITIE SAISIE ? Un nom sans valeurs afficherait « Pointure : » suivi de rien ;
 * des valeurs sans nom afficheraient « 38, 39 » sans dire de quoi il s'agit.
 * Les deux se ressemblent a l'ecriture et ne se voient que chez le client.
 *
 * La base porte deja une contrainte qui refuse les deux moities. Ce banc
 * verifie que le serveur REFUSE AVANT d'y arriver, avec une phrase que le
 * marchand comprend — une contrainte violee lui rendrait « Mise a jour
 * impossible », ce qui ne lui dit pas quoi corriger.
 *
 * La fonction est LUE DANS LA ROUTE, jamais recopiee : une copie diverge, et
 * c'est toujours la copie qu'on eprouve pendant que la vraie derive.
 */

import { readFileSync } from 'node:fs';

const src = readFileSync('src/app/api/dashboard/produits/route.ts', 'utf8');

const bloc = src
  .match(/function caracteristique[\s\S]*?\n}/)[0]
  // On retire le typage : le banc tourne en JavaScript nu.
  .replace(/function caracteristique\([\s\S]*?\n\): [^\n]*\{/, 'function caracteristique(nomBrut, valeursBrutes) {')
  .replace('new Set<string>()', 'new Set()');

const caracteristique = eval(`(${bloc.replace('function caracteristique', 'function')})`);

/** [intitule, nom, valeurs, attendu] — `attendu` null = refus attendu. */
const CAS = [
  ['une pointure ordinaire', 'Pointure', '38, 39, 40', { nom: 'Pointure', valeurs: ['38', '39', '40'] }],
  ['deja un tableau', 'Taille', ['S', 'M', 'L'], { nom: 'Taille', valeurs: ['S', 'M', 'L'] }],
  ['espaces partout', '  Pointure  ', ' 38 ,  39 ', { nom: 'Pointure', valeurs: ['38', '39'] }],
  ['rien du tout', '', '', { nom: null, valeurs: null }],
  ['rien, en tableau vide', '', [], { nom: null, valeurs: null }],
  ['champs absents', undefined, undefined, { nom: null, valeurs: null }],

  // Les deux moities, celles qui motivent tout ce banc.
  ['un nom sans valeurs', 'Pointure', '', null],
  ['des valeurs sans nom', '', '38, 39', null],
  ['un nom d espaces seulement', '   ', '38', null],
  ['des virgules sans contenu', 'Pointure', ' , , ', null],

  // Ce qu'un marchand tape vraiment.
  ['virgule finale', 'Pointure', '38, 39,', { nom: 'Pointure', valeurs: ['38', '39'] }],
  ['doublon', 'Pointure', '38, 39, 38', { nom: 'Pointure', valeurs: ['38', '39'] }],
  ['doublon de casse', 'Taille', 'M, m, L', { nom: 'Taille', valeurs: ['M', 'L'] }],
  ['une seule valeur', 'Contenance', '500 ml', { nom: 'Contenance', valeurs: ['500 ml'] }],
  ['ordre du marchand conserve', 'Taille', 'L, S, M', { nom: 'Taille', valeurs: ['L', 'S', 'M'] }],
];

let echecs = 0;

for (const [intitule, nom, valeurs, attendu] of CAS) {
  const r = caracteristique(nom, valeurs);

  let ok;
  if (attendu === null) {
    // Un refus doit porter une phrase adressee au marchand.
    ok = r.ok === false && typeof r.message === 'string' && r.message.length > 10;
  } else {
    ok = r.ok === true
      && r.nom === attendu.nom
      && JSON.stringify(r.valeurs) === JSON.stringify(attendu.valeurs);
  }

  if (!ok) echecs++;
  const vu = r.ok === false ? `refus « ${r.message} »` : `${r.nom} = ${JSON.stringify(r.valeurs)}`;
  console.log(`${ok ? 'OK  ' : 'RATE'}  ${intitule.padEnd(30)} ${vu}`);
}

console.log();
if (echecs) {
  console.log(`${echecs} cas sur ${CAS.length} ne passent pas.`);
  process.exit(1);
}
console.log(`Les ${CAS.length} cas passent — aucune caracteristique a moitie saisie n'atteint la base.`);
