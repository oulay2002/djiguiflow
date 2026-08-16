/**
 * Carte des identifiants a ressaisir sur le n8n auto-heberge.
 *
 *   node scripts/identifiants-a-ressaisir.mjs
 *
 * Lecture seule. Il repond a deux questions, dans l'ordre ou on en a besoin :
 *
 *   1. QUELS identifiants creer sur le VPS, et combien de noeuds en dependent.
 *      On les cree une fois, puis on les affecte — l'inverse fait rouvrir
 *      vingt fois le meme formulaire.
 *   2. POUR CHAQUE workflow, quel noeud attend quoi. C'est la liste qu'on
 *      garde ouverte a cote de l'interface.
 *
 * Les 100 modeles de demonstration livres avec l'image Hostinger sont ecartes :
 * ils ne servent a rien ici et noieraient la vraie liste.
 */

const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE = process.env.N8N_VPS_KEY;
if (!CLE) { console.error('Il manque N8N_VPS_KEY.'); process.exit(1); }

async function appeler(chemin) {
  const r = await fetch(`${VPS}/api/v1${chemin}`, {
    headers: { 'X-N8N-API-KEY': CLE, 'Content-Type': 'application/json' },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${chemin} -> ${r.status} ${t.slice(0, 160)}`);
  return JSON.parse(t);
}

async function listerTous() {
  const tous = []; let curseur = null;
  do {
    const p = await appeler(`/workflows?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
    tous.push(...(p.data || [])); curseur = p.nextCursor;
  } while (curseur);
  return tous;
}

/** Un modele Hostinger porte un prefixe numerique, ou s appelle « My workflow ». */
const estModele = (nom) => /^\d+[-_]/.test(nom) || /^My workflow/i.test(nom);

const main = async () => {
  const metier = (await listerTous()).filter((w) => !estModele(w.name));
  console.log(`${metier.length} workflows metier sur le VPS.\n`);

  const parType = new Map();   // type d identifiant -> { noeuds, nomsVus }
  const parWorkflow = [];

  for (const w of metier) {
    const wf = await appeler(`/workflows/${w.id}`);
    const lignes = [];
    for (const n of wf.nodes || []) {
      for (const [type, ref] of Object.entries(n.credentials || {})) {
        lignes.push({ noeud: n.name, type, nomAncien: ref?.name || '(sans nom)' });
        if (!parType.has(type)) parType.set(type, { noeuds: 0, noms: new Set() });
        const e = parType.get(type);
        e.noeuds++;
        if (ref?.name) e.noms.add(ref.name);
      }
    }
    if (lignes.length) parWorkflow.push({ nom: wf.name, actif: w.active, lignes });
  }

  console.log('=== 1. IDENTIFIANTS A CREER SUR LE VPS ===');
  console.log('(a creer UNE fois, puis a affecter aux noeuds)\n');
  const tries = [...parType.entries()].sort((a, b) => b[1].noeuds - a[1].noeuds);
  for (const [type, e] of tries) {
    console.log(`${String(e.noeuds).padStart(3)} noeud(s)  ${type}`);
    for (const nom of e.noms) console.log(`             nom sur le Cloud : « ${nom} »`);
  }

  console.log('\n\n=== 2. PAR WORKFLOW ===');
  console.log('(commencer par « Envoyer reponse client » : 14 workflows en dependent)\n');
  parWorkflow.sort((a, b) => (a.nom === 'Envoyer réponse client' ? -1 : b.nom === 'Envoyer réponse client' ? 1 : b.lignes.length - a.lignes.length));
  for (const w of parWorkflow) {
    console.log(`--- ${w.nom}${w.actif ? '  [ACTIF]' : ''}  (${w.lignes.length} noeud(s))`);
    for (const l of w.lignes) console.log(`      ${l.noeud}  ->  ${l.type}  « ${l.nomAncien} »`);
    console.log('');
  }

  const sansIdentifiant = metier.length - parWorkflow.length;
  console.log(`${parWorkflow.length} workflows demandent au moins un identifiant.`);
  if (sansIdentifiant > 0) console.log(`${sansIdentifiant} n en demandent aucun : rien a y faire.`);
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
