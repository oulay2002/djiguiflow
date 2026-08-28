#!/usr/bin/env node
/**
 * Le banc de l'écran des droits.
 *
 * ── CE QU'IL ÉPROUVE, ET POURQUOI DANS CET ORDRE ───────────────────────────
 *
 * Les REFUS d'abord. Un écran de protection des données ne se juge pas à ce
 * qu'il montre, mais à ce qu'il refuse de montrer : chaque cas de la première
 * moitié vise une manière d'obtenir les données de quelqu'un d'autre. Un banc
 * qui ne vérifierait que le succès laisserait passer exactement la faute que
 * cet écran existe pour empêcher.
 *
 * ── IL N'EFFACE RIEN ───────────────────────────────────────────────────────
 *
 * Aucun contrôle ici ne déclenche un effacement réel : l'appel testé est celui
 * SANS confirmation, qui doit être refusé. Éprouver l'effacement pour de vrai
 * demande de capturer l'état, de l'effacer, de le vérifier, puis de le
 * remettre — cela se fait à la main, sur une boutique factice, jamais dans un
 * banc qu'on relance sans y penser.
 *
 * ── COMMENT LE LANCER ──────────────────────────────────────────────────────
 *
 *   REF=<reference> JETON=<jeton_suivi> TEL4=<4 chiffres> COMMANDES=<n> \
 *     node scripts/essai-droits.mjs
 *
 * `COMMANDES` est le nombre de commandes que cette personne doit avoir : c'est
 * le contrôle le plus important du banc — le dossier ne doit JAMAIS ramasser
 * celles d'un autre. Les valeurs se lisent en base :
 *
 *   select reference, jeton_suivi, right(client_telephone, 4) from commandes
 *   where jeton_suivi is not null limit 1;
 *
 * `BASE` vise la production par défaut. Une préversion Vercel ne convient pas :
 * elle n'a pas la clé de service Supabase et rend 503 sur toutes les routes qui
 * lisent la base — `/api/suivi` y échoue de la même façon.
 */

const BASE = process.env.BASE || 'https://www.djiguiflow.com';
const REF = process.env.REF;
const JETON = process.env.JETON;
const TEL4 = process.env.TEL4;
const ATTENDUES = Number(process.env.COMMANDES || 0);

if (!REF || !JETON || !TEL4) {
  console.error('Il faut REF, JETON et TEL4. Voir l en-tete de ce fichier.');
  process.exit(2);
}

const cas = [];
const verifier = (nom, attendu, obtenu) => {
  const ok = attendu === obtenu;
  cas.push(ok);
  console.log(`${ok ? '  OK  ' : ' ECHEC'} ${nom} — attendu ${attendu}, obtenu ${obtenu}`);
};

async function appel(chemin, corps) {
  const r = await fetch(BASE + chemin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* page HTML : on garde le statut */ }
  return { statut: r.status, corps: j };
}

console.log(`Banc des droits — ${BASE}`);
console.log();
console.log('=== CE QUI DOIT ETRE REFUSE ===');

// Une reference SEULE. C'est la forme evidente et dangereuse : les references
// se devinent — compteurs sequentiels, formes baties sur le telephone.
verifier('reference nue', 404, (await appel('/api/mes-donnees', { ref: REF })).statut);

// Celui qui a devine une reference et essaie les numeros.
verifier('quatre chiffres faux', 404,
  (await appel('/api/mes-donnees', { ref: REF, tel4: '9999' })).statut);

// Un jeton faux n'est pas un oubli, c'est une tentative.
const jetonFaux = await appel('/api/mes-donnees', { ref: REF, t: '0'.repeat(32) });
verifier('jeton faux', 404, jetonFaux.statut);

// Le refus doit etre IDENTIQUE pour une reference inconnue et pour une vraie
// mal prouvee : les distinguer ferait de cet ecran un detecteur de clients.
const inconnue = await appel('/api/mes-donnees', { ref: 'ZZZ-0000000000-0000', tel4: '1234' });
verifier('reference inexistante', 404, inconnue.statut);
const memeRefus = JSON.stringify(inconnue.corps) === JSON.stringify(jetonFaux.corps);
cas.push(memeRefus);
console.log(`${memeRefus ? '  OK  ' : ' ECHEC'} le refus ne distingue pas « inconnue » de « mal prouvee »`);

// Un lien precharge, un double envoi : rien ne doit etre detruit sans que la
// personne l'ait demande explicitement.
verifier('effacement sans confirmation', 400,
  (await appel('/api/mes-donnees/effacement', { ref: REF, t: JETON })).statut);

console.log();
console.log('=== CE QUI DOIT PASSER ===');

const avecJeton = await appel('/api/mes-donnees', { ref: REF, t: JETON });
verifier('jeton juste', 200, avecJeton.statut);

if (avecJeton.statut === 200) {
  const d = avecJeton.corps;

  const masque = /••/.test(String(d.numero ?? ''));
  cas.push(masque);
  console.log(`${masque ? '  OK  ' : ' ECHEC'} le numero est masque (${d.numero})`);

  const complet = (d.traitements?.length ?? 0) >= 5 && (d.horsDePortee?.length ?? 0) >= 3;
  cas.push(complet);
  console.log(`${complet ? '  OK  ' : ' ECHEC'} l inventaire (${d.traitements?.length}) et les`
    + ` limites (${d.horsDePortee?.length}) accompagnent le dossier`);

  // LE CONTROLE QUI COMPTE LE PLUS. Un dossier qui ramasserait les commandes
  // d'un autre serait la fuite meme que cet ecran existe pour empecher.
  if (ATTENDUES > 0) {
    verifier('le dossier ne porte QUE ses commandes', ATTENDUES, d.commandes?.length ?? -1);
  } else {
    console.log('  --   nombre de commandes non verifie (poser COMMANDES=<n>)');
  }
}

verifier('quatre chiffres justes', 200,
  (await appel('/api/mes-donnees', { ref: REF, tel4: TEL4 })).statut);

console.log();
const passes = cas.filter(Boolean).length;
console.log(`${passes}/${cas.length} controles passes.`);

// LE BANC CONSOMME HUIT APPELS. Le plafond de rafale en autorise vingt par
// tranche de dix minutes et par adresse : deux passages consecutifs tiennent,
// le troisieme rendra 429. Un 429 en tete de banc n'est donc PAS un defaut de
// l'ecran — c'est le banc qui s'est bloque lui-meme. Attendre dix minutes.
process.exitCode = passes === cas.length ? 0 : 1;
