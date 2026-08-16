/**
 * Cree sur le VPS un workflow temoin qui exerce Google Sheets toutes les heures.
 *
 *   node scripts/creer-sonde-identifiants.mjs                 (simulation)
 *   node scripts/creer-sonde-identifiants.mjs --pour-de-vrai  (cree)
 *
 * POURQUOI
 *
 * Le 16 aout, la credential Google Sheets du VPS portait bien son Client ID et
 * son Client Secret, mais la connexion OAuth n'avait jamais ete faite. Rien ne
 * le signalait : la credential paraissait complete. Le defaut n'a ete decouvert
 * que parce qu'un client — le gerant lui-meme — a ecrit au bot, et que le
 * Cerveau a echoue sur `Lire Menu`. Entre la migration et ce message, 22 noeuds
 * etaient casses sans que personne ne le sache.
 *
 * Ce temoin supprime ce delai : il lit une ligne du menu chaque heure. Si la
 * credential tombe — jeton revoque, consentement retire, quota Google — il
 * echoue, et `Alerte Erreurs` previent l'exploitant DANS LA MINUTE.
 *
 * POURQUOI PAS D'ALERTE PROPRE
 *
 * Le workflow ne porte volontairement AUCUNE logique de notification. Il se
 * contente d'echouer. Tout le reste est deja en place : `settings.errorWorkflow`
 * declenche `Alerte Erreurs`, qui sait deja assainir le message et le poster
 * dans le groupe technique. Ajouter un second chemin d'alerte, c'est ajouter un
 * second chemin a maintenir — et un de plus qui peut se taire en silence.
 *
 * CE QU'IL NE COUVRE PAS. Les autres identifiants se prouvent d'eux-memes :
 * `x-sync-secret` par `Alerte Retard Livraison` chaque heure, Telegram par les
 * alertes et par chaque reponse au client, wasender par chaque envoi WhatsApp.
 * Google Sheets etait le seul a n'etre exerce par aucune tache reguliere.
 */

const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE = process.env.N8N_VPS_KEY;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');
if (!CLE) { console.error('Il manque N8N_VPS_KEY.'); process.exit(1); }

const NOM = 'Sonde identifiants (Google Sheets)';
const CRED_SHEETS = { id: '9Q14ADLSkwfm2Y5H', name: 'Google Sheets account' };
const CLASSEUR = '1wTecLIXDyO7RPme9pgHL2qsC3CSKnahjl315nceZK44';
const ONGLET = 'Menu';
const ALERTE_ERREURS = 'NfWU666FLz9jR1Zv';

async function appeler(chemin, options = {}) {
  const r = await fetch(`${VPS}/api/v1${chemin}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': CLE, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`);
  return t ? JSON.parse(t) : null;
}

const corps = {
  name: NOM,
  nodes: [
    {
      id: 'a1f0c2d4-5b6e-4a71-9c83-0d1e2f3a4b5c',
      name: 'Chaque heure',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.3,
      position: [0, 0],
      // A la demie, pour ne pas se superposer a « Alerte Retard Livraison »
      // qui passe a l'heure pile : deux temoins qui echouent ensemble ne
      // disent pas plus qu'un seul, et doublent l'alerte.
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 7-21 * * *' }] } },
    },
    {
      id: 'b2e1d3c5-6c7f-4b82-8d94-1e2f3a4b5c6d',
      name: 'Lire une ligne du menu',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [220, 0],
      parameters: {
        documentId: { __rl: true, mode: 'id', value: CLASSEUR },
        sheetName: { __rl: true, mode: 'name', value: ONGLET },
        options: {},
      },
      credentials: { googleSheetsOAuth2Api: CRED_SHEETS },
      // Aucune tolerance a l'echec, et c'est tout l'objet du temoin : il doit
      // ROUGIR pour que le filet d'alerte se declenche.
      notes: 'Doit echouer si la credential Google tombe. Ne jamais lui poser onError.',
    },
  ],
  connections: {
    'Chaque heure': { main: [[{ node: 'Lire une ligne du menu', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', errorWorkflow: ALERTE_ERREURS, timezone: 'Africa/Abidjan' },
};

const main = async () => {
  const deja = ((await appeler('/workflows?limit=250')).data || []).find((w) => w.name === NOM);
  if (deja) { console.log(`Deja present : ${deja.id} (actif=${deja.active}). Rien a faire.`); return; }

  if (!POUR_DE_VRAI) {
    console.log(`[simulation] creerait « ${NOM} » : ${corps.nodes.length} noeuds, cron 30 7-21, errorWorkflow ${ALERTE_ERREURS}`);
    return;
  }

  const cree = await appeler('/workflows', { method: 'POST', body: JSON.stringify(corps) });
  console.log(`cree : ${cree.id}`);
  await appeler(`/workflows/${cree.id}/activate`, { method: 'POST' });
  console.log('active.');
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
