/**
 * Le banc de la CHAINE — celui qui va jusqu'a n8n.
 *
 *   node scripts/essai-chaine-n8n.mjs                 (production)
 *   BASE=http://localhost:3000 node scripts/essai-chaine-n8n.mjs
 *
 * POURQUOI IL EXISTE. `essai-multi-marchand.mjs` s'arrete AVANT n8n : sa
 * boutique porte `essai = true`, ce qui fait taire le declencheur Postgres et
 * les deux appels webhook de la prise de commande. C'est ce qui le rend
 * supportable — aucun livreur n'est appele — et c'est aussi pourquoi la moitie
 * du parcours qui atteint reellement le client et le livreur n'etait exercee
 * par RIEN. Sa derniere execution datait du 19 aout 2026, a la main, sur une
 * boutique factice mal configuree qui a echoue.
 *
 * Un test dangereux ne se fait pas. Un test qu'on ne fait pas ne protege rien.
 *
 * CE QU'IL FAIT DIFFEREMMENT. Sa boutique porte `essai = false` — la chaine
 * s'execute donc en ENTIER — mais aussi `banc_telegram_id`, qui detourne tout
 * message sortant vers le salon de veille, prefixe du canal et du destinataire
 * reels. Voir `envoyerMessage` dans `src/lib/canaux.ts`.
 *
 * CE QU'IL VERIFIE VRAIMENT : que n8n a bien execute. Le reste du parcours est
 * deja couvert par l'autre banc ; ici la question est « le maillon suivant
 * s'est-il reveille ? ».
 *
 * ⚠ IL PARLE AU SALON DE VEILLE. C'est le but : on va LIRE ce que le client et
 * le livreur auraient recu. Attendez-vous a quelques messages prefixes
 * « 🧪 BANC ».
 *
 * ⚠ Il exige N8N_API_URL et N8N_VPS_KEY pour lire les executions. Sans elles il
 * pose la commande et s'arrete en le disant, plutot que de conclure a tort.
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
const cle = env('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !cle) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  process.exit(2);
}
const sb = createClient(url, cle, { auth: { persistSession: false } });

// Le salon technique de la plateforme, le meme repli que `veille-n8n.mjs`.
const SALON = env('TELEGRAM_ALERTE_CHAT_ID') || '-1003994906478';

/**
 * LE VERROU, ET IL N'EST PAS DE LA PAPERASSE.
 *
 * Le detournement vit dans `envoyerMessage` (`src/lib/canaux.ts`). Tant que
 * cette version n'est pas DEPLOYEE sur `BASE`, la colonne `banc_telegram_id`
 * n'est lue par personne : l'envoi suit alors le chemin normal, ne trouve aucun
 * jeton pour cette boutique neuve, retombe sur le jeton de la PLATEFORME et
 * part au numero du faux client — qui est un numero ivoirien plausible, donc
 * potentiellement celui de quelqu'un.
 *
 * Le filet devient le contraire d'un filet exactement quand on croit l'avoir.
 * D'ou ce drapeau : il ne verifie rien, il oblige a y penser.
 */
if (!process.argv.includes('--deploiement-confirme')) {
  console.error('Ce banc fait executer la chaine ENTIERE, n8n compris.\n');
  console.error('Le detournement vers le salon de veille vit dans src/lib/canaux.ts.');
  console.error(`Si cette version n'est pas deployee sur ${BASE}, le message client`);
  console.error('partira au VRAI numero via le jeton de la plateforme.\n');
  console.error('Verifiez le deploiement, puis relancez avec --deploiement-confirme.');
  process.exit(2);
}

const marque = Date.now().toString(36);
const SLUG = `banc-chaine-${marque}`;
const UUID = crypto.randomUUID();

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

async function installer() {
  exigerSucces(
    'la boutique de banc',
    await sb.from('boutiques').insert({
      id: UUID,
      user_id: crypto.randomUUID(),
      slug: SLUG,
      nom: `Banc de chaine ${marque}`,
      categorie: 'Commerce',
      zone: 'Banc de test',
      telephone: '0700000000',
      actif: false,
      // LA DIFFERENCE AVEC L'AUTRE BANC, et toute la raison de ce script :
      // la chaine doit s'executer pour de vrai.
      essai: false,
      // LE FILET. Tout message sortant part au salon de veille, jamais au
      // destinataire. Sans cette colonne, ce script reveillerait de vrais
      // livreurs.
      banc_telegram_id: SALON,
      // Le dispatch leve si la boutique n'a pas de groupe : c'est ce qui a fait
      // echouer l'essai manuel du 19 aout. L'envoi sera detourne de toute
      // facon, donc y mettre le salon est sans risque.
      groupe_livreurs: SALON,
    }),
  );

  exigerSucces(
    "l'article temoin",
    await sb.from('produits').insert({
      boutique_id: UUID,
      nom: 'Article de chaine',
      categorie: 'Essai',
      prix: 1000,
      disponible: true,
      stock: 5,
      menu_du_jour: false,
    }),
  );
}

