/**
 * Transfert des workflows de n8n Cloud vers le n8n auto-heberge.
 *
 * Aucune cle n'est ecrite dans ce fichier : elles viennent de l'environnement,
 * donc de votre terminal, et ne transitent nulle part ailleurs.
 *
 *   set N8N_CLOUD_KEY=...     (PowerShell : $env:N8N_CLOUD_KEY="...")
 *   set N8N_VPS_KEY=...
 *   node scripts/migrer-n8n-vers-vps.mjs
 *
 * Ajouter --pour-de-vrai pour ecrire. Sans ce drapeau, le script se contente
 * de dire ce qu'il ferait : c'est le mode par defaut, a dessein.
 *
 * CE QUE LE SCRIPT FAIT, ET POURQUOI CHAQUE ETAPE EXISTE
 *
 * 1. Il lit les workflows du Cloud un par un. La liste ne porte pas les
 *    noeuds, il faut donc aller chercher chaque workflow en detail.
 * 2. Il les cree sur le VPS, INACTIFS. L'activation viendra apres la ressaisie
 *    des identifiants — un workflow actif dont les credentials manquent
 *    echouerait en boucle et noierait le journal.
 * 3. Il RECRIT LES RENVOIS INTERNES. C'est l'etape qu'on oublie : vos
 *    workflows s'appellent par identifiant, et le VPS en attribue de
 *    nouveaux. Sans cette passe, le Routeur appellerait un « Cerveau
 *    marchand » qui n'existe pas, et `settings.errorWorkflow` pointerait dans
 *    le vide — donc plus aucune alerte en cas de panne.
 *
 * 4. Il ELAGUE LES REGLAGES QUE LA CIBLE REFUSE. Le Cloud et le VPS ne font
 *    pas tourner la meme version de n8n : deux clefs de `settings` existent
 *    d un cote et pas de l autre. L API cible ne les ignore pas, elle rejette
 *    la creation entiere (400). Voir REGLAGES_REFUSES plus bas.
 *
 * IL EST REJOUABLE. Un workflow deja present sur la cible, au meme nom, n est
 * pas recree : le script reprend son identifiant et se contente de reecrire
 * son contenu depuis le Cloud. On peut donc relancer apres un echec partiel
 * sans fabriquer de doublons. Corollaire a connaitre : une retouche faite
 * directement sur la cible serait ecrasee par le Cloud au prochain passage.
 *
 * CE QU'IL NE FAIT PAS, ET NE PEUT PAS FAIRE
 *
 * - Les identifiants (Google Sheets, Telegram, WhatsApp, Header Auth) ne sont
 *   jamais exportes par n8n. Les noeuds arriveront avec une reference vide,
 *   a re-selectionner a la main dans l'interface.
 * - Il ne touche pas au Cloud : lecture seule de ce cote.
 */

const CLOUD = (process.env.N8N_CLOUD_URL || 'https://oulai2002.app.n8n.cloud').replace(/\/$/, '');
const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE_CLOUD = process.env.N8N_CLOUD_KEY;
const CLE_VPS = process.env.N8N_VPS_KEY;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');

if (!CLE_CLOUD || !CLE_VPS) {
  console.error('Il manque N8N_CLOUD_KEY et/ou N8N_VPS_KEY dans l environnement.');
  console.error('Creez-les dans chaque n8n : Settings -> n8n API -> Create an API key.');
  process.exit(1);
}

