/**
 * Banc d'essai du controle de livrabilite.
 *
 *   node scripts/verifier-livrable.mjs
 *
 * Il repond a une seule question : cette commande peut-elle etre LIVREE ?
 * Le 21 aout 2026, l'assistante a invente « Inconnu », « 0000000000 » et
 * « Non communiquee », puis valide. La course est partie, et personne ne
 * pouvait l'honorer.
 */

import { readFileSync } from 'node:fs';
import { normaliserTelephone } from '../src/lib/telephone.ts';

const src = readFileSync('src/app/api/commandes/sync/route.ts', 'utf8');
const bloc = src.match(/function coordonneesLivrables[\s\S]*?\n}/)[0]
  .replace(/: unknown/g, '')
  .replace(/: string\[\]/g, '');
const coordonneesLivrables = eval(`(${bloc.replace('function coordonneesLivrables', 'function')})`);

const CAS = [
  ['un vrai client', 'Konan Clement', '0102918886', 'Akouedo rue G11', []],
  ['indicatif international', 'Gao Edwige', '+225 07 09 87 65 43', 'Yopougon', []],
  ['tout invente par le modele', 'Inconnu', '0000000000', 'Non communiquée', ['nom', 'adresse', 'telephone']],
  ['sans nom', '', '0102918886', 'Cocody', ['nom']],
  ['sans telephone', 'Awa', '', 'Cocody', ['telephone']],
  ['sans adresse', 'Awa', '0102918886', '', ['adresse']],
  ['numero trop court', 'Awa', '010291886', 'Cocody', ['telephone']],
  ['formules de remplissage', 'N/A', '0102918886', 'à définir', ['nom', 'adresse']],
  ['chiffres tous identiques', 'Awa', '1111111111', 'Cocody', ['telephone']],
];

let ko = 0;
console.log('--- une commande livrable, ou ce qui manque ---');
for (const [titre, nom, tel, adresse, attendu] of CAS) {
  const obtenu = coordonneesLivrables(nom, tel, adresse).sort();
  const ok = JSON.stringify(obtenu) === JSON.stringify([...attendu].sort());
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre.padEnd(28)} -> ${JSON.stringify(obtenu)}`);
}

console.log(ko === 0 ? '\nTOUS LES CAS PASSENT' : `\n${ko} CAS EN ECHEC`);
process.exit(ko === 0 ? 0 : 1);
