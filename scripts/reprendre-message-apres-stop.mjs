/**
 * Le routeur WhatsApp perdait le message du client apres le controle « stop ».
 *
 * ── LE DEFAUT ──────────────────────────────────────────────────────────────
 *
 * Constate le 24 novembre 2026, a 11 h 18 : un client ecrit a une boutique,
 * l'assistante echoue, il recoit le message de repli. Dans l'execution, le
 * « Cerveau marchand » a ete appele SANS AUCUNE DONNEE — ni boutique, ni
 * texte, ni destinataire — et a demande le menu de la boutique « undefined ».
 *
 * La cause est dans le routeur. Un message qui RESSEMBLE a une demande d'arret
 * des relances (« stop », « arret », « ne plus », « laissez »…) passe par
 * « Enregistrer le stop », un appel HTTP. Si l'API repond que ce n'en est pas
 * une, le message repart vers « Position ? » puis vers l'assistante — mais
 * l'element qui circule n'est plus le message : c'est la REPONSE de l'appel,
 * `{ reconnu: false }`. Tout ce qui lit `$json` en aval lit du vide.
 *
 * Le filtre est large a dessein : c'est l'API qui tranche. « Je ne veux plus
 * de piment » ou « livrez a l'arret du bus » y passent donc, et tombaient dans
 * le trou. Un client qui ecrit une phrase banale recevait « l'assistante est
 * en panne ».
 *
 * ── LE CORRECTIF ───────────────────────────────────────────────────────────
 *
 * UN noeud, entre « Stop reconnu ? » (sortie « non ») et « Position ? » : il
 * remet en circulation le message tel que « Normalisateur WA » l'avait rendu.
 * Rien d'autre ne change — ni les conditions, ni l'appel a l'assistante, ni
 * la branche ou le stop EST reconnu.
 *
 * On ne reecrit pas les noeuds en aval pour qu'ils lisent « Normalisateur WA »
 * chacun de leur cote : ils sont une dizaine, et le prochain qu'on ajouterait
 * retomberait dans le meme trou. Un seul point de reprise le ferme pour tous.
 *
 * ── LANCER ─────────────────────────────────────────────────────────────────
 *
 *   node scripts/reprendre-message-apres-stop.mjs --hors-ligne     eprouve la
 *        transformation sur la copie du depot ; n'appelle rien
 *   node scripts/reprendre-message-apres-stop.mjs                  simulation
 *        sur le serveur : lit, montre, n'ecrit rien
 *   node scripts/reprendre-message-apres-stop.mjs --pour-de-vrai   ecrit, puis
 *        relit
 *
 * Variables : N8N_VPS_KEY (obligatoire hors `--hors-ligne`), N8N_VPS_URL.
 * `PUT /workflows/{id}` ecrit DIRECTEMENT en production : il n'y a pas de
 * brouillon sur ce serveur.
 */
import { readFileSync } from 'node:fs';

const ID = 'xGw9MbvqvN3XAPpQ';
const NOM = 'Routeur WhatsApp';

const SOURCE = 'Normalisateur WA';
const AIGUILLAGE = 'Stop reconnu ?';
const SUITE = 'Position ?';
const REPRISE = 'Reprendre le message';
/** Sortie « non » d'un noeud If : l'index 1. */
const SORTIE_NON = 1;

const CODE = [
  '// Le message, tel que le normalisateur l\'a rendu.',
  '//',
  '// « Enregistrer le stop » est un appel HTTP : ce qui en sort est sa REPONSE,',
  '// pas le message. Sans cette reprise, tout ce qui suit lisait `$json` vide —',
  '// et l\'assistante etait appelee sans boutique ni texte.',
  `return [{ json: $('${SOURCE}').first().json }];`,
].join('\n');

/**
 * Applique le correctif a un workflow, EN PLACE. Rend la liste de ce qui a
 * change — vide si tout y est deja. Rejouable sans effet.
 */
export function transformer(wf) {
  const changements = [];
  const noeud = (nom) => wf.nodes.find((n) => n.name === nom);

  const source = noeud(SOURCE);
  const aiguillage = noeud(AIGUILLAGE);
  const suite = noeud(SUITE);
  if (!source || !aiguillage || !suite) {
    throw new Error(`le workflow ne porte pas « ${SOURCE} », « ${AIGUILLAGE} » et « ${SUITE} » : ce n'est pas celui qu'on croit`);
  }

  if (!noeud(REPRISE)) {
    wf.nodes.push({
      parameters: { jsCode: CODE },
      // Meme type et meme version que le normalisateur : ce qui tourne deja
      // sur ce serveur, plutot qu'une version supposee.
      type: source.type,
      typeVersion: source.typeVersion,
      // Entre l'aiguillage et la suite, pour que le dessin dise le chemin.
      position: [
        Math.round((aiguillage.position[0] + suite.position[0]) / 2),
        Math.round((aiguillage.position[1] + suite.position[1]) / 2),
      ],
      id: 'b7d2c1e4-5a3f-4c8e-9d61-2f0a7e4b9c13',
      name: REPRISE,
    });
    changements.push(`noeud « ${REPRISE} » ajoute`);
  }

  const sorties = (wf.connections[AIGUILLAGE] ??= { main: [] }).main;
  while (sorties.length <= SORTIE_NON) sorties.push(null);
  const non = sorties[SORTIE_NON] ?? [];

  const versReprise = non.length === 1 && non[0].node === REPRISE;
  if (!versReprise) {
    // On ne detourne que le fil qu'on connait : s'il mene ailleurs que prevu,
    // le routeur a change, et l'ecraser casserait autre chose.
    if (!(non.length === 1 && non[0].node === SUITE)) {
      throw new Error(`la sortie « non » de « ${AIGUILLAGE} » ne mene plus a « ${SUITE} » seul : ${JSON.stringify(non)}`);
    }
    sorties[SORTIE_NON] = [{ node: REPRISE, type: 'main', index: 0 }];
    changements.push(`« ${AIGUILLAGE} » (non) -> « ${REPRISE} »`);
  }

  const apres = wf.connections[REPRISE]?.main?.[0] ?? [];
  if (!(apres.length === 1 && apres[0].node === SUITE)) {
    wf.connections[REPRISE] = { main: [[{ node: SUITE, type: 'main', index: 0 }]] };
    changements.push(`« ${REPRISE} » -> « ${SUITE} »`);
  }

  return changements;
}

