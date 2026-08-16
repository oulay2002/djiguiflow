/**
 * Affecte les credentials du VPS aux noeuds migres.
 *
 *   node scripts/affecter-credentials-vps.mjs                 (simulation)
 *   node scripts/affecter-credentials-vps.mjs --pour-de-vrai  (ecrit)
 *
 * POURQUOI
 *
 * Les noeuds arrivent du Cloud avec l'identifiant de credential de l'ANCIENNE
 * instance. Il ne correspond a rien sur le VPS : chaque noeud affiche un
 * avertissement et echouerait a l'execution. Les reaffecter a la main
 * demanderait d'ouvrir 63 noeuds un par un.
 *
 * La correspondance se fait par le NOM que portait la credential sur le Cloud,
 * nom que chaque noeud a conserve. C'est le seul lien fiable : le type ne
 * suffit pas, puisque deux credentials `httpHeaderAuth` coexistent — l'une
 * porte `x-sync-secret` et parle a l'application, l'autre `x-djiguiflow-secret`
 * et signe les webhooks. Les intervertir donnerait des 401 partout, sans que
 * rien n'indique pourquoi.
 *
 * IDEMPOTENT : un noeud deja pourvu du bon identifiant est laisse tel quel. On
 * peut donc relancer apres avoir complete la table.
 */

const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE = process.env.N8N_VPS_KEY;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');
if (!CLE) { console.error('Il manque N8N_VPS_KEY.'); process.exit(1); }

/**
 * Nom de la credential SUR LE CLOUD  ->  identifiant de la credential SUR LE VPS.
 *
 * Laisser a null ce qui n'est pas encore tranche : le script ignore ces
 * entrees et le dit, plutot que d'affecter au hasard.
 */
const TABLE = {
  'Telegram account 30':          '0Eq9PtopVq9ndbf2',  // ChezZahara — repond au client
  'Telegram account 21':          'Mumpq16T4aU6AeLE',  // Gerant — alertes techniques
  'Telegram account 32':          'Ie1xeEma3NZYMxxt',  // Misskouame — decouverte des identifiants
  'Google Sheets OAuth2 API':     '9Q14ADLSkwfm2Y5H',
  'Mistral Cloud account 2':      'JSIdFxZd1WhFWc9g',
  'wasenderapi — envoi WhatsApp': 'Z8z2zH3lN7ZjkVK6',
  // ATTENTION, LA CORRESPONDANCE EST CROISEE. Les noms se sont inverses d'une
  // instance a l'autre : ce que le Cloud appelait « Header Auth account 2 »
  // (secret des webhooks) porte sur le VPS le nom « Header Auth account », et
  // le nom « Header Auth account 2 » y designe au contraire le secret qui
  // parle a l'application. Se fier au nom aurait mis 29 noeuds en 401 sans le
  // moindre message d'erreur. Verifie le 16 aout en lisant le champ « Name »
  // de chaque credential, qui contient le nom de l'en-tete HTTP.
  'DjiguiFlow API':               'QoKeVRwGrk1YqN9Q',  // en-tete x-sync-secret
  'Header Auth account 2':        'vkSCoRL3hmMp5S2G',  // en-tete x-djiguiflow-secret
};

async function appeler(chemin, options = {}) {
  const r = await fetch(`${VPS}/api/v1${chemin}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': CLE, 'Content-Type': 'application/json', ...(options.headers || {}) },
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

const estModele = (nom) => /^\d+[-_]/.test(nom) || /^My workflow/i.test(nom);

/**
 * Reglages heritees du Cloud que l'API du VPS REFUSE en ecriture.
 *
 * Subtilite a connaitre : le VPS les a bien STOCKES lors du transfert, mais il
 * les rejette des qu'on lui renvoie le workflow — `400 settings must NOT have
 * additional properties`, et rien n'est enregistre. Une simple reaffectation de
 * credential echoue donc sur un reglage qui n'a aucun rapport avec elle.
 *
 * Les deux sont sans effet ici : `binaryMode` dit ou le Cloud rangeait les
 * fichiers pendant une execution, `timeSavedMode` n'alimente qu'un indicateur.
 */
const REGLAGES_REFUSES = ['binaryMode', 'timeSavedMode'];

function reglagesPropres(settings) {
  const propres = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (!REGLAGES_REFUSES.includes(k)) propres[k] = v;
  }
  return propres;
}

const main = async () => {
  console.log(POUR_DE_VRAI ? '=== AFFECTATION REELLE ===' : '=== SIMULATION ===\n');

  const nomsVps = {};
  for (const c of ((await appeler('/credentials?limit=100')).data || [])) nomsVps[c.id] = c.name;

  const metier = (await listerTous()).filter((w) => !estModele(w.name));
  let affectes = 0, dejaBons = 0;
  const enAttente = new Map();

  for (const w of metier) {
    const wf = await appeler(`/workflows/${w.id}`);
    let modifie = false;
    const detail = [];

    for (const n of wf.nodes || []) {
      for (const [type, ref] of Object.entries(n.credentials || {})) {
        const ancienNom = ref?.name;

        // Deja affecte : le noeud porte l'identifiant d'une credential qui
        // existe bel et bien sur le VPS. Sans ce test, un noeud corrige lors
        // d'un passage precedent serait signale « nom inconnu » — il porte
        // desormais le nom du VPS, absent de TABLE qui parle en noms du Cloud.
        if (ref?.id && nomsVps[ref.id]) { dejaBons++; continue; }

        const cible = TABLE[ancienNom];

        if (cible === undefined) { detail.push(`  ? ${n.name} : nom inconnu « ${ancienNom} »`); continue; }
        if (cible === null) {
          const l = enAttente.get(ancienNom) || 0;
          enAttente.set(ancienNom, l + 1);
          continue;
        }
        if (ref.id === cible) { dejaBons++; continue; }

        n.credentials[type] = { id: cible, name: nomsVps[cible] || ancienNom };
        detail.push(`  + ${n.name} : ${ancienNom} -> ${nomsVps[cible]}`);
        modifie = true;
        affectes++;
      }
    }

    if (!detail.length) continue;
    console.log(`--- ${wf.name}`);
    for (const d of detail) console.log(d);

    if (modifie && POUR_DE_VRAI) {
      await appeler(`/workflows/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: wf.name,
          nodes: wf.nodes,
          connections: wf.connections,
          settings: reglagesPropres(wf.settings),
        }),
      });
      console.log('  -> enregistre');
    }
  }

  console.log('\n=== BILAN ===');
  console.log(`noeuds ${POUR_DE_VRAI ? 'affectes' : 'a affecter'} : ${affectes}`);
  console.log(`noeuds deja corrects       : ${dejaBons}`);
  if (enAttente.size) {
    console.log('\nEN ATTENTE — correspondance non tranchee :');
    for (const [nom, n] of enAttente) console.log(`  ${String(n).padStart(3)} noeud(s)  « ${nom} »`);
    console.log('Completer TABLE puis relancer : le script ne retouche pas ce qui est deja bon.');
  }
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
