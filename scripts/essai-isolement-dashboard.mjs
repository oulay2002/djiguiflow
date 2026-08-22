/**
 * L'isolement du TABLEAU DE BORD, prouve avec deux vrais comptes.
 *
 *   node scripts/essai-isolement-dashboard.mjs
 *   BASE=http://localhost:3000 node scripts/essai-isolement-dashboard.mjs
 *
 * POURQUOI CE BANC EXISTE. Les routes `/api/dashboard/*` interrogent Supabase
 * avec la cle service_role, qui CONTOURNE RLS. Le cloisonnement multi-marchand
 * ne repose donc sur aucune protection de la base : il repose entierement sur
 * `exigerAccesMarchand` (`src/lib/dashboardAuth.ts`), une seule fonction, une
 * seule ligne de verification de propriete.
 *
 * `essai-multi-marchand.mjs` eprouve la surface PUBLIQUE — un client ne doit
 * pas voir les articles d'une autre boutique. Il n'ouvre aucune session. Cette
 * moitie-la, celle du marchand connecte, n'etait donc verifiee que par lecture
 * du code. Une lecture ne voit pas une route ajoutee demain sans son garde.
 *
 * CE QU'IL FAIT. Il cree deux comptes et deux boutiques, ouvre une session pour
 * le premier, puis demande a chaque route les donnees de la SECONDE. Chaque
 * reponse 200 est une fuite.
 *
 * Le controle positif compte autant : avec sa propre boutique, la meme route
 * doit repondre. Sans lui, un banc ou tout echoue passerait au vert.
 *
 * IL NE REVEILLE PERSONNE. Les deux boutiques portent `essai = true` : aucune
 * chaine n8n ne part. Comptes et boutiques sont supprimes a la fin, meme en cas
 * d'echec.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const url = env('NEXT_PUBLIC_SUPABASE_URL');
const service = env('SUPABASE_SERVICE_ROLE_KEY');
const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!url || !service || !anon) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et');
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis.');
  process.exit(2);
}
const sb = createClient(url, service, { auth: { persistSession: false } });

const marque = Date.now().toString(36);
const MDP = `Banc-${marque}-${Math.random().toString(36).slice(2)}`;

const A = { slug: `iso-a-${marque}`, uuid: crypto.randomUUID(), mail: `iso-a-${marque}@example.invalid` };
const B = { slug: `iso-b-${marque}`, uuid: crypto.randomUUID(), mail: `iso-b-${marque}@example.invalid` };

let ko = 0;
function verifier(titre, ok, detail = '') {
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre}${detail ? `  — ${detail}` : ''}`);
  return ok;
}

function exigerSucces(quoi, { error }) {
  if (!error) return;
  console.error(`\n⛔ installation impossible — ${quoi} : ${error.message}`);
  process.exit(1);
}

async function creerCompte(c) {
  const { data, error } = await sb.auth.admin.createUser({
    email: c.mail,
    password: MDP,
    email_confirm: true,
  });
  if (error) {
    console.error(`\n⛔ creation du compte impossible (${c.mail}) : ${error.message}`);
    process.exit(1);
  }
  c.userId = data.user.id;
}

async function installer() {
  await creerCompte(A);
  await creerCompte(B);

  for (const c of [A, B]) {
    exigerSucces(
      `la boutique ${c.slug}`,
      await sb.from('boutiques').insert({
        id: c.uuid,
        user_id: c.userId,
        slug: c.slug,
        nom: `Isolement ${c.slug}`,
        categorie: 'Commerce',
        zone: 'Banc de test',
        telephone: '0700000000',
        actif: false,
        essai: true,
      }),
    );
  }

  // Un article chez B : sans donnee a voler, une fuite ne se distingue pas
  // d'une boutique vide.
  exigerSucces(
    "l'article de B",
    await sb.from('produits').insert({
      boutique_id: B.uuid,
      nom: `Secret de ${B.slug}`,
      categorie: 'Essai',
      prix: 4242,
      disponible: true,
      stock: 3,
      menu_du_jour: false,
    }),
  );
}

async function nettoyer() {
  // Ordre des dependances : commandes avant produits avant boutiques. Les
  // comptes viennent en dernier, la boutique les referencant par `user_id`.
  for (const c of [A, B]) {
    const { data: cmd } = await sb.from('commandes').select('id').eq('boutique_id', c.uuid);
    const ids = (cmd ?? []).map((x) => x.id);
    if (ids.length) await sb.from('commande_items').delete().in('commande_id', ids);
    await sb.from('commandes').delete().eq('boutique_id', c.uuid);
    await sb.from('produits').delete().eq('boutique_id', c.uuid);
    await sb.from('boutiques').delete().eq('id', c.uuid);
    if (c.userId) await sb.auth.admin.deleteUser(c.userId);
  }
  const { data: reste } = await sb
    .from('boutiques')
    .select('id')
    .in('id', [A.uuid, B.uuid]);
  verifier('les deux boutiques ont disparu', (reste ?? []).length === 0);
}

async function appeler(chemin, jeton, options = {}) {
  const r = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  let corps = null;
  try {
    corps = await r.json();
  } catch {
    corps = null;
  }
  return { statut: r.status, corps };
}

/**
 * Les routes gardees par `exigerAccesMarchand`, et par quel canal elles
 * recoivent la boutique. Une route ajoutee sans son garde n'apparait pas ici :
 * `verifierCouverture` s'en charge.
 */
