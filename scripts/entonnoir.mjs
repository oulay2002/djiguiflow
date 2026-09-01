/**
 * OU LES MARCHANDS S'ARRETENT-ILS ?
 *
 * ── POURQUOI CE SCRIPT PLUTOT QU'UN OUTIL DE MESURE ────────────────────────
 *
 * L'article 9 de la politique de confidentialite promet qu'aucun outil
 * d'analytique n'est installe, et qu'il n'y a donc pas de bandeau de
 * consentement « parce qu'il n'y a rien a consentir ». C'est un engagement
 * publie et opposable — voir le garde `tests/unit/aucun-traceur.test.ts`.
 *
 * Cet entonnoir ne depose RIEN chez personne. Il compte, cote serveur, des
 * donnees deja detenues au titre du contrat qui lie la plateforme au marchand.
 * Il ne releve donc pas de l'article 9, et n'appelle ni cookie ni consentement.
 *
 * ── CE QU'IL MESURE, ET POURQUOI C'EST LA BONNE QUESTION ───────────────────
 *
 * Compter des visiteurs anonymes dit combien de gens passent. L'entonnoir
 * d'activation dit **ou ils renoncent** — et c'est la seule mesure sur
 * laquelle on puisse agir. Un marchand qui cree sa boutique et n'ajoute jamais
 * un produit ne raconte pas la meme panne que celui qui ajoute vingt produits
 * et ne branche jamais WhatsApp.
 *
 * ── LES BOUTIQUES D'ESSAI SONT EXCLUES, ET LE SCRIPT LE DIT ────────────────
 *
 * Zahara, Rose Monde et Atelier Temoin sont des boutiques factices. Les
 * compter ferait croire a une activation parfaite : elles ont evidemment tout
 * fait, puisque c'est nous qui les avons remplies. Un chiffre qui se flatte
 * lui-meme est pire qu'un chiffre absent.
 *
 * Usage : node scripts/entonnoir.mjs
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

if (!URL_BASE || !CLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou la cle de service manquent dans .env.local');
  process.exit(1);
}

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

async function lire(chemin) {
  const r = await fetch(`${URL_BASE}${chemin}`, { headers: entetes, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`${chemin} → HTTP ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- les donnees

const boutiques = await lire(
  '/rest/v1/boutiques?select=id,slug,nom,user_id,actif,essai,wasender_session_id,telegram_marchand',
);

/**
 * UNE BOUTIQUE QUI VOUS APPARTIENT N'EST PAS UN CLIENT.
 *
 * Le drapeau `essai` ne suffit pas : Zahara et Rose Monde sont factices mais
 * ne le portent PAS, et il ne faut surtout pas le leur poser — `essai = true`
 * les retirerait aussi de la surveillance des chaines (`veille/chaines`), or
 * Zahara est aujourd'hui la seule boutique qui eprouve la chaine en vrai. On
 * casserait un dispositif pour reparer un compteur.
 *
 * ── POURQUOI DES SLUGS, ET PAS `ADMIN_USER_IDS` ────────────────────────────
 *
 * Ce script a d'abord lu `ADMIN_USER_IDS`, en demandant d'y recopier « la meme
 * valeur que dans Vercel ». CETTE CONSIGNE ETAIT IMPOSSIBLE A SUIVRE : la
 * variable y est marquee « Sensitive », donc sa valeur ne peut etre relue ni
 * par l'interface ni par `vercel env pull`, qui rend `[SENSITIVE]`. Seulement
 * remplacee.
 *
 * Le fond du probleme etait ailleurs : « qui est administrateur » et « quelles
 * boutiques sont les notres » ne sont pas la meme question, et les confondre
 * etait une facilite. Un slug se lit, se verifie d'un coup d'oeil dans la
 * barre d'adresse, et n'est le secret de personne.
 *
 * LES COMPTES SE DEDUISENT DES BOUTIQUES : declarer une boutique comme notre
 * exclut aussi son proprietaire du compte des inscrits. Une seule chose a
 * tenir a jour, donc une seule qui puisse diverger.
 */
