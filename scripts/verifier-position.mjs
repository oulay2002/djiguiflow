/**
 * Banc d'essai de la reconnaissance de position.
 *
 *   node scripts/verifier-position.mjs
 *
 * POURQUOI UN SCRIPT PLUTOT QU'UN ESSAI EN PRODUCTION
 *
 * Cette fonction lit ce qu'un client colle dans une conversation : des formes
 * qu'on ne choisit pas, et qu'on ne peut pas toutes provoquer a la demande sur
 * un vrai telephone. Le danger n'est pas de rater une position — c'est d'en
 * inventer une. Un point faux est PIRE que pas de point : le livreur lui fait
 * confiance et se perd avec assurance.
 *
 * Les cas « doit refuser » comptent donc autant que les autres.
 */

import {
  coordonneesDansTexte,
  lienCourtDansTexte,
  pointValide,
} from '../src/lib/position.ts';

const ABIDJAN = { latitude: 5.3599517, longitude: -4.0082563 };

const DOIT_LIRE = [
  ['epingle partagee par Google Maps',
    'https://maps.google.com/?q=5.3599517,-4.0082563'],
  ['lien de recherche par coordonnees',
    'https://www.google.com/maps/search/5.3599517,-4.0082563'],
  ['virgule encodee dans l URL',
    'https://www.google.com/maps/search/?api=1&query=5.3599517%2C-4.0082563'],
  ['centre de carte',
    'https://www.google.com/maps/@5.3599517,-4.0082563,17z'],
  ['point exact d un lieu (prioritaire sur le centre)',
    'https://www.google.com/maps/place/Zahara/@5.9,-5.9,17z/data=!3d5.3599517!4d-4.0082563'],
  ['lien noye dans une phrase',
    'Bonsoir, voici ma position https://maps.google.com/?q=5.3599517,-4.0082563 merci !'],
  ['itineraire',
    'https://www.google.com/maps/dir/?api=1&destination=5.3599517,-4.0082563'],
];

const DOIT_REFUSER = [
  ['message ordinaire', 'Bonjour, je voudrais 2 pizzas'],
  ['un chiffre seul', '2'],
  ['texte vide', ''],
  ['numero de telephone', 'Mon numero est 0102918886'],
  ['lien Maps sans coordonnees', 'https://www.google.com/maps/place/Restaurant+Zahara'],
  ['le point zero au large du golfe de Guinee', 'https://maps.google.com/?q=0,0'],
  ['latitude impossible', 'https://maps.google.com/?q=95.5,-4.0'],
  ['longitude impossible', 'https://maps.google.com/?q=5.3,-200.1'],
  ['montant qui ressemble a un couple', 'Total : 7000,5000 FCFA'],
];

const proche = (a, b) => Math.abs(a - b) < 0.000001;

let echecs = 0;

console.log('--- doit lire une position ---');
for (const [titre, texte] of DOIT_LIRE) {
  const r = coordonneesDansTexte(texte);
  const ok = r && proche(r.latitude, ABIDJAN.latitude) && proche(r.longitude, ABIDJAN.longitude);
  if (!ok) echecs++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre.padEnd(48)} ${r ? `${r.latitude}, ${r.longitude}` : 'null'}`);
}

console.log('--- doit refuser ---');
for (const [titre, texte] of DOIT_REFUSER) {
  const r = coordonneesDansTexte(texte);
  const ok = r === null;
  if (!ok) echecs++;
  console.log(`  ${ok ? 'ok   ' : 'FUITE'} ${titre.padEnd(48)} ${r ? `${r.latitude}, ${r.longitude}` : 'null'}`);
}

console.log('--- liens courts reperes (sans appel reseau) ---');
for (const [titre, texte, attendu] of [
  ['lien court seul', 'https://maps.app.goo.gl/AbCdEf123', true],
  ['lien court dans une phrase', 'me voici : https://maps.app.goo.gl/AbCdEf123 !', true],
  ['ancien format goo.gl', 'https://goo.gl/maps/XyZ', true],
  ['autre raccourcisseur, a ignorer', 'https://bit.ly/abcd', false],
]) {
  const r = lienCourtDansTexte(texte);
  const ok = attendu ? !!r : r === null;
  if (!ok) echecs++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre.padEnd(48)} ${r ?? 'null'}`);
}

console.log('--- bornes ---');
for (const [titre, lat, lng, attendu] of [
  ['Abidjan', 5.3599517, -4.0082563, true],
  ['zero absolu', 0, 0, false],
  ['NaN', Number.NaN, -4, false],
  ['pole sud', -90, 0, true],
]) {
  const ok = pointValide(lat, lng) === attendu;
  if (!ok) echecs++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre}`);
}

console.log(echecs === 0 ? '\nTOUS LES CAS PASSENT' : `\n${echecs} CAS EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
