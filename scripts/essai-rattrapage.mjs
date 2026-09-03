/**
 * LE BANC DU FILET — celui qui rattrape un paiement dont la notification s'est
 * perdue.
 *
 *   node scripts/essai-rattrapage.mjs
 *
 * ── POURQUOI IL EXISTE ─────────────────────────────────────────────────────
 *
 * `/api/internal/billing/rattrapage` est le seul recours quand le webhook du
 * prestataire n'arrive pas. Il est ne d'un incident reel : le 17 aout 2026, un
 * paiement confirme chez GeniusPay est reste `en_attente` chez nous, faute de
 * notification. Le marchand avait paye et n'avait pas son acces.
 *
 * Il tourne toutes les quinze minutes depuis, et il repond a chaque fois :
 *
 *     {"examines":0,"honores":0,"bloques":0}
 *
 * ZERO. Il n'a JAMAIS examine un seul paiement. Le filet est tendu et personne
 * ne l'a vu attraper quoi que ce soit — un filet qu'on n'a jamais eprouve ne
 * protege de rien.
 *
 * ── CE QU'IL EPROUVE, ET CE QU'IL N'EPROUVE PAS ────────────────────────────
 *
 * Il ne peut pas faire dire « paye » au prestataire : cela, seul un vrai
 * paiement le prouve. Il eprouve tout le reste, qui est deterministe :
 *
 *   - le filet VOIT un paiement en attente ;
 *   - il ne l'honore PAS quand le prestataire ne le confirme pas — aucun acces
 *     offert a qui n'a rien paye ;
 *   - il le laisse EN ATTENTE, jamais en « refuse » : un paiement indetermine
 *     n'est pas un paiement refuse, et les confondre enterre de l'argent ;
 *   - passe deux heures, il le compte parmi les bloques, donc l'alerte part ;
 *   - et un paiement SANS JETON ne doit pas disparaitre du champ de vision.
 *
 * ── LE DERNIER CONTROLE EST NE DE LA LECTURE DU CODE ───────────────────────
 *
 * Le balayage filtre sur `jeton_prestataire is not null`. Le jeton est ecrit
 * par une mise a jour SEPAREE, au checkout, dont l'echec n'est que journalise.
 * Si elle rate, le paiement n'est ni examine, ni compte, ni signale, ni listé
 * dans les dossiers ouverts : il sort du champ de vision pour toujours — ce que
 * les commentaires de cette route interdisent explicitement.
 *
 * ⚠ IL ECRIT DANS `paiements`, EN PRODUCTION, sur un utilisateur jetable, et
 * efface tout a la fin — y compris si un controle tombe.
 */
import { readFileSync } from 'node:fs';

const BASE = (process.env.BASE || 'https://www.djiguiflow.com').replace(/\/+$/, '');

function env(nom) {
  if (process.env[nom]) return process.env[nom];
  try {
    const f = readFileSync('.env.local', 'utf8');
    const l = f.split('\n').find((x) => x.startsWith(`${nom}=`));
    return l ? l.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const URL_BASE = env('NEXT_PUBLIC_SUPABASE_URL');
const CLE = env('SUPABASE_SERVICE_ROLE_KEY');
const SYNC = env('SYNC_SECRET');
if (!URL_BASE || !CLE || !SYNC) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SYNC_SECRET sont requis.');
  process.exit(2);
}

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' };

let ko = 0;
function verifier(titre, ok, detail = '') {
  if (!ok) ko += 1;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre}${detail ? `  — ${detail}` : ''}`);
  return ok;
}

const marque = Date.now().toString(36);
/** Deux paiements : l'un avec jeton, l'autre sans. Le second est le point. */
const AVEC = `BANC-FILET-${marque}-AVEC`;
const SANS = `BANC-FILET-${marque}-SANS`;
/**
 * UN JETON QUI N'EST PAS UN BAC A SABLE.
 *
 * Le prefixe `SANDBOX_` ecarte un paiement de l'alerte — c'est voulu, et c'est
 * exactement ce qu'on ne veut pas ici : on eprouve le chemin de l'ARGENT REEL.
 * Le prestataire ne connaitra pas cette reference, donc il ne l'honorera
 * jamais : aucun acces ne peut etre ouvert par ce banc.
 */
const JETON = `BANC-FILET-${marque}`;

let userId = null;

const rest = async (chemin, options = {}) => {
  const r = await fetch(`${URL_BASE}/rest/v1${chemin}`, {
    ...options,
    headers: { ...entetes, Prefer: 'return=representation', ...(options.headers || {}) },
  });
  const texte = await r.text();
  return { ok: r.ok, statut: r.status, corps: texte ? JSON.parse(texte) : null };
};

const balayer = async () => {
  const r = await fetch(`${BASE}/api/internal/billing/rattrapage`, {
    method: 'POST',
    headers: { 'x-sync-secret': SYNC, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(60000),
  });
  return { statut: r.status, corps: await r.json() };
};

const lire = async (reference) => {
  const r = await rest(`/paiements?reference=eq.${encodeURIComponent(reference)}&select=*`);
  return (r.corps ?? [])[0] ?? null;
};

async function installer() {
  const u = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: entetes,
    body: JSON.stringify({ email: `banc-filet-${marque}@djiguiflow.com`, email_confirm: true }),
  });
  const j = await u.json();
  if (!u.ok) { console.error('utilisateur jetable refuse :', u.status, JSON.stringify(j).slice(0, 200)); process.exit(1); }
  userId = j.id;

  const commun = { user_id: userId, plan_key: 'pro', mois: 1, montant_fcfa: 10000, statut: 'en_attente' };
  const r = await rest('/paiements', {
    method: 'POST',
    body: JSON.stringify([
      { ...commun, reference: AVEC, jeton_prestataire: JETON },
      { ...commun, reference: SANS, jeton_prestataire: null },
    ]),
  });
  if (!r.ok) { console.error('paiements de banc refuses :', r.statut, JSON.stringify(r.corps).slice(0, 300)); await nettoyer(); process.exit(1); }
}

async function nettoyer() {
  await rest(`/paiements?reference=in.("${AVEC}","${SANS}")`, { method: 'DELETE' });
  if (userId) {
    await rest(`/subscriptions?user_id=eq.${userId}`, { method: 'DELETE' });
    await fetch(`${URL_BASE}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: entetes });
  }
}