const ROUTES = [
  { nom: 'produits', chemin: (s) => `/api/dashboard/produits?boutique_id=${s}` },
  { nom: 'commandes', chemin: (s) => `/api/dashboard/commandes?boutique_id=${s}` },
  { nom: 'statistiques', chemin: (s) => `/api/dashboard/stats?boutique_id=${s}` },
  { nom: 'clients', chemin: (s) => `/api/dashboard/clients?boutique_id=${s}` },
  {
    nom: 'onglets',
    chemin: (s) => `/api/dashboard/boutique/onglets?boutique_id=${s}`,
    options: { method: 'POST', body: JSON.stringify({}) },
  },
  {
    nom: 'abonnement push',
    chemin: () => '/api/push/abonner',
    corpsAvecSlug: (s) => ({ boutique_id: s, subscription: { endpoint: 'https://example.invalid/x' } }),
  },
];

console.log(`--- isolement du tableau de bord — ${BASE} ---`);
console.log(`    marchand A : ${A.slug}`);
console.log(`    marchand B : ${B.slug}  (celui qu'on essaie de voler)\n`);

try {
  await installer();

  const publique = createClient(url, anon, { auth: { persistSession: false } });
  const { data: session, error: err } = await publique.auth.signInWithPassword({
    email: A.mail,
    password: MDP,
  });
  if (err || !session?.session?.access_token) {
    console.error(`\n⛔ ouverture de session impossible : ${err?.message ?? 'aucun jeton'}`);
    process.exit(1);
  }
  const jetonA = session.session.access_token;
  verifier('la session de A est ouverte', Boolean(jetonA));

  for (const r of ROUTES) {
    const opts = (slug) =>
      r.corpsAvecSlug
        ? { method: 'POST', body: JSON.stringify(r.corpsAvecSlug(slug)) }
        : (r.options ?? {});

    // ---- Controle POSITIF : sans lui, un banc ou tout echoue passe au vert.
    const sien = await appeler(r.chemin(A.slug), jetonA, opts(A.slug));
    verifier(`${r.nom} — A voit SA boutique`, sien.statut !== 401 && sien.statut !== 404, `HTTP ${sien.statut}`);

    // ---- Le controle qui compte : A ne doit pas voir celle de B.
    const vole = await appeler(r.chemin(B.slug), jetonA, opts(B.slug));
    verifier(`${r.nom} — A ne voit PAS celle de B`, vole.statut !== 200, `HTTP ${vole.statut}`);

    // Une fuite ne se mesure pas qu'au code : le corps ne doit rien porter de B.
    const texte = JSON.stringify(vole.corps ?? {});
    verifier(
      `${r.nom} — rien de B ne transparait`,
      !texte.includes(B.slug) && !texte.includes('Secret de'),
      texte.slice(0, 60),
    );
  }

  // ---- Sans jeton, tout doit se fermer.
  const sansJeton = await appeler(ROUTES[0].chemin(A.slug), null);
  verifier('sans jeton, la route refuse', sansJeton.statut === 401, `HTTP ${sansJeton.statut}`);

  // ---- Un jeton invente ne doit pas passer pour une session.
  const faux = await appeler(ROUTES[0].chemin(A.slug), 'ceci-nest-pas-un-jeton');
  verifier('un jeton invente refuse', faux.statut === 401, `HTTP ${faux.statut}`);
} finally {
  console.log('\n--- nettoyage ---');
  await nettoyer();
}

console.log(
  ko === 0
    ? "\nL ISOLEMENT DU TABLEAU DE BORD TIENT"
    : `\n${ko} CONTROLE(S) EN ECHEC`,
);
process.exit(ko === 0 ? 0 : 1);
