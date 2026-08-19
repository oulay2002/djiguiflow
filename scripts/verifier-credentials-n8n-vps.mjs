/**
 * Controle de l'appariement des credentials sur le VPS. Lecture seule.
 *
 *   $env:N8N_VPS_KEY="..."      (et, pour le rapprochement, N8N_CLOUD_KEY)
 *   node scripts/verifier-credentials-n8n-vps.mjs
 *
 * Pourquoi un controle a part, alors que `verifier-migration-n8n.mjs` couvre
 * deja les renvois et les URL : le 16 aout 2026, « Demander la confirmation au
 * client » designait « Header Auth account 2 » la ou l'en-tete
 * `x-djiguiflow-secret` vit dans « Header Auth account ». Le workflow etait
 * valide, la credential existait, l'interface ne marquait rien. La panne — une
 * commande enregistree dont le client ne recoit jamais son lien — n'est apparue
 * qu'a l'execution, sur un 403.
 *
 * Ce que ce script peut voir, et ce qu'il ne peut pas :
 *
 * - L'API publique de n8n ne rend JAMAIS le contenu dechiffre d'une credential.
 *   Impossible, donc, de verifier qu'une valeur est la bonne. On verifie ce qui
 *   reste : l'appariement, le type, et la coherence avec l'ancienne instance.
 * - Elle n'expose pas non plus la liste des credentials. La carte
 *   identifiant -> nom/type est donc reconstruite a partir des noeuds
 *   eux-memes : chaque bloc `credentials` porte {id, name}, et sa CLE est le
 *   type. Un meme identifiant vu sous deux cles differentes est une anomalie
 *   certaine.
 *
 * Quatre questions, de la plus grave a la plus benigne :
 *
 * 1. Un noeud designe-t-il une credential absente de la cible ?
 * 2. Un noeud reclame-t-il une authentification sans credential attachee ?
 * 3. Un appelant interne (n8n -> webhook n8n) porte-t-il la bonne credential ?
 *    C'est la famille exacte qui a casse.
 * 4. Le nom de la credential a-t-il change entre le Cloud et le VPS, noeud par
 *    noeud ? Un « 2 » qui apparait ou disparait est le signe de l'inversion.
 */

const CLOUD = (process.env.N8N_CLOUD_URL || 'https://oulai2002.app.n8n.cloud').replace(/\/$/, '');
const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE_VPS = process.env.N8N_VPS_KEY;
const CLE_CLOUD = process.env.N8N_CLOUD_KEY;

if (!CLE_VPS) {
  console.error('Il manque N8N_VPS_KEY dans l environnement.');
  process.exit(1);
}

/** Hote des webhooks internes : un noeud qui l appelle doit porter le secret plateforme. */
const HOTE_INTERNE = new URL(VPS).hostname;

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

/**
 * Les 100 modeles importes en juillet 2025 ne sont pas du metier : ils
 * noieraient le rapport sous des centaines de lignes sans objet.
 */
const estModele = (nom) => /^\d+[-_]/.test(nom);

/** Un noeud reclame-t-il une authentification ? */
function reclameAuth(noeud) {
  const p = noeud.parameters || {};
  const a = String(p.authentication ?? '');
  return a !== '' && a !== 'none';
}