const SLUGS_A_NOUS = new Set(
  (env.BOUTIQUES_EXPLOITANT ?? process.env.BOUTIQUES_EXPLOITANT ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const estANous = (b) => b.essai === true || SLUGS_A_NOUS.has(String(b.slug ?? '').toLowerCase());

const ADMINS = new Set(boutiques.filter(estANous).map((b) => String(b.user_id)));

const reelles = boutiques.filter((b) => !estANous(b));
const factices = boutiques.length - reelles.length;
const idsReels = new Set(reelles.map((b) => b.id));

const produits = await lire('/rest/v1/produits?select=boutique_id');
const commandes = await lire('/rest/v1/commandes?select=boutique_id');
const paiements = await lire('/rest/v1/paiements?select=user_id,statut');

const avecProduit = new Set(produits.map((p) => p.boutique_id).filter((id) => idsReels.has(id)));
const avecCommande = new Set(commandes.map((c) => c.boutique_id).filter((id) => idsReels.has(id)));
const comptesPayants = new Set(paiements.filter((p) => p.statut === 'paye').map((p) => p.user_id));

/**
 * Les comptes, s'ils sont lisibles.
 *
 * L'ecart entre « compte cree » et « boutique creee » est la premiere marche
 * de l'entonnoir, et souvent la plus haute. Si l'API d'administration refuse,
 * on le DIT plutot que de faire commencer l'entonnoir a la boutique en
 * laissant croire que rien ne se perd avant.
 */
let comptes = null;
let orphelins = [];
try {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=1000`, { headers: entetes });
  if (r.ok) {
    const users = (await r.json()).users ?? [];
    const proprietaires = new Set(boutiques.map((b) => String(b.user_id)));
    const clients = users.filter((u) => !ADMINS.has(u.id));
    comptes = clients.length;

    /**
     * LES COMPTES SANS BOUTIQUE, NOMMES UN PAR UN.
     *
     * C'est la premiere marche et souvent la plus haute : quelqu'un a voulu
     * entrer, a cree son compte, et s'est arrete avant d'avoir une boutique.
     * Un pourcentage ne dit pas quoi faire ; une date d'inscription, si — on
     * peut rappeler quelqu'un qui s'est inscrit avant-hier.
     */
    orphelins = clients
      .filter((u) => !proprietaires.has(u.id))
      .map((u) => ({ quand: String(u.created_at).slice(0, 10), id: u.id.slice(0, 8) }));
  }
} catch {
  comptes = null;
}

// ---------------------------------------------------------------- l'entonnoir

const branchee = (b) =>
  Boolean(String(b.wasender_session_id ?? '').trim() || String(b.telegram_marchand ?? '').trim());

const etapes = [
  ['Compte cree', comptes],
  ['Boutique creee', reelles.length],
  ['Au moins un produit', reelles.filter((b) => avecProduit.has(b.id)).length],
  ['Un canal branche', reelles.filter(branchee).length],
  ['Vitrine en ligne', reelles.filter((b) => b.actif !== false).length],
  ['Au moins une commande', reelles.filter((b) => avecCommande.has(b.id)).length],
  ['Au moins un paiement', reelles.filter((b) => comptesPayants.has(b.user_id)).length],
];

console.log(`\nENTONNOIR D'ACTIVATION — ${new Date().toISOString().slice(0, 10)}\n`);

let precedent = null;
for (const [nom, valeur] of etapes) {
  if (valeur === null) {
    console.log(`  ${nom.padEnd(24)} ?      (API d'administration illisible — marche non mesuree)`);
    continue;
  }
  const perte =
    precedent === null || precedent === 0
      ? ''
      : `  ${valeur === precedent ? '—' : `-${precedent - valeur}`}  (${Math.round((valeur / precedent) * 100)} %)`;
  console.log(`  ${nom.padEnd(24)} ${String(valeur).padStart(4)}${perte}`);
  precedent = valeur;
}

console.log(`\n  ${factices} boutique(s) a nous, exclue(s) du calcul.`);

if (SLUGS_A_NOUS.size === 0 && boutiques.some((b) => b.essai !== true)) {
  console.log(
    '  ⚠ BOUTIQUES_EXPLOITANT n\'est pas renseignee : seules les boutiques\n'
    + '    portant `essai` ont ete ecartees. Les votres comptent donc comme des\n'
    + '    clientes, et les chiffres ci-dessus sont FLATTEURS.\n'
    + '    Poser dans .env.local, par exemple :\n'
    + '      BOUTIQUES_EXPLOITANT=zahara,rose-monde',
  );
}

if (reelles.length === 0) {
  console.log('  Aucune boutique cliente : normal avant le lancement.');
}

if (orphelins.length) {
  console.log(`\n  ${orphelins.length} compte(s) sans boutique — la marche perdue :`);
  for (const o of orphelins) console.log(`    inscrit le ${o.quand}   ${o.id}...`);
  console.log('    Ils ont voulu entrer et se sont arretes avant d avoir une boutique.');
}

/**
 * LE LEVIER LATENT. `commande_minimum` et `livraison_offerte_des` existent
 * depuis le 29 aout et personne ne les a jamais poses. Le seuil de livraison
 * offerte est le levier le plus fiable du commerce pour faire monter un
 * panier : le rappeler ici evite qu'il dorme une saison de plus.
 */
const leviers = await lire('/rest/v1/boutiques?select=slug,commande_minimum,livraison_offerte_des');
const poses = leviers.filter(
  (b) => b.commande_minimum !== null || b.livraison_offerte_des !== null,
).length;
console.log(`  Levier de panier pose sur ${poses} boutique(s) sur ${leviers.length}.`);
console.log();
