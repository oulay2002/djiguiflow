/**
 * Controle d'un transfert n8n Cloud -> VPS. Lecture seule des deux cotes.
 *
 *   node scripts/verifier-migration-n8n.mjs
 *
 * Il repond a trois questions, dans cet ordre d'importance :
 *
 * 1. Manque-t-il un workflow sur la cible ? (comparaison par NOM)
 * 2. Les renvois entre workflows pointent-ils vers des workflows PRESENTS SUR
 *    LA CIBLE ? C'est le point ou une migration casse en silence : un
 *    `Execute Workflow` qui garde l'identifiant de l'ancienne instance ne
 *    proteste pas a la lecture, il echoue seulement le jour ou il s'execute.
 * 3. Reste-t-il des references a l'ancienne instance dans les parametres ?
 *    Une URL de webhook ecrite en dur ne se voit pas autrement.
 */

const CLOUD = (process.env.N8N_CLOUD_URL || 'https://oulai2002.app.n8n.cloud').replace(/\/$/, '');
const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE_CLOUD = process.env.N8N_CLOUD_KEY;
const CLE_VPS = process.env.N8N_VPS_KEY;

if (!CLE_CLOUD || !CLE_VPS) {
  console.error('Il manque N8N_CLOUD_KEY et/ou N8N_VPS_KEY dans l environnement.');
  process.exit(1);
}

async function appeler(base, cle, chemin) {
  const r = await fetch(`${base}/api/v1${chemin}`, {
    headers: { 'X-N8N-API-KEY': cle, 'Content-Type': 'application/json' },
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin} -> ${r.status} ${texte.slice(0, 160)}`);
  return JSON.parse(texte);
}

async function listerTous(base, cle) {
  const tous = [];
  let curseur = null;
  do {
    const page = await appeler(base, cle, `/workflows?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
    tous.push(...(page.data || []));
    curseur = page.nextCursor;
  } while (curseur);
  return tous;
}

/** Identifiants de workflow cites par un workflow (noeuds + workflow d erreur). */
function renvois(wf) {
  const t = new Set();
  for (const n of wf.nodes || []) {
    const v = n?.parameters?.workflowId;
    const id = typeof v === 'string' ? v : v?.value;
    if (id) t.add(String(id));
  }
  const e = wf?.settings?.errorWorkflow;
  if (e && e !== 'DEFAULT') t.add(String(e));
  return t;
}

const main = async () => {
  const listeCloud = await listerTous(CLOUD, CLE_CLOUD);
  const listeVps = await listerTous(VPS, CLE_VPS);

  const nomsCloud = new Map(listeCloud.map((w) => [w.name, w]));
  const nomsVps = new Map(listeVps.map((w) => [w.name, w]));
  const idsVps = new Set(listeVps.map((w) => String(w.id)));

  console.log(`Cloud : ${listeCloud.length} workflows`);
  console.log(`VPS   : ${listeVps.length} workflows\n`);

  // --- 1. Manquants et doublons
  const manquants = [...nomsCloud.keys()].filter((n) => !nomsVps.has(n));
  const comptes = {};
  for (const w of listeVps) comptes[w.name] = (comptes[w.name] || 0) + 1;
  const doublons = Object.entries(comptes).filter(([, c]) => c > 1);

  console.log('--- 1. Presence ---');
  if (!manquants.length) console.log('OK  aucun workflow du Cloud ne manque sur le VPS');
  else { console.log(`MANQUANTS (${manquants.length}) :`); for (const n of manquants) console.log(`  - ${n}`); }
  if (doublons.length) { console.log(`DOUBLONS sur le VPS (${doublons.length}) :`); for (const [n, c] of doublons) console.log(`  - ${n} x${c}`); }

  // --- 2. Renvois internes, cote VPS
  console.log('\n--- 2. Renvois entre workflows (sur le VPS) ---');
  let totalRenvois = 0;
  const casses = [];
  for (const w of listeVps) {
    const detail = await appeler(VPS, CLE_VPS, `/workflows/${w.id}`);
    for (const id of renvois(detail)) {
      totalRenvois++;
      if (!idsVps.has(id)) casses.push(`${detail.name} -> ${id}`);
    }
  }
  console.log(`${totalRenvois} renvois examines`);
  if (!casses.length) console.log('OK  tous pointent vers un workflow present sur le VPS');
  else { console.log(`CASSES (${casses.length}) :`); for (const c of casses) console.log(`  - ${c}`); }

  // --- 3. Traces de l ancienne instance
  console.log('\n--- 3. References a l ancienne instance ---');
  const hoteCloud = new URL(CLOUD).hostname;
  const traces = [];
  for (const w of listeVps) {
    const detail = await appeler(VPS, CLE_VPS, `/workflows/${w.id}`);
    const brut = JSON.stringify(detail);
    if (brut.includes(hoteCloud)) {
      for (const n of detail.nodes || []) {
        if (JSON.stringify(n).includes(hoteCloud)) traces.push(`${detail.name} / ${n.name}`);
      }
    }
  }
  if (!traces.length) console.log(`OK  aucune mention de ${hoteCloud}`);
  else {
    console.log(`A CORRIGER (${traces.length}) — noeuds citant encore ${hoteCloud} :`);
    for (const t of traces) console.log(`  - ${t}`);
  }

  // --- 4. Etat d activation
  const actifsVps = listeVps.filter((w) => w.active).length;
  const actifsCloud = listeCloud.filter((w) => w.active).length;
  console.log('\n--- 4. Activation ---');
  console.log(`Cloud actifs : ${actifsCloud}   VPS actifs : ${actifsVps}`);
  if (actifsVps === 0) console.log('OK  rien n est actif sur le VPS — attendu tant que les identifiants ne sont pas ressaisis');
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
