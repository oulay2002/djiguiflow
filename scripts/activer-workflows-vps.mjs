/**
 * Active sur le VPS les workflows qui sont actifs sur le Cloud, DANS L'ORDRE
 * DES DEPENDANCES.
 *
 *   node scripts/activer-workflows-vps.mjs                 (simulation)
 *   node scripts/activer-workflows-vps.mjs --pour-de-vrai  (active)
 *
 * POURQUOI L'ORDRE COMPTE
 *
 * n8n 2.30 refuse de publier un workflow dont un sous-workflow appele n'est pas
 * lui-meme publie :
 *
 *   Cannot publish workflow: Node "..." references workflow X ("Envoyer reponse
 *   client") which is not published. Please publish all referenced
 *   sub-workflows first.
 *
 * Activer dans l'ordre alphabetique, ou dans celui de la liste, echoue donc sur
 * la moitie des workflows — et l'erreur rendue est parfois trompeuse : sur
 * `Alerte Retard Livraison`, n8n repond « Cannot read properties of undefined
 * (reading 'execute') », qui n'evoque en rien un probleme de publication.
 *
 * On calcule donc l'ordre : les feuilles d'abord — `Envoyer reponse client`,
 * appele par quatorze workflows — puis leurs appelants, de proche en proche.
 *
 * QUOI ACTIVER : la reference est le Cloud. On n'active sur le VPS que ce qui
 * y est actif, pour ne rien mettre en route qui ne tournait pas avant.
 */

const CLOUD = (process.env.N8N_CLOUD_URL || 'https://oulai2002.app.n8n.cloud').replace(/\/$/, '');
const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE_CLOUD = process.env.N8N_CLOUD_KEY;
const CLE_VPS = process.env.N8N_VPS_KEY;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');
if (!CLE_CLOUD || !CLE_VPS) { console.error('Il manque N8N_CLOUD_KEY et/ou N8N_VPS_KEY.'); process.exit(1); }

async function appeler(base, cle, chemin, options = {}) {
  const r = await fetch(`${base}/api/v1${chemin}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': cle, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function listerTous(base, cle) {
  const tous = []; let curseur = null;
  do {
    const p = await appeler(base, cle, `/workflows?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
    tous.push(...(p.data || [])); curseur = p.nextCursor;
  } while (curseur);
  return tous;
}

const estModele = (nom) => /^\d+[-_]/.test(nom) || /^My workflow/i.test(nom);

/** Identifiants de workflow cites par un workflow. */
function dependances(wf) {
  const t = new Set();
  for (const n of wf.nodes || []) {
    const v = n?.parameters?.workflowId;
    const id = typeof v === 'string' ? v : v?.value;
    if (id) t.add(String(id));
  }
  const e = wf?.settings?.errorWorkflow;
  if (e && e !== 'DEFAULT') t.add(String(e));
  return [...t];
}

const main = async () => {
  console.log(POUR_DE_VRAI ? '=== ACTIVATION REELLE ===\n' : '=== SIMULATION ===\n');

  const actifsCloud = new Set(
    (await listerTous(CLOUD, CLE_CLOUD)).filter((w) => w.active).map((w) => w.name),
  );
  console.log(`${actifsCloud.size} workflows actifs sur le Cloud — c'est la reference.\n`);

  const surVps = (await listerTous(VPS, CLE_VPS)).filter((w) => !estModele(w.name));
  const details = new Map();
  for (const w of surVps) details.set(w.id, await appeler(VPS, CLE_VPS, `/workflows/${w.id}`));

  // Ordre topologique : un workflow n'est visite qu'apres ce qu'il appelle.
  const ordre = [];
  const vus = new Set();
  const enCours = new Set();
  const visiter = (id) => {
    if (vus.has(id) || !details.has(id)) return;
    if (enCours.has(id)) return;      // cycle : on s'arrete, l'appelant suivra
    enCours.add(id);
    for (const d of dependances(details.get(id))) visiter(d);
    enCours.delete(id);
    vus.add(id);
    ordre.push(id);
  };
  for (const w of surVps) visiter(w.id);

  let actives = 0, deja = 0, ignores = 0;
  const echecs = [];

  for (const id of ordre) {
    const wf = details.get(id);
    const w = surVps.find((x) => x.id === id);

    if (!actifsCloud.has(wf.name)) { ignores++; continue; }
    if (w.active) { deja++; continue; }

    if (!POUR_DE_VRAI) { console.log(`[simulation] activerait « ${wf.name} »`); actives++; continue; }
    try {
      await appeler(VPS, CLE_VPS, `/workflows/${id}/activate`, { method: 'POST' });
      console.log(`actif  « ${wf.name} »`);
      actives++;
    } catch (e) {
      echecs.push({ nom: wf.name, raison: e.message });
      console.log(`ECHEC  « ${wf.name} » : ${e.message.slice(0, 200)}`);
    }
  }

  console.log('\n=== BILAN ===');
  console.log(`${POUR_DE_VRAI ? 'actives' : 'a activer'} : ${actives}`);
  console.log(`deja actifs        : ${deja}`);
  console.log(`inactifs sur le Cloud, donc laisses inactifs : ${ignores}`);
  if (echecs.length) {
    console.log(`\nECHECS (${echecs.length}) :`);
    for (const e of echecs) console.log(`  - ${e.nom} : ${e.raison.slice(0, 260)}`);
  }
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
