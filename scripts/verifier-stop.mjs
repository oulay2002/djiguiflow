/**
 * Banc d'essai de la reconnaissance « stop ».
 *
 *   node scripts/verifier-stop.mjs
 *
 * Les faux negatifs (colonne DOIT ARRETER) coutent une session bannie.
 * Les faux positifs (colonne DOIT PASSER) coutent une commande perdue en
 * silence, ce qui est pire pour LE CLIENT — d'ou les cas de commande ci-dessous,
 * qui sont la vraie raison d'etre de ce banc.
 */

import { estDemandeStop } from '../src/lib/relances.ts';

const DOIT_ARRETER = [
  'stop',
  'STOP',
  'Stop.',
  'stop svp',
  'Stop merci',
  'désabonnez-moi',
  'desabonner',
  'Désabonnement',
  'je veux me désinscrire',
  'unsubscribe',
  'ne m’écrivez plus',
  'ne plus recevoir de messages',
  'plus de pub svp',
  'arrêtez',
  'arrêtez de m’envoyer ça',
  'laissez-moi tranquille',
];

const DOIT_PASSER = [
  'bonjour',
  'je veux commander 2 attiéké poisson',
  'bonjour, stoppez le piment sur mon attiéké et ajoutez du poisson braisé svp',
  'c’est où le stop de la gare pour la livraison ? je suis juste à côté du grand carrefour',
  'ma commande est arrivée merci',
  // Les deux cas qui comptent : brefs, ils contiennent le mot, et pourtant ce
  // sont des instructions de cuisine. Les intercepter perdrait la commande.
  'arrêtez le piment svp',
  'arrête le poisson, mets du poulet',
  'combien coûte la livraison à Yopougon',
  '',
  '   ',
  'ok',
  'bonjour je voudrais savoir si vous êtes ouverts, et sinon à quelle heure vous rouvrez demain',
];

let ko = 0;

console.log('--- doit ARRETER les relances ---');
for (const t of DOIT_ARRETER) {
  const ok = estDemandeStop(t) === true;
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} « ${t} »`);
}

console.log('\n--- doit PASSER a l assistante ---');
for (const t of DOIT_PASSER) {
  const ok = estDemandeStop(t) === false;
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} « ${t.slice(0, 60)}${t.length > 60 ? '…' : ''} »`);
}

console.log(ko === 0 ? '\nTOUS LES CAS PASSENT' : `\n${ko} CAS EN ECHEC`);
process.exit(ko === 0 ? 0 : 1);