/**
 * L'ordre suit les dependances : articles, puis commandes, puis produits, puis
 * la boutique.
 *
 * `commandes.boutique_id` est en NO ACTION quand toutes les autres tables
 * CASCADENT — et c'est juste : une commande est une piece comptable, supprimer
 * une boutique ne doit pas effacer son histoire. Une boutique qui a pris une
 * commande ne se supprime donc PAS d'un seul `delete`.
 *
 * Ce nettoyage est celui de `essai-multi-marchand.mjs`, repris tel quel. La
 * premiere version de ce script en avait ecrit un nouveau, plus court, qui
 * echouait en silence — il a laisse une boutique de banc en production, avec
 * sa commande. Reecrire ce qui marche deja est une facon fiable de casser.
 */
async function nettoyer() {
  const { data: commandes } = await sb.from('commandes').select('id').eq('boutique_id', UUID);
  const ids = (commandes ?? []).map((c) => c.id);
  if (ids.length) await sb.from('commande_items').delete().in('commande_id', ids);
  await sb.from('commandes').delete().eq('boutique_id', UUID);
  await sb.from('produits').delete().eq('boutique_id', UUID);
  await sb.from('boutiques').delete().eq('id', UUID);

  const { data } = await sb.from('boutiques').select('id').eq('id', UUID).maybeSingle();
  verifier('la boutique de banc a disparu', !data);
}

/** Combien d'executions n8n existent, tous workflows confondus. */
async function executionsN8n() {
  // L'URL a un defaut : seule la CLE doit etre secrete. Exiger les deux rendait
  // le controle muet sur un poste qui a pourtant tout ce qu'il faut — constate
  // au premier passage, ou le banc a pose la commande sans pouvoir conclure.
  const api = env('N8N_API_URL') || 'https://n8n.djiguiflow.com/api/v1';
  const clef = env('N8N_VPS_KEY') || env('N8N_API_KEY');
  if (!clef) return null;
  try {
    const r = await fetch(`${api.replace(/\/+$/, '')}/executions?limit=1`, {
      headers: { 'X-N8N-API-KEY': clef },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

console.log(`--- banc de la chaine — ${BASE} ---`);
console.log(`    boutique de banc : ${SLUG}`);
console.log(`    tout part au salon ${SALON}, prefixe « 🧪 BANC »\n`);

try {
  await installer();

  const avant = await executionsN8n();
  if (avant === null) {
    console.log('  note  N8N_API_URL / N8N_VPS_KEY absentes : on posera la commande');
    console.log('        sans pouvoir affirmer que n8n a execute.\n');
  }

  const { data: article } = await sb
    .from('produits')
    .select('id')
    .eq('boutique_id', UUID)
    .maybeSingle();

  // UNE PANNE RESEAU EST UN CONTROLE EN ECHEC, PAS UN PLANTAGE. Au premier
  // passage, un `ConnectTimeoutError` a tue le processus apres le nettoyage :
  // on perdait le compte-rendu, et un banc qui s'interrompt se lit comme un
  // banc qu'on n'a pas lance. Le delai est genereux — la prise de commande
  // ecrit trois tables et appelle deux webhooks.
  let r = null;
  let corps = null;
  let panne = '';
  try {
    r = await fetch(`${BASE}/api/boutiques/${SLUG}/commander`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: 'Client du banc de chaine',
        tel: '0102030405',
        adresse: 'Banc de test',
        panier: [{ id: article?.id, quantite: 1 }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    corps = await r.json().catch(() => null);
  } catch (e) {
    panne = e instanceof Error ? e.message : 'erreur reseau';
  }

  verifier('la commande est acceptee', r?.status === 200, panne || `HTTP ${r?.status}`);
  verifier('elle rend une reference', Boolean(corps?.order_id), corps?.order_id ?? '(aucune)');

  if (avant !== null) {
    // La chaine est asynchrone : le declencheur Postgres poste via pg_net, et
    // n8n enchaine plusieurs sous-workflows. On laisse le temps de la traverser
    // plutot que de conclure trop vite a une panne.
    process.stdout.write('  ...  attente de n8n ');
    let apres = avant;
    for (let i = 0; i < 12 && apres === avant; i++) {
      await new Promise((r2) => setTimeout(r2, 5000));
      process.stdout.write('.');
      apres = await executionsN8n();
    }
    console.log();
    verifier(
      'n8n a execute la chaine',
      apres !== avant,
      apres === avant ? 'aucune execution nouvelle en 60 s' : `derniere execution ${apres}`,
    );
    console.log('\n  Lisez le salon de veille : les messages « 🧪 BANC » disent');
    console.log('  exactement ce que le client et le livreur auraient recu.');
  }
} finally {
  console.log('\n--- nettoyage ---');
  await nettoyer();
}

console.log(
  ko === 0
    ? '\nLA CHAINE VA JUSQU AU BOUT — et personne n a ete reveille'
    : `\n${ko} CONTROLE(S) EN ECHEC`,
);
process.exit(ko === 0 ? 0 : 1);
