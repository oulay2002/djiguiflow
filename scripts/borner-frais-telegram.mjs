#!/usr/bin/env node
/**
 * Reserve l'annonce des frais de livraison au groupe des livreurs.
 *
 * ── LE DEFAUT ───────────────────────────────────────────────────────────────
 *
 * Dans « Routeur Telegram », la regle « Frais tapes » de l'aiguilleur ne
 * regardait que la FORME du message : une reponse chiffree a un texte contenant
 * « Commande <ref> ». Elle ne verifiait ni OU le message etait ecrit, ni A QUI
 * il repondait. L'annonce des frais n'etait donc pas reservee aux livreurs.
 * Trouve a l'audit du 22 novembre 2026.
 *
 * ── CE QUE CE SCRIPT CHANGE, ET RIEN D'AUTRE ────────────────────────────────
 *
 *  1. La regle « Frais tapes » exige en plus que le message vienne du groupe
 *     des livreurs de la boutique, et qu'il reponde a un message DU BOT.
 *     Un message qui ne remplit plus la regle tombe sur « Message texte » :
 *     il part a l'assistante, comme tout message de client.
 *  2. Le noeud « Enregistrer les frais » transmet `groupe` a la route
 *     `/api/internal/commandes/frais`, qui le compare ELLE AUSSI au groupe de
 *     la boutique. Les deux chemins qui y menent — montant tape et bouton —
 *     portent deja `groupe` dans leurs donnees : aucun autre noeud ne bouge.
 *
 * Deux verrous, parce qu'une condition de workflow se modifie d'un clic, sans
 * relecture ; celui de la route, lui, passe par un commit.
 *
 * ── L'ORDRE DE MISE EN SERVICE ──────────────────────────────────────────────
 *
 *   1. ce script, `--pour-de-vrai` ;
 *   2. un livreur annonce des frais, par bouton PUIS par montant tape : les
 *      deux doivent s'enregistrer ;
 *   3. alors seulement `FRAIS_GROUPE_EXIGE=1` dans Vercel (ligne Production),
 *      et un commit pour redeployer.
 *
 * L'ordre inverse coupe l'annonce des frais pour tous les livreurs.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/borner-frais-telegram.mjs --hors-ligne     eprouve la
 *        transformation sur l'export du depot, sans toucher a n8n
 *   node scripts/borner-frais-telegram.mjs                  simulation sur le
 *        workflow en production : lit, compare, n'ecrit rien
 *   node scripts/borner-frais-telegram.mjs --pour-de-vrai   ecrit, puis relit
 *
 * `PUT /api/v1/workflows/{id}` ecrit DIRECTEMENT en production — pas de
 * brouillon a publier, contrairement a l'outil MCP. Le workflow reste actif.
 *
 * Variables : N8N_VPS_KEY (obligatoire hors `--hors-ligne`), N8N_VPS_URL.
 */
import { readFileSync } from 'node:fs';

const ID = 'VT0rUAeViDNHrr2Y';
const NOM = 'Routeur Telegram';
const AIGUILLEUR = 'Aiguilleur Telegram';
const REGLE = 'Frais tapes';
const ENREGISTRER = 'Enregistrer les frais';

const W = "$('Webhook').first().json.body";
const F = "$('Charger fiche').first().json";

/** La regle telle qu'elle est aujourd'hui. Tout ecart arrete le script. */
const REGLE_AVANT =
  `={{ !${W}?.callback_query && !!${W}?.message?.reply_to_message`
  + ` && /^\\s*\\d{2,6}\\s*$/.test(String(${W}?.message?.text || ''))`
  + ` && /Commande\\s+\\S+/.test(String(${W}?.message?.reply_to_message?.text || '')) }}`;

/**
 * LES DEUX CONDITIONS AJOUTEES.
 *
 * Le groupe doit etre RENSEIGNE avant d'etre compare : sans ce premier test,
 * une boutique sans groupe de livreurs et un message sans identifiant de
 * conversation donneraient '' === '' — donc vrai.
 */
const AJOUT =
  ` && String(${F}.groupe_livreurs || '').trim() !== ''`
  + ` && String(${W}?.message?.chat?.id || '') === String(${F}.groupe_livreurs || '').trim()`
  + ` && ${W}?.message?.reply_to_message?.from?.is_bot === true`;

const REGLE_APRES = REGLE_AVANT.replace(/ \}\}$/, `${AJOUT} }}`);

const CORPS_AVANT =
  `={{ JSON.stringify({ boutique: String(${F}.slug || ''), reference: $json.reference, montant: $json.montant }) }}`;
const CORPS_APRES =
  `={{ JSON.stringify({ boutique: String(${F}.slug || ''), reference: $json.reference, montant: $json.montant, groupe: String($json.groupe || '') }) }}`;

/**
 * Applique les deux modifications a un workflow, en place.
 *
 * Rend la liste de ce qui a change. LEVE des qu'un element n'a ni sa forme
 * d'avant ni sa forme d'apres : le workflow a ete modifie entre-temps, et
 * ecrire par-dessus effacerait un travail que ce script ne connait pas.
 */
