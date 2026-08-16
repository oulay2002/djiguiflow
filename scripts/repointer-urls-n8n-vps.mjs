/**
 * Remplace toute mention de l'ancienne instance n8n par la nouvelle, dans les
 * workflows du VPS. Lecture seule sur le Cloud : il n'est jamais touche.
 *
 *   node scripts/repointer-urls-n8n-vps.mjs                 (simulation)
 *   node scripts/repointer-urls-n8n-vps.mjs --pour-de-vrai  (ecrit)
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Un workflow peut appeler un webhook de sa PROPRE instance par une URL ecrite
 * en dur — c'est le cas du Cerveau marchand, qui appelle
 * `/webhook/confirmation-client`. Apres migration, cette URL pointe encore sur
 * l'ancien serveur : le Cerveau irait demander la confirmation a une instance
 * arretee. Le client ne recevrait jamais son lien, et la commande resterait en
 * suspens SANS erreur visible — la panne la plus couteuse est celle qui ne se
 * signale pas.
 *
 * CE QU'IL NE TOUCHE PAS, ET POURQUOI
 *
 * Les pointeurs EXTERIEURS a n8n — fonction Postgres `notify_n8n_new_commande`,
 * variable Vercel, webhooks Telegram et wasender — ne sont pas de son ressort.
 * Ils doivent changer EN DERNIER, quand le VPS est actif et pourvu de ses
 * identifiants. Les basculer avant ferait tomber les commandes dans le vide.
 */

const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE_VPS = process.env.N8N_VPS_KEY;
const ANCIEN = process.env.N8N_ANCIEN_HOTE || 'oulai2002.app.n8n.cloud';
const NOUVEAU = new URL(VPS).hostname;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');

if (!CLE_VPS) { console.error('Il manque N8N_VPS_KEY.'); process.exit(1); }

async function appeler(chemin, options = {}) {
  const r = await fetch(`${VPS}/api/v1${chemin}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': CLE_VPS, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${options.method || 'GET'} ${chemin} -> ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}

async function listerTous() {
  const tous = []; let curseur = null;
  do {
    const p = await appeler(`/workflows?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
    tous.push(...(p.data || [])); curseur = p.nextCursor;
  } while (curseur);
  return tous;
}

const main = async () => {
  console.log(POUR_DE_VRAI ? '=== REECRITURE REELLE ===' : '=== SIMULATION ===');
  console.log(`${ANCIEN}  ->  ${NOUVEAU}\n`);

  let touches = 0;
  for (const w of await listerTous()) {
    const wf = await appeler(`/workflows/${w.id}`);
    const avant = JSON.stringify(wf.nodes || []);
    if (!avant.includes(ANCIEN)) continue;

    // Quels noeuds, precisement : un remplacement global sans trace est
    // exactement ce qu'on ne veut pas sur une configuration de production.
    const concernes = (wf.nodes || [])
      .filter((n) => JSON.stringify(n).includes(ANCIEN))
      .map((n) => n.name);
    console.log(`« ${wf.name} » : ${concernes.join(', ')}`);

    if (!POUR_DE_VRAI) { touches++; continue; }

    const nodes = JSON.parse(avant.split(ANCIEN).join(NOUVEAU));
    await appeler(`/workflows/${w.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: wf.name, nodes, connections: wf.connections, settings: wf.settings || {},
      }),
    });
    touches++;
    console.log('  -> reecrit');
  }

  console.log(`\n${touches} workflow(s) ${POUR_DE_VRAI ? 'reecrits' : 'a reecrire'}.`);
  if (!touches) console.log('Aucune mention de l ancienne instance : rien a faire.');
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