async function appeler(base, cle, chemin, options = {}) {
  const r = await fetch(`${base}/api/v1${chemin}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': cle, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const texte = await r.text();
  let corps = texte;
  try { corps = JSON.parse(texte); } catch { /* pas du JSON : on garde le texte */ }
  if (!r.ok) {
    const detail = typeof corps === 'string' ? corps.slice(0, 200) : JSON.stringify(corps).slice(0, 200);
    throw new Error(`${options.method || 'GET'} ${chemin} -> ${r.status} ${detail}`);
  }
  return corps;
}

/**
 * Tous les workflows d une instance, page apres page.
 *
 * L API plafonne une reponse a 250 elements et rend un `nextCursor`. Sans
 * cette boucle, une instance qui depasse ce seuil serait lue partiellement :
 * cote cible, les workflows non lus passeraient pour absents et seraient
 * RECREES — le doublon que la reprise par nom existe justement pour eviter.
 */
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
 * Reglages qui existent sur le Cloud et que l API de la cible rejette.
 *
 * Elle ne les ignore pas poliment : elle repond 400 « settings must NOT have
 * additional properties » et ne cree rien du tout. Un seul reglage inconnu
 * suffit donc a faire echouer un workflow entier.
 *
 * Les deux sont sans effet sur le fonctionnement : `binaryMode` dit ou le
 * Cloud range les fichiers pendant une execution, `timeSavedMode` n alimente
 * qu un indicateur d interface. La cible appliquera ses propres valeurs.
 *
 * Cette liste a ete etablie en soumettant chaque clef isolement a l API de la
 * cible, pas devinee. Si la cible change de version, refaire ce test plutot
 * que d ajouter des clefs a l aveugle.
 */
const REGLAGES_REFUSES = ['binaryMode', 'timeSavedMode'];

const reglagesRetires = new Set();

/** Les settings du Cloud, prives de ce que la cible refuse. */
function nettoyerReglages(settings) {
  const propres = {};
  for (const [clef, valeur] of Object.entries(settings || {})) {
    if (REGLAGES_REFUSES.includes(clef)) { reglagesRetires.add(clef); continue; }
    propres[clef] = valeur;
  }
  return propres;
}

/** Renvoie tous les identifiants de workflow cites par un workflow. */
function renvois(wf) {
  const trouves = new Set();
  for (const n of wf.nodes || []) {
    const v = n?.parameters?.workflowId;
    const id = typeof v === 'string' ? v : v?.value;
    if (id) trouves.add(String(id));
  }
  const err = wf?.settings?.errorWorkflow;
  if (err && err !== 'DEFAULT') trouves.add(String(err));
  return trouves;
}

/** Remplace les anciens identifiants par les nouveaux, en place. */
function reecrire(wf, table) {
  let n = 0;
  for (const noeud of wf.nodes || []) {
    const v = noeud?.parameters?.workflowId;
    if (typeof v === 'string' && table[v]) { noeud.parameters.workflowId = table[v]; n++; }
    else if (v && typeof v === 'object' && v.value && table[v.value]) {
      v.value = table[v.value];
      // Le libelle en cache pointe encore sur l ancienne instance : le vider
      // evite qu on lise dans l interface une adresse qui n existe plus.
      delete v.cachedResultUrl;
      n++;
    }
  }
  const err = wf?.settings?.errorWorkflow;
  if (err && table[err]) { wf.settings.errorWorkflow = table[err]; n++; }
  return n;
}

const main = async () => {
  console.log(POUR_DE_VRAI ? '=== TRANSFERT REEL ===' : '=== SIMULATION (rien ne sera ecrit) ===');
  console.log(`Source : ${CLOUD}`);
  console.log(`Cible  : ${VPS}\n`);

  const liste = await listerTous(CLOUD, CLE_CLOUD);
  console.log(`${liste.length} workflows trouves sur le Cloud.\n`);

  // Detail complet, un par un : la liste ne porte ni les noeuds ni les liens.
  const complets = [];
  for (const w of liste) {
    complets.push(await appeler(CLOUD, CLE_CLOUD, `/workflows/${w.id}`));
    process.stdout.write('.');
  }
  console.log('\n');

  // Les renvois tels qu ils sont AVANT toute traduction.
  //
  // La seconde passe reecrit les workflows en place. Relire les renvois apres
  // coup ne montrerait plus les identifiants du Cloud mais ceux de la cible,
  // absents de la table de correspondance : chaque renvoi correctement
  // traduit serait alors annonce « orphelin ». On fige donc l etat initial.
  const renvoisInitiaux = new Map(complets.map((wf) => [wf.id, renvois(wf)]));

  // Ce qui existe deja sur la cible, par NOM.
  //
  // Sans cette lecture, le script n est pas rejouable : un transfert
  // interrompu a mi-parcours et relance creerait des doublons, et la seconde
  // passe reecrirait les renvois vers le mauvais lot — deux plateformes
  // entrelacees, bien pire qu un echec franc. Ici, un workflow deja present
  // est REPRIS, pas recree : son identifiant entre dans la table et les
  // renvois pointeront dessus.
  const dejaLa = {};
  for (const w of await listerTous(VPS, CLE_VPS)) {
    dejaLa[w.name] = w.id;
  }
  console.log(`${Object.keys(dejaLa).length} workflows deja presents sur la cible.\n`);

  const table = {};          // ancien identifiant -> nouveau
  const echecs = [];
  const ignores = [];

  for (const wf of complets) {
    // Une coquille vide n a rien a faire sur la nouvelle instance, et l API
    // refuse parfois un workflow sans noeud.
    if (!(wf.nodes || []).length) {
      ignores.push(`${wf.name} (aucun noeud)`);
      continue;
    }

    if (dejaLa[wf.name]) {
      table[wf.id] = dejaLa[wf.name];
      ignores.push(`${wf.name} (deja present, repris)`);
      continue;
    }

    const corps = {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: nettoyerReglages(wf.settings),
    };
    if (!POUR_DE_VRAI) {
      console.log(`[simulation] creerait « ${wf.name} » (${wf.nodes.length} noeuds)`);
      table[wf.id] = `NOUVEAU_${wf.id}`;
      continue;
    }
    try {
      const cree = await appeler(VPS, CLE_VPS, '/workflows', { method: 'POST', body: JSON.stringify(corps) });
      table[wf.id] = cree.id;
      console.log(`cree   « ${wf.name} »  ${wf.id} -> ${cree.id}`);
    } catch (e) {
      echecs.push({ nom: wf.name, raison: e.message });
      console.log(`ECHEC  « ${wf.name} » : ${e.message}`);
    }
  }

  // ---- Seconde passe : les renvois entre workflows.
  console.log('\n--- renvois internes ---');
  for (const wf of complets) {
    const cites = renvoisInitiaux.get(wf.id) || new Set();
    const aReecrire = [...cites].filter((id) => table[id]);
    if (!aReecrire.length) continue;

    if (!POUR_DE_VRAI) {
      console.log(`[simulation] « ${wf.name} » cite ${aReecrire.length} workflow(s) a reecrire`);
      continue;
    }
    const nouvelId = table[wf.id];
    if (!nouvelId) continue;
    const n = reecrire(wf, table);
    try {
      await appeler(VPS, CLE_VPS, `/workflows/${nouvelId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: nettoyerReglages(wf.settings),
        }),
      });
      console.log(`reecrit « ${wf.name} » : ${n} renvoi(s)`);
    } catch (e) {
      echecs.push({ nom: wf.name, raison: `reecriture : ${e.message}` });
      console.log(`ECHEC reecriture « ${wf.name} » : ${e.message}`);
    }
  }

  // ---- Renvois qui ne pointent vers rien de connu : a savoir avant d activer.
  const orphelins = [];
  for (const wf of complets) {
    for (const id of renvoisInitiaux.get(wf.id) || []) {
      if (!table[id]) orphelins.push(`${wf.name} -> ${id}`);
    }
  }

  console.log('\n=== BILAN ===');
  console.log(`workflows traites : ${complets.length}`);
  console.log(`ignores           : ${ignores.length}`);
  for (const i of ignores) console.log(`  - ${i}`);
  console.log(`echecs            : ${echecs.length}`);
  for (const e of echecs) console.log(`  - ${e.nom} : ${e.raison}`);
  if (reglagesRetires.size) {
    console.log(`reglages retires  : ${[...reglagesRetires].join(', ')} (refuses par la cible)`);
  }
  if (orphelins.length) {
    console.log(`renvois orphelins : ${orphelins.length} (a verifier a la main)`);
    for (const o of orphelins) console.log(`  - ${o}`);
  }
  console.log('\nRIEN N EST ACTIF sur le VPS : c est voulu.');
  console.log('Ressaisir les identifiants dans chaque noeud, PUIS activer.');
};

main().catch((e) => { console.error('\nInterrompu :', e.message); process.exit(1); });
