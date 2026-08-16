/**
 * Aligne les versions de noeuds sur ce que la build du VPS sait instancier.
 *
 *   node scripts/aligner-versions-noeuds-vps.mjs                 (simulation)
 *   node scripts/aligner-versions-noeuds-vps.mjs --pour-de-vrai  (ecrit)
 *
 * POURQUOI
 *
 * Les workflows ont ete ecrits sur un n8n plus recent que celui du VPS (2.30.5).
 * Un noeud dont la `typeVersion` depasse ce que la build connait ne peut pas
 * etre instancie, et la PUBLICATION echoue sur un message qui n'evoque rien :
 *
 *   Cannot read properties of undefined (reading 'execute')
 *   at shouldAssignExecuteMethod (n8n/src/utils.ts:88)
 *
 * n8n y lit la description du type de noeud pour savoir s'il expose une methode
 * `execute` — et lit `.execute` sur `undefined`. Le message ne nomme ni le
 * noeud, ni le type, ni la version : il faut le deduire en comparant les
 * workflows qui publient et ceux qui echouent.
 *
 * COMMENT CETTE LISTE A ETE ETABLIE, ET COMMENT LA REFAIRE
 *
 * Par difference : les 13 workflows en echec contenaient tous `httpRequest`
 * v4.5, aucun des 6 qui publiaient n'en contenait. Verifie ensuite en abaissant
 * ce seul noeud sur « Routeur Telegram » : l'erreur opaque a laisse place a un
 * message clair sur l'ordre de publication. Ne pas deviner — mesurer.
 *
 * L'ALTERNATIVE, MEILLEURE A TERME : mettre a jour n8n sur le VPS. Abaisser la
 * version fait tourner les workflows sur un contrat plus ancien que celui sur
 * lequel ils ont ete ecrits. Pour ces noeuds-ci — de simples GET et POST avec
 * un en-tete d'authentification — l'ecart est sans consequence. Cela ne serait
 * pas vrai d'un noeud dont on exploite une option recente.
 */

const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE = process.env.N8N_VPS_KEY;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');
if (!CLE) { console.error('Il manque N8N_VPS_KEY.'); process.exit(1); }

/** type de noeud -> version maximale acceptee par la build du VPS. */
const PLAFONDS = {
  'n8n-nodes-base.httpRequest': 4.4,
};

const REGLAGES_REFUSES = ['binaryMode', 'timeSavedMode'];
const reglagesPropres = (s) =>
  Object.fromEntries(Object.entries(s || {}).filter(([k]) => !REGLAGES_REFUSES.includes(k)));

async function appeler(chemin, options = {}) {
  const r = await fetch(`${VPS}/api/v1${chemin}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': CLE, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
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

const main = async () => {
  console.log(POUR_DE_VRAI ? '=== ALIGNEMENT REEL ===\n' : '=== SIMULATION ===\n');
  let total = 0;

  for (const w of (await listerTous()).filter((x) => !estModele(x.name))) {
    const wf = await appeler(`/workflows/${w.id}`);
    const changes = [];

    for (const n of wf.nodes || []) {
      const plafond = PLAFONDS[n.type];
      if (plafond === undefined || !(n.typeVersion > plafond)) continue;
      changes.push(`  ${n.name} : v${n.typeVersion} -> v${plafond}`);
      n.typeVersion = plafond;
    }
    if (!changes.length) continue;

    console.log(`--- ${wf.name}`);
    for (const c of changes) console.log(c);
    total += changes.length;

    if (POUR_DE_VRAI) {
      await appeler(`/workflows/${w.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: wf.name, nodes: wf.nodes, connections: wf.connections,
          settings: reglagesPropres(wf.settings),
        }),
      });
      console.log('  -> enregistre');
    }
  }

  console.log(`\n${total} noeud(s) ${POUR_DE_VRAI ? 'alignes' : 'a aligner'}.`);
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