export function transformer(wf) {
  const changements = [];

  const aiguilleur = (wf.nodes || []).find((n) => n.name === AIGUILLEUR);
  if (!aiguilleur) throw new Error(`noeud « ${AIGUILLEUR} » introuvable`);

  const regle = (aiguilleur.parameters?.rules?.values || []).find((v) => v.outputKey === REGLE);
  if (!regle) throw new Error(`regle « ${REGLE} » introuvable dans l aiguilleur`);

  const conditions = regle.conditions?.conditions || [];
  if (conditions.length !== 1) {
    throw new Error(`la regle « ${REGLE} » porte ${conditions.length} conditions, une seule attendue`);
  }

  const condition = conditions[0];
  if (condition.leftValue === REGLE_AVANT) {
    condition.leftValue = REGLE_APRES;
    changements.push(`regle « ${REGLE} » : groupe des livreurs + reponse au bot exiges`);
  } else if (condition.leftValue !== REGLE_APRES) {
    throw new Error(`la regle « ${REGLE} » a derive — ni l ancienne forme ni la nouvelle`);
  }

  const enregistrer = (wf.nodes || []).find((n) => n.name === ENREGISTRER);
  if (!enregistrer) throw new Error(`noeud « ${ENREGISTRER} » introuvable`);

  if (enregistrer.parameters?.jsonBody === CORPS_AVANT) {
    enregistrer.parameters.jsonBody = CORPS_APRES;
    changements.push(`noeud « ${ENREGISTRER} » : transmet le groupe d origine`);
  } else if (enregistrer.parameters?.jsonBody !== CORPS_APRES) {
    throw new Error(`le corps de « ${ENREGISTRER} » a derive — ni l ancienne forme ni la nouvelle`);
  }

  // Les deux noeuds en amont doivent bien fournir `groupe` : sinon le corps
  // enverrait une chaine vide, et la route le tolererait en silence.
  for (const nom of ['Lire le montant tape', 'Lire les frais']) {
    const n = (wf.nodes || []).find((x) => x.name === nom);
    if (!n || !/\bgroupe\s*:/.test(String(n.parameters?.jsCode || ''))) {
      throw new Error(`le noeud « ${nom} » ne fournit pas « groupe »`);
    }
  }

  return changements;
}

/** Evalue une expression n8n `={{ … }}` contre un faux webhook et une fausse fiche. */
function evaluer(expression, { corps, fiche, json = {} }) {
  const source = expression.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
  const noeuds = { Webhook: { body: corps }, 'Charger fiche': fiche };
  const dollar = (nom) => ({ first: () => ({ json: noeuds[nom] }) });
  return new Function('$', '$json', `return (${source});`)(dollar, json);
}

function eprouverHorsLigne() {
  const wf = JSON.parse(readFileSync(new URL('../n8n/routeur-telegram.json', import.meta.url), 'utf8'));
  const changements = transformer(wf);
  console.log('Transformation de l export du depot :');
  for (const c of changements) console.log(`  + ${c}`);

  const regle = wf.nodes.find((n) => n.name === AIGUILLEUR).parameters.rules.values
    .find((v) => v.outputKey === REGLE).conditions.conditions[0].leftValue;

  const GROUPE = '-1001234567890';
  const fiche = { groupe_livreurs: GROUPE, slug: 'boutique-de-banc' };
  const message = (chat, deBot, texte = '1500') => ({
    message: {
      text: texte,
      chat: { id: chat },
      reply_to_message: { text: 'Commande ATT-1 — quel montant ?', from: { is_bot: deBot } },
    },
  });

  const cas = [
    ['un livreur repond au bot, dans le groupe', message(Number(GROUPE), true), fiche, true],
    ['un client repond a SON PROPRE message, en prive', message(555001, false), fiche, false],
    ['un client repond a un message du bot, en prive', message(555001, true), fiche, false],
    ['dans le groupe, mais en reponse a un humain', message(Number(GROUPE), false), fiche, false],
    ['un autre groupe que celui de la boutique', message(-1009999999999, true), fiche, false],
    ['boutique SANS groupe de livreurs', message(Number(GROUPE), true), { groupe_livreurs: '' }, false],
    ['boutique sans groupe ET message sans conversation', { message: { text: '1500', reply_to_message: { text: 'Commande ATT-1', from: { is_bot: true } } } }, { groupe_livreurs: null }, false],
    ['le texte n est pas un montant', message(Number(GROUPE), true, 'bonjour'), fiche, false],
  ];

  let rouges = 0;
  console.log('\nLa regle, eprouvee :');
  for (const [nom, corps, f, attendu] of cas) {
    const obtenu = evaluer(regle, { corps, fiche: f }) === true;
    if (obtenu !== attendu) rouges += 1;
    console.log(`  ${obtenu === attendu ? '✓' : '✗'} ${nom} → ${obtenu ? 'frais' : 'refuse'}`);
  }

  // L'ANCIENNE regle doit, elle, laisser passer le client : sinon ces cas ne
  // prouveraient rien — un test qu'on n'a jamais vu rouge ne protege de rien.
  const avant = evaluer(REGLE_AVANT, { corps: message(555001, false), fiche }) === true;
  console.log(`  ${avant ? '✓' : '✗'} temoin : l ANCIENNE regle laissait passer le client en prive`);
  if (!avant) rouges += 1;

  const corps = wf.nodes.find((n) => n.name === ENREGISTRER).parameters.jsonBody;
  const envoye = JSON.parse(evaluer(corps, {
    corps: {}, fiche, json: { reference: 'ATT-1', montant: 1500, groupe: GROUPE },
  }));
  const juste = envoye.groupe === GROUPE && envoye.boutique === 'boutique-de-banc'
    && envoye.reference === 'ATT-1' && envoye.montant === 1500;
  console.log(`  ${juste ? '✓' : '✗'} le corps envoye a la route porte le groupe : ${JSON.stringify(envoye)}`);
  if (!juste) rouges += 1;

  // Rejouer la transformation ne doit plus rien changer.
  const rejeu = transformer(wf);
  console.log(`  ${rejeu.length === 0 ? '✓' : '✗'} rejouee, la transformation ne change plus rien`);
  if (rejeu.length) rouges += 1;

  if (rouges) {
    console.error(`\n${rouges} controle(s) en echec.`);
    process.exit(1);
  }
  console.log('\nTout est juste. Rien n a ete ecrit, ni dans n8n ni dans le depot.');
}