/**
 * Ce que le noeud rend, calcule comme n8n le calcule : on execute SON code,
 * avec un `$` qui ne connait que le normalisateur.
 */
export function rejouerLaReprise(wf, message) {
  const reprise = wf.nodes.find((n) => n.name === REPRISE);
  const $ = (nom) => {
    if (nom !== SOURCE) throw new Error(`le code lit « ${nom} », qui n'est pas « ${SOURCE} »`);
    return { first: () => ({ json: message }) };
  };
  return new Function('$', reprise.parameters.jsCode)($);
}

function eprouverHorsLigne() {
  const wf = JSON.parse(readFileSync(new URL('../n8n/routeur-whatsapp.json', import.meta.url), 'utf8'));
  const avant = { noeuds: wf.nodes.length, fils: JSON.stringify(wf.connections) };
  let rouges = 0;
  const dire = (ok, texte) => { console.log(`  ${ok ? '✓' : '✗'} ${texte}`); if (!ok) rouges += 1; };

  console.log('=== HORS LIGNE — sur la copie du depot, rien n est appele ===\n');
  const changements = transformer(wf);
  for (const c of changements) console.log(`  + ${c}`);
  // La copie du depot est reexportee chaque nuit depuis le serveur : une fois
  // le correctif en production, elle le porte deja. Ce banc doit alors encore
  // passer — il verifie la FORME, pas seulement le passage de l'une a l'autre.
  const dejaLa = changements.length === 0;
  if (dejaLa) console.log('  (la copie du depot porte deja le correctif)');
  console.log('');

  dire(
    wf.nodes.length === avant.noeuds + (dejaLa ? 0 : 1),
    dejaLa ? `aucun noeud ajoute (${wf.nodes.length})` : `un noeud de plus (${avant.noeuds} -> ${wf.nodes.length})`,
  );

  const non = wf.connections[AIGUILLAGE].main[SORTIE_NON];
  dire(non.length === 1 && non[0].node === REPRISE, `« ${AIGUILLAGE} » (non) mene a « ${REPRISE} »`);
  dire(wf.connections[REPRISE].main[0][0].node === SUITE, `« ${REPRISE} » mene a « ${SUITE} »`);

  // La branche ou le stop EST reconnu ne doit pas bouger.
  const oui = wf.connections[AIGUILLAGE].main[0];
  dire(JSON.stringify(oui) === JSON.stringify(JSON.parse(avant.fils)[AIGUILLAGE].main[0]),
    'la sortie « oui » (stop reconnu) est intacte');

  // Aucun autre fil ne doit avoir bouge.
  const filsAvant = JSON.parse(avant.fils);
  const autres = Object.keys(filsAvant).filter((k) => k !== AIGUILLAGE);
  dire(autres.every((k) => JSON.stringify(filsAvant[k]) === JSON.stringify(wf.connections[k])),
    `les ${autres.length} autres noeuds gardent leurs fils`);

  // Ce que le noeud rend, sur un message reel dans sa forme.
  const message = { slug: 'boutique-essai', boutique_id: 'uuid', texte: 'je ne veux plus de piment', destinataire: '2250700000000', canal: 'whatsapp' };
  const sortie = rejouerLaReprise(wf, message);
  dire(Array.isArray(sortie) && sortie.length === 1 && JSON.stringify(sortie[0].json) === JSON.stringify(message),
    'le noeud rend le message du normalisateur, entier');
  dire(sortie[0].json.slug === 'boutique-essai' && !('reconnu' in sortie[0].json),
    'la boutique est de retour, et la reponse de l appel « stop » n y est plus');

  const rejeu = transformer(wf);
  dire(rejeu.length === 0, 'rejouee, la transformation ne change plus rien');

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

  const noeudsAvant = wf.nodes.length;
  const filsAvant = JSON.parse(JSON.stringify(wf.connections));

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
  if (transformer(JSON.parse(JSON.stringify(relu))).length) {
    throw new Error('ecriture acceptee, mais la relecture montre l ancienne forme');
  }
  if (relu.nodes.length !== noeudsAvant + 1) {
    throw new Error(`la relecture compte ${relu.nodes.length} noeuds au lieu de ${noeudsAvant + 1}`);
  }
  const intacts = Object.keys(filsAvant).filter((k) => k !== AIGUILLAGE);
  const bouges = intacts.filter((k) => JSON.stringify(filsAvant[k]) !== JSON.stringify(relu.connections[k]));
  if (bouges.length) throw new Error(`des fils ont bouge ailleurs : ${bouges.join(', ')}`);
  if (relu.active !== wf.active) throw new Error('le workflow a change d etat d activation');

  console.log(`\nEcrit et relu : « ${REPRISE} » est en place, ${relu.nodes.length} noeuds,`
    + ` ${intacts.length} autres noeuds aux fils inchanges, workflow ${relu.active ? 'actif' : 'INACTIF'}.`);
  console.log('Suite : ecrire sur le WhatsApp d une boutique un message qui contient « ne plus »');
  console.log('sans etre une demande d arret, et verifier que l assistante repond.');
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