const main = async () => {
  const vps = (await listerTous(VPS, CLE_VPS)).filter((w) => !estModele(w.name));
  console.log(`VPS : ${vps.length} workflows metier\n`);

  const details = [];
  for (const w of vps) details.push(await appeler(VPS, CLE_VPS, `/workflows/${w.id}`));

  // --- Carte des credentials, reconstruite depuis les noeuds
  const carte = new Map(); // id -> { noms:Set, types:Set }
  for (const w of details) {
    for (const n of w.nodes || []) {
      for (const [type, c] of Object.entries(n.credentials || {})) {
        if (!c?.id) continue;
        const e = carte.get(c.id) || { noms: new Set(), types: new Set() };
        if (c.name) e.noms.add(c.name);
        e.types.add(type);
        carte.set(c.id, e);
      }
    }
  }

  const incoherentes = [...carte].filter(([, e]) => e.types.size > 1 || e.noms.size > 1);
  console.log('--- 1. Coherence des credentials citees ---');
  console.log(`${carte.size} credentials distinctes citees par les noeuds`);
  if (!incoherentes.length) console.log('OK  chaque identifiant garde un seul nom et un seul type');
  else {
    console.log(`INCOHERENTES (${incoherentes.length}) :`);
    for (const [id, e] of incoherentes) {
      console.log(`  - ${id} : noms=[${[...e.noms].join(', ')}] types=[${[...e.types].join(', ')}]`);
    }
  }

  // --- 2. Noeuds sans credential alors qu ils en reclament une
  console.log('\n--- 2. Authentification reclamee sans credential ---');
  const orphelins = [];
  for (const w of details) {
    for (const n of w.nodes || []) {
      if (n.disabled) continue;
      if (reclameAuth(n) && !Object.keys(n.credentials || {}).length) {
        orphelins.push(`${w.name} / ${n.name} (${n.type})`);
      }
    }
  }
  if (!orphelins.length) console.log('OK  aucun noeud actif ne reclame une authentification sans credential');
  else { console.log(`A CORRIGER (${orphelins.length}) :`); for (const o of orphelins) console.log(`  - ${o}`); }

  // --- 3. Appelants internes : la famille qui a casse
  console.log(`\n--- 3. Appels internes vers ${HOTE_INTERNE} ---`);
  const internes = [];
  for (const w of details) {
    for (const n of w.nodes || []) {
      const brut = JSON.stringify(n.parameters || {});
      if (!brut.includes(`${HOTE_INTERNE}/webhook`)) continue;
      const noms = Object.entries(n.credentials || {}).map(([t, c]) => `${t}:${c?.name ?? '(sans nom)'}`);
      internes.push({
        ligne: `${w.name} / ${n.name}`,
        credentials: noms.length ? noms.join(', ') : 'AUCUNE',
        actif: !n.disabled,
      });
    }
  }
  if (!internes.length) console.log('Aucun appel interne trouve.');
  else {
    console.log('Ces noeuds appellent un webhook n8n depuis n8n : leur credential DOIT porter');
    console.log('l en-tete x-djiguiflow-secret. Verifier chaque nom a l oeil.\n');
    for (const i of internes) {
      console.log(`  ${i.actif ? ' ' : '~'} ${i.ligne}\n      -> ${i.credentials}`);
    }
  }

  // --- 4. Rapprochement avec le Cloud, noeud par noeud
  console.log('\n--- 4. Ecarts de credential entre Cloud et VPS ---');
  if (!CLE_CLOUD) {
    console.log('N8N_CLOUD_KEY absente : rapprochement non effectue.');
    return;
  }

  const cloud = (await listerTous(CLOUD, CLE_CLOUD)).filter((w) => !estModele(w.name));
  const parNomCloud = new Map();
  for (const w of cloud) parNomCloud.set(w.name, await appeler(CLOUD, CLE_CLOUD, `/workflows/${w.id}`));

  const ecarts = [];
  for (const w of details) {
    const jumeau = parNomCloud.get(w.name);
    if (!jumeau) continue;
    const cotesCloud = new Map();
    for (const n of jumeau.nodes || []) {
      for (const [t, c] of Object.entries(n.credentials || {})) cotesCloud.set(`${n.name}|${t}`, c?.name ?? '');
    }
    for (const n of w.nodes || []) {
      for (const [t, c] of Object.entries(n.credentials || {})) {
        const cle = `${n.name}|${t}`;
        if (!cotesCloud.has(cle)) continue;
        const avant = cotesCloud.get(cle);
        const apres = c?.name ?? '';
        if (avant !== apres) ecarts.push(`${w.name} / ${n.name} [${t}] : « ${avant} » -> « ${apres} »`);
      }
    }
  }

  if (!ecarts.length) console.log('OK  aucun noeud ne change de credential entre les deux instances');
  else {
    console.log(`ECARTS (${ecarts.length}) — chacun est un candidat serieux a la panne :`);
    for (const e of ecarts) console.log(`  - ${e}`);
  }
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