async function surLeServeur(pourDeVrai) {
  const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
  const CLE = process.env.N8N_VPS_KEY;
  if (!CLE) {
    console.error('Il manque N8N_VPS_KEY.');
    process.exit(1);
  }

  const appeler = async (chemin, options = {}) => {
    const r = await fetch(`${VPS}/api/v1${chemin}`, {
      ...options,
      headers: { 'X-N8N-API-KEY': CLE, 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(30_000),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : null;
  };

  // Refuses par l'API a l'ecriture : voir aligner-versions-noeuds-vps.mjs.
  const REGLAGES_REFUSES = ['binaryMode', 'timeSavedMode'];
  const reglagesPropres = (s) =>
    Object.fromEntries(Object.entries(s || {}).filter(([k]) => !REGLAGES_REFUSES.includes(k)));

  console.log(pourDeVrai ? '=== ECRITURE EN PRODUCTION ===\n' : '=== SIMULATION — rien ne sera ecrit ===\n');

  const wf = await appeler(`/workflows/${ID}`);
  if (wf.name !== NOM) throw new Error(`l identifiant ${ID} designe « ${wf.name} », pas « ${NOM} »`);
  console.log(`${wf.name} — ${wf.active ? 'actif' : 'INACTIF'}, ${wf.nodes.length} noeuds, modifie le ${wf.updatedAt}`);

  const changements = transformer(wf);
  if (!changements.length) {
    console.log('\nDeja en place : rien a faire.');
    return;
  }
  for (const c of changements) console.log(`  + ${c}`);

  if (!pourDeVrai) {
    console.log('\nRelancez avec --pour-de-vrai pour ecrire.');
    return;
  }

  await appeler(`/workflows/${ID}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: wf.name, nodes: wf.nodes, connections: wf.connections,
      settings: reglagesPropres(wf.settings),
    }),
  });

  // LE RETOUR DE L'API NE PROUVE PAS L'ETAT FINAL : on relit.
  const relu = await appeler(`/workflows/${ID}`);
  const restant = transformer(relu);
  if (restant.length) throw new Error('ecriture acceptee, mais la relecture montre l ancienne forme');
  if (relu.nodes.length !== wf.nodes.length) {
    throw new Error(`la relecture compte ${relu.nodes.length} noeuds au lieu de ${wf.nodes.length}`);
  }
  if (JSON.stringify(relu.connections) !== JSON.stringify(wf.connections)) {
    throw new Error('la relecture montre des connexions differentes');
  }
  if (relu.active !== wf.active) throw new Error('le workflow a change d etat d activation');

  console.log(`\nEcrit et relu : les deux modifications sont en place, ${relu.nodes.length} noeuds,`
    + ` connexions inchangees, workflow ${relu.active ? 'actif' : 'INACTIF'}.`);
  console.log('Suite : faire annoncer des frais par un livreur (bouton, puis montant tape),');
  console.log('puis poser FRAIS_GROUPE_EXIGE=1 dans Vercel, ligne Production, et redeployer.');
}

const horsLigne = process.argv.includes('--hors-ligne');
const pourDeVrai = process.argv.includes('--pour-de-vrai');

if (import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, '/')}`).href) {
  if (horsLigne) {
    eprouverHorsLigne();
  } else {
    surLeServeur(pourDeVrai).catch((e) => {
      console.error('Interrompu :', e.message);
      process.exit(1);
    });
  }
}
