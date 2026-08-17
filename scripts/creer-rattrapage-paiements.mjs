/**
 * Cree sur le VPS le workflow qui rattrape les paiements confirmes chez le
 * prestataire mais restes en attente chez nous.
 *
 *   node scripts/creer-rattrapage-paiements.mjs                 (simulation)
 *   node scripts/creer-rattrapage-paiements.mjs --pour-de-vrai  (cree et active)
 *
 * POURQUOI
 *
 * Le 17 aout 2026, GeniusPay a confirme un paiement — `completed`, 10 000 XOF —
 * que notre base a laisse « en_attente » : l'URL du webhook n'etait pas encore
 * declaree chez eux, donc aucune notification n'est arrivee. Le marchand avait
 * paye et n'avait pas son acces, et RIEN NE L'AURAIT JAMAIS RATTRAPE.
 *
 * Un webhook se perd, toujours : URL absente, panne passagere, deploiement en
 * cours, rejeu abandonne apres un 200. Le prestataire, lui, repond quand on
 * l'interroge. C'est donc a nous d'aller voir, regulierement.
 *
 * CE WORKFLOW NE PORTE AUCUNE LOGIQUE. Il appelle une route et s'arrete. Tout
 * le discernement — idempotence, montant confronte a l'attendu, refus du bac a
 * sable, indetermine laisse en attente — vit dans `honorerPaiement()`, partage
 * avec le webhook. Deux implementations des memes gardes sur de l'argent
 * finiraient par diverger.
 *
 * POURQUOI PAS D'ALERTE PROPRE. `settings.errorWorkflow` declenche deja
 * « Alerte Erreurs », qui sait assainir le message et le poster dans le canal
 * technique. Un second chemin d'alerte serait un de plus a maintenir, et un de
 * plus qui peut se taire.
 */

const VPS = (process.env.N8N_VPS_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE = process.env.N8N_VPS_KEY;
const POUR_DE_VRAI = process.argv.includes('--pour-de-vrai');
if (!CLE) { console.error('Il manque N8N_VPS_KEY.'); process.exit(1); }

const NOM = 'Rattrapage paiements';
const ALERTE_ERREURS = 'NfWU666FLz9jR1Zv';
const CRED_HEADER = { id: 'QoKeVRwGrk1YqN9Q', name: 'Header Auth account 2' };

// Toutes les quinze minutes, jour et nuit : un marchand peut payer a toute
// heure, et le faire attendre son acces est le seul cout de cette latence.
// L'instance est auto-hebergee depuis le 16 aout : une execution ne coute plus
// rien, contrairement au Cloud ou ce cron aurait pese sur le quota.
const CRON = '*/15 * * * *';

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
      id: 'e1a70006-0000-4000-8000-000000000001',
      name: 'Toutes les 15 minutes',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.3,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: CRON }] } },
    },
    {
      id: 'e1a70006-0000-4000-8000-000000000002',
      name: 'Rattraper les paiements',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.4,
      position: [220, 0],
      credentials: { httpHeaderAuth: CRED_HEADER },
      parameters: {
        method: 'POST',
        url: 'https://www.djiguiflow.com/api/internal/billing/rattrapage',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '{}',
        options: {},
      },
      // AUCUNE tolerance a l'echec, et c'est voulu : si la route ne repond
      // plus, des paiements encaisses cesseraient d'etre honores en silence.
      // Il faut que ca rougisse.
      notes: 'Ne jamais lui poser onError. Une panne ici laisse des marchands sans leur acces.',
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 5000,
    },
  ],
  connections: {
    'Toutes les 15 minutes': {
      main: [[{ node: 'Rattraper les paiements', type: 'main', index: 0 }]],
    },
  },
  settings: { executionOrder: 'v1', errorWorkflow: ALERTE_ERREURS, timezone: 'Africa/Abidjan' },
};

const main = async () => {
  const deja = ((await appeler('/workflows?limit=250')).data || []).find((w) => w.name === NOM);
  if (deja) { console.log(`Deja present : ${deja.id} (actif=${deja.active}). Rien a faire.`); return; }

  if (!POUR_DE_VRAI) {
    console.log(`[simulation] creerait « ${NOM} » : cron ${CRON}, errorWorkflow ${ALERTE_ERREURS}`);
    return;
  }

  const cree = await appeler('/workflows', { method: 'POST', body: JSON.stringify(corps) });
  console.log(`cree : ${cree.id}`);
  await appeler(`/workflows/${cree.id}/activate`, { method: 'POST' });
  console.log('active.');
};

main().catch((e) => { console.error('Interrompu :', e.message); process.exit(1); });