/** Vieillit un paiement, pour franchir le seuil d'alerte sans attendre. */
const vieillir = (reference, heures) => rest(
  `/paiements?reference=eq.${encodeURIComponent(reference)}`,
  {
    method: 'PATCH',
    body: JSON.stringify({ created_at: new Date(Date.now() - heures * 3600_000).toISOString() }),
  },
);

async function derouler() {
  console.log('\n--- le filet voit-il un paiement en attente ? ---');

  const un = await balayer();
  verifier('le balayage repond', un.statut === 200, `HTTP ${un.statut}`);

  const vus = (un.corps.resultats ?? []).map((r) => r.reference);
  verifier('il EXAMINE le paiement porteur d un jeton', vus.includes(AVEC),
    `examines ${un.corps.examines} · ${vus.join(', ') || 'aucun'}`);

  /**
   * LE CONTROLE QUI DIT S'IL Y A UN TROU.
   *
   * Un paiement sans jeton ne peut pas etre interroge chez le prestataire —
   * c'est vrai, et ce n'est pas une raison pour qu'il DISPARAISSE. Le jeton est
   * ecrit par une mise a jour separee dont l'echec n'est que journalise : ce
   * paiement-la existe, et il n'appartient a personne.
   */
  const vuSansJeton = vus.includes(SANS)
    || (un.corps.detailSansJeton ?? []).some((r) => r.reference === SANS);
  verifier('il VOIT aussi celui qui n a pas de jeton', vuSansJeton,
    vuSansJeton ? '' : 'INVISIBLE — hors du champ de vision');

  console.log('\n--- ce qu il ne doit SURTOUT pas faire ---');

  verifier('il n honore rien que le prestataire ne confirme pas', un.corps.honores === 0,
    `honores ${un.corps.honores}`);

  const apres = await lire(AVEC);
  verifier('le paiement reste EN ATTENTE, jamais « echoue »',
    apres?.statut === 'en_attente', String(apres?.statut));

  const { corps: abos } = await rest(`/subscriptions?user_id=eq.${userId}&select=user_id`);
  verifier('aucun acces n a ete ouvert', (abos ?? []).length === 0,
    `${(abos ?? []).length} abonnement(s)`);

  console.log('\n--- passe deux heures, quelqu un doit etre reveille ---');

  await vieillir(AVEC, 3);
  await vieillir(SANS, 3);

  const deux = await balayer();
  const bloques = (deux.corps.detailBloques ?? []).map((b) => b.reference);
  verifier('le paiement bloque depuis 3 h declenche l alerte', bloques.includes(AVEC),
    `bloques ${deux.corps.bloques} · ${bloques.join(', ') || 'aucun'}`);

  const sansJetonSignale = bloques.includes(SANS)
    || (deux.corps.detailSansJeton ?? []).some((r) => r.reference === SANS);
  verifier('celui sans jeton reveille aussi quelqu un', sansJetonSignale,
    sansJetonSignale ? '' : 'MUET — un paiement peut rester invisible pour toujours');

  console.log('\n--- on alerte une fois, puis on se tait ---');

  const trois = await balayer();
  const encore = (trois.corps.detailBloques ?? []).map((b) => b.reference);
  verifier('le meme dossier ne re-alerte pas', !encore.includes(AVEC),
    `bloques ${trois.corps.bloques}`);
  verifier('mais il reste VISIBLE dans les dossiers ouverts',
    (trois.corps.detailDossiersOuverts ?? []).some((d) => d.reference === AVEC),
    `dossiersOuverts ${trois.corps.dossiersOuverts}`);
}

console.log(`--- banc du filet de rattrapage — ${BASE} ---`);
console.log(`    references : ${AVEC} / ${SANS}`);

await installer();
try {
  await derouler();
} catch (e) {
  console.error(`\n⛔ le banc s'est interrompu : ${e instanceof Error ? e.message : e}`);
  ko += 1;
} finally {
  console.log('\n--- nettoyage ---');
  await nettoyer();
  verifier('les paiements de banc ont disparu', !(await lire(AVEC)) && !(await lire(SANS)));
}

console.log();
console.log(ko === 0
  ? 'LE FILET VOIT, N OFFRE RIEN, ET REVEILLE QUELQU UN'
  : `${ko} CONTROLE(S) EN ECHEC`);
process.exit(ko === 0 ? 0 : 1);
