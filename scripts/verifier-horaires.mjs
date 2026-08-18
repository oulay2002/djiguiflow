/**
 * Banc d'essai des horaires d'ouverture.
 *
 *   node scripts/verifier-horaires.mjs
 *
 * POURQUOI UN BANC PLUTOT QU'UN ESSAI DANS L'APPLICATION
 *
 * Une regle horaire ne se teste pas « quand ca tombe bien » : les cas qui
 * cassent — minuit, la veille qui deborde, le jour de fermeture — n'arrivent
 * que quelques heures par semaine. L'instant est donc injecte, et les vingt
 * cas ci-dessous s'executent en une seconde a n'importe quelle heure.
 *
 * Le cas le plus important est le premier : SANS HORAIRES, LA BOUTIQUE EST
 * OUVERTE. Toutes les boutiques deja en service sont dans ce cas, et les
 * fermer d'office ferait plus de degats que le probleme qu'on corrige.
 */

import { etatBoutique, lireHoraires, enHeure } from '../src/lib/horaires.ts';

// L'heure d'Abidjan est UTC+0 : un instant UTC est l'heure locale, sans calcul.
const instant = (iso) => new Date(`${iso}Z`);

const MAQUIS = {
  lun: { ouvre: '11:00', ferme: '22:00' },
  mar: { ouvre: '11:00', ferme: '22:00' },
  mer: { ouvre: '11:00', ferme: '22:00' },
  jeu: { ouvre: '11:00', ferme: '22:00' },
  ven: { ouvre: '18:00', ferme: '02:00' }, // ferme apres minuit
  sam: { ouvre: '18:00', ferme: '02:00' },
  dim: null,                                // ferme le dimanche
};

// 2026-08-17 est un LUNDI. Les dates suivantes s'enchainent donc mar, mer…
const CAS = [
  ['sans horaires du tout — TOUJOURS OUVERT', null, '2026-08-17T03:00:00', true],
  ['horaires illisibles — TOUJOURS OUVERT', { lun: 'nimporte quoi' }, '2026-08-17T03:00:00', true],
  ['objet vide — TOUJOURS OUVERT', {}, '2026-08-17T03:00:00', true],

  ['lundi 12h, en plein service', MAQUIS, '2026-08-17T12:00:00', true],
  ['lundi 10h59, une minute trop tot', MAQUIS, '2026-08-17T10:59:00', false],
  ['lundi 11h00 pile, ca ouvre', MAQUIS, '2026-08-17T11:00:00', true],
  ['lundi 22h00 pile, ca ferme', MAQUIS, '2026-08-17T22:00:00', false],
  ['lundi 3h du matin', MAQUIS, '2026-08-17T03:00:00', false],

  ['vendredi 23h, service de nuit', MAQUIS, '2026-08-21T23:00:00', true],
  ['samedi 1h, la veille deborde', MAQUIS, '2026-08-22T01:00:00', true],
  ['samedi 2h00 pile, c est fini', MAQUIS, '2026-08-22T02:00:00', false],
  ['samedi 14h, entre deux services', MAQUIS, '2026-08-22T14:00:00', false],
  ['dimanche 1h, le samedi deborde', MAQUIS, '2026-08-23T01:00:00', true],
  ['dimanche 12h, jour de fermeture', MAQUIS, '2026-08-23T12:00:00', false],

  ['toute la semaine fermee', { lun: null, mar: null, mer: null, jeu: null, ven: null, sam: null, dim: null }, '2026-08-17T12:00:00', false],
  ['ouvert 24h sur 24', { lun: { ouvre: '00:00', ferme: '23:59' } }, '2026-08-17T12:00:00', true],
];

let ko = 0;

console.log('--- ouvert ou ferme ---');
for (const [titre, horaires, iso, attendu] of CAS) {
  const r = etatBoutique(horaires, instant(iso));
  const ok = r.ouvert === attendu;
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre.padEnd(38)} ${r.ouvert ? 'OUVERT' : 'ferme '}  « ${r.message ?? '(rien)'} »`);
}

// Une boutique fermee le week-end : c'est elle qui produit le cas « ouvre
// mardi », a plus d'un jour de distance. Dimanche chez le maquis rouvre lundi,
// donc « demain » — la premiere version de ce banc l'attendait nomme, et
// c'etait le TEST qui avait tort.
const BUREAU = {
  lun: { ouvre: '08:00', ferme: '17:00' },
  mar: { ouvre: '08:00', ferme: '17:00' },
  mer: { ouvre: '08:00', ferme: '17:00' },
  jeu: { ouvre: '08:00', ferme: '17:00' },
  ven: { ouvre: '08:00', ferme: '17:00' },
  sam: null,
  dim: null,
};

console.log('\n--- ce que lit le client quand c est ferme ---');
for (const [titre, horaires, iso, attendu] of [
  ['lundi 3h, rouvre le matin meme', MAQUIS, '2026-08-17T03:00:00', /ouvre à 11h/i],
  ['lundi 23h, rouvre demain', MAQUIS, '2026-08-17T23:00:00', /demain/i],
  ['dimanche midi, rouvre lundi donc demain', MAQUIS, '2026-08-23T12:00:00', /demain/i],
  ['vendredi 20h, week-end ferme, rouvre lundi', BUREAU, '2026-08-21T20:00:00', /ouvre lundi/i],
  ['samedi midi, rouvre lundi', BUREAU, '2026-08-22T12:00:00', /ouvre lundi/i],
]) {
  const r = etatBoutique(horaires, instant(iso));
  const ok = attendu.test(r.message ?? '');
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre.padEnd(42)} « ${r.message} »`);
}

console.log('\n--- lecture tolerante ---');
for (const [titre, brut, attenduNull] of [
  ['null', null, true],
  ['tableau', [], true],
  ['heure hors bornes', { lun: { ouvre: '25:00', ferme: '22:00' } }, true],
  ['minutes invalides', { lun: { ouvre: '11:99', ferme: '22:00' } }, true],
  ['un seul jour valide suffit', { lun: { ouvre: '11:00', ferme: '22:00' } }, false],
  ['un jour explicitement ferme suffit', { dim: null }, false],
]) {
  const r = lireHoraires(brut);
  const ok = attenduNull ? r === null : r !== null;
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre.padEnd(34)} -> ${r === null ? 'null (toujours ouvert)' : JSON.stringify(r)}`);
}

console.log('\n--- affichage de l heure ---');
for (const [brut, attendu] of [['11:00', '11h'], ['11:30', '11h30'], ['02:00', '2h'], ['09:05', '9h05']]) {
  const ok = enHeure(brut) === attendu;
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${brut} -> ${enHeure(brut)}`);
}

console.log(ko === 0 ? '\nTOUS LES CAS PASSENT' : `\n${ko} CAS EN ECHEC`);
process.exit(ko === 0 ? 0 : 1);
