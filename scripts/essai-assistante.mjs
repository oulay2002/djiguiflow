/**
 * Le banc de L'ASSISTANTE — le canal par lequel arrivent presque tous les
 * clients, et le seul que rien n'eprouvait.
 *
 *   node scripts/essai-assistante.mjs --deploiement-confirme
 *
 * ── POURQUOI IL EXISTE ─────────────────────────────────────────────────────
 *
 * `essai-multi-marchand.mjs` eprouve la vitrine. `essai-chaine-n8n.mjs` va de
 * la vitrine jusqu'au livreur. Aucun des deux ne fait entrer un MESSAGE : le
 * parcours « un client ecrit sur WhatsApp, l'assistante repond, une commande
 * naît » n'etait verifie par rien, alors que c'est le chemin principal en
 * production.
 *
 * Les defauts qu'on y a trouves a la main le disent assez : une commande
 * fantome nee d'un « bonjour », une note perdue parce que le client avait ecrit
 * « '2 », un « stop » sans accuse de reception, une fuite d'un marchand vers le
 * bot d'un autre. Tous invisibles a la CI, tous trouves parce qu'un humain
 * regardait une capture d'ecran.
 *
 * ── COMMENT IL ENTRE ───────────────────────────────────────────────────────
 *
 * Il POSTe un webhook WhatsApp forge sur `Routeur WhatsApp`, exactement comme
 * le ferait le fournisseur. Le secret d'entree est propre au marchand et
 * verifie cote serveur, dans `/api/internal/fiche` : le banc s'en pose donc un
 * a lui, connu de lui seul, et n'emprunte celui de personne.
 *
 * ── CE QUI EMPECHE D'ECRIRE A UN VRAI CLIENT ───────────────────────────────
 *
 * `banc_telegram_id`. Dans `envoyerMessage`, le detournement vient AVANT la
 * resolution du jeton : une boutique de banc sans aucun canal branche ne peut
 * atteindre personne, meme si tout le reste allait de travers. C'est la seule
 * propriete sur laquelle repose la sûrete de ce script.
 *
 * ⚠ IL PARLE AU SALON DE VEILLE, et il appelle Mistral quelques fois.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const BASE = (process.env.BASE || 'https://www.djiguiflow.com').replace(/\/+$/, '');
const N8N = (process.env.N8N_BASE || 'https://n8n.djiguiflow.com').replace(/\/+$/, '');

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
const cleN8n = env('N8N_VPS_KEY') || env('N8N_API_KEY');
if (!url || !cle) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  process.exit(2);
}
const sb = createClient(url, cle, { auth: { persistSession: false } });

const SALON = env('TELEGRAM_ALERTE_CHAT_ID') || '-1003994906478';

/**
 * LE MEME VERROU QUE LE BANC DE CHAINE, ET POUR LA MEME RAISON.
 *
 * Le detournement vit dans le code deploye. Tant que cette version n'est pas
 * en ligne sur `BASE`, `banc_telegram_id` n'est lu par personne : l'envoi suit
 * le chemin normal et part au numero du faux client. Ce drapeau ne verifie
 * rien — il oblige a y penser.
 */
if (!process.argv.includes('--deploiement-confirme')) {
  console.error('Ce banc fait ECRIRE l assistante, Mistral compris.\n');
  console.error('Le detournement vers le salon de veille vit dans src/lib/canaux.ts.');
  console.error(`Si cette version n'est pas deployee sur ${BASE}, la reponse partira`);
  console.error('au VRAI numero du faux client.\n');
  console.error('Verifiez le deploiement, puis relancez avec --deploiement-confirme.');
  process.exit(2);
}

const marque = Date.now().toString(36);
const SLUG = `banc-assist-${marque}`;
const UUID = randomUUID();

/** Le secret d'entree du banc. Connu de lui seul, jamais emprunte a personne. */
const SECRET = randomUUID().replace(/-/g, '');
const EMPREINTE = createHash('sha256').update(SECRET, 'utf8').digest('hex');

/**
 * Le numero du faux client.
 *
 * Il RESSEMBLE a un numero ivoirien, parce que la normalisation le refuserait
 * sinon — et c'est bien pour cela que le detournement doit tenir : si le filet
 * lachait, ce numero pourrait etre celui de quelqu'un.
 */
const TEL = '0700000042';

let ko = 0;
function verifier(titre, ok, detail = '') {
  if (!ok) ko += 1;
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre}${detail ? `  — ${detail}` : ''}`);
  return ok;
}

function exigerSucces(quoi, { error }) {
  if (!error) return;
  console.error(`\n⛔ installation impossible — ${quoi} : ${error.message}`);
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ INSTALLER
async function installer() {
  exigerSucces(
    'la boutique de banc',
    await sb.from('boutiques').insert({
      id: UUID,
      user_id: randomUUID(),
      slug: SLUG,
      nom: `Banc assistante ${marque}`,
      categorie: 'Commerce',
      zone: 'Banc de test',
      telephone: '0700000000',
      // Hors de l'annuaire public : ce banc n'a rien a y faire.
      actif: false,
      // La chaine doit s'executer POUR DE VRAI, comme le banc de chaine.
      essai: false,
      // LE FILET.
      banc_telegram_id: SALON,
      groupe_livreurs: SALON,
      // LE SECOND FACTEUR. Sans empreinte, `/api/internal/fiche` REFUSE — et
      // c'est voulu depuis le 17 aout : une empreinte absente vaut refus.
      webhook_secret_hash: EMPREINTE,
      // `null` sur les horaires veut dire « toujours ouvert » : sans cela, le
      // routeur repondrait « c'est ferme » et rien d'autre ne serait eprouve.
      horaires: null,
    }),
  );

  exigerSucces(
    'les articles du banc',
    await sb.from('produits').insert([
      {
        boutique_id: UUID, nom: 'Café du banc', categorie: 'Essai',
        prix: 500, disponible: true, stock: 10, menu_du_jour: true,
      },
    ]),
  );
}

async function nettoyer() {
  await sb.from('commandes').delete().eq('boutique_id', UUID);
  await sb.from('paniers').delete().eq('boutique_id', UUID);
  await sb.from('produits').delete().eq('boutique_id', UUID);
  await sb.from('relances_stop').delete().eq('boutique', SLUG);
  await sb.from('relances_envoyees').delete().eq('boutique', SLUG);
  await sb.from('boutiques').delete().eq('id', UUID);
}

// ------------------------------------------------------------------- ENVOYER
/**
 * Un message WhatsApp forge, dans la forme exacte que `Normalisateur WA` lit.
 *
 * Elle a ete relevee sur le noeud lui-meme, pas devinee : `data.messages.key`,
 * `messageBody`, `cleanedSenderPn`, `pushName`. Une forme approximative
 * passerait le webhook et ressortirait vide, ce qui ressemblerait a un refus.
 */
function messageWhatsApp(texte) {
  const digits = '225' + TEL.replace(/^0/, '');
  return {
    data: {
      messages: {
        key: { fromMe: false, cleanedSenderPn: digits, senderPn: `${digits}@s.whatsapp.net` },
        messageBody: texte,
      },
      pushName: 'Client du banc',
    },
  };
}

/**
 * L'ADRESSE DU ROUTEUR, ET LE PIEGE QU'ELLE PORTE.
 *
 * n8n sert un webhook a la fois sous `/webhook/<chemin>` et sous
 * `/webhook/<id du noeud>/<chemin>`. Seule la SECONDE est enregistree ici.
 * Sonder la premiere rend 404 — et un 404 ressemble a un refus poli : le banc
 * a d'abord conclu que « sans en-tete, rien ne se cree », alors que rien ne
 * s'etait cree parce que rien n'etait arrive.
 *
 * `telegramBranchement.ts` porte deja cet avertissement pour le routeur
 * Telegram. Il valait pour celui-ci aussi.
 */
const ID_NOEUD_WA = env('N8N_WEBHOOK_WA_ID') || '1b96720c-e3b3-4638-a351-7f3704bd483e';

async function ecrire(texte, { secret = SECRET, entete = 'x-webhook-secret' } = {}) {
  const entetes = { 'Content-Type': 'application/json' };
  if (secret !== null) entetes[entete] = secret;
  try {
    const r = await fetch(`${N8N}/webhook/${ID_NOEUD_WA}/whatsapp/${SLUG}`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify(messageWhatsApp(texte)),
      signal: AbortSignal.timeout(30000),
    });
    return r.status;
  } catch (e) {
    return `echec: ${e instanceof Error ? e.message : e}`;
  }
}

/** Combien de commandes la boutique de banc porte-t-elle ? */
async function commandes() {
  const { data } = await sb.from('commandes').select('reference').eq('boutique_id', UUID);
  return data ?? [];
}

/** La derniere execution d'un workflow, ou l'aveu qu'on n'a pas pu lire. */
async function derniereExecution(workflowId) {
  if (!cleN8n) return { lisible: false, raison: 'N8N_VPS_KEY absente' };
  try {
    const r = await fetch(`${N8N}/api/v1/executions?limit=1&workflowId=${workflowId}`, {
      headers: { 'X-N8N-API-KEY': cleN8n },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { lisible: false, raison: `HTTP ${r.status}` };
    const j = await r.json();
    return { lisible: true, id: j?.data?.[0]?.id ?? null, statut: j?.data?.[0]?.status ?? null };
  } catch (e) {
    return { lisible: false, raison: e instanceof Error ? e.message : String(e) };
  }
}

const ROUTEUR_WA = 'xGw9MbvqvN3XAPpQ';

// ------------------------------------------------------------------ DEROULER
/**
 * L'ORDRE DES CONTROLES N'EST PAS ARBITRAIRE.
 *
 * La premiere version eprouvait les refus d'abord. Ils passaient tous — et
 * pour rien : l'adresse du webhook etait fausse, chaque appel rendait 404, et
 * « aucune commande n'a ete creee » etait vrai parce que RIEN N'ETAIT ARRIVE.
 * Un refus se confond avec une panne tant qu'on n'a pas montre que le canal
 * fonctionne.
 *
 * On prouve donc d'abord que le message PASSE et produit un effet observable.
 * Chaque refus est ensuite prouve par l'ABSENCE de ce meme effet — pas par
 * l'absence de quelque chose qui n'arrivait jamais.
 */
async function derouler() {
  console.log('\n--- le canal est-il vivant ? ---');

  const avant = await derniereExecution(ROUTEUR_WA);
  const statut = await ecrire('bonjour');
  await dormir(20000);
  const apres = await derniereExecution(ROUTEUR_WA);

  if (!avant.lisible || !apres.lisible) {
    // On ne conclut PAS d'une lecture ratee : un doute rendu comme une
    // certitude est le defaut qu'on passe notre temps a fermer.
    verifier('le routeur a execute la chaine', false,
      `INDETERMINE — ${apres.raison ?? avant.raison}. Ce n'est pas la preuve d'un echec.`);
    console.error('\n⛔ sans cette preuve, aucun refus ci-dessous ne veut rien dire.');
    return;
  }

  const vivant = verifier('le routeur a execute la chaine', apres.id !== avant.id,
    `HTTP ${statut} · execution ${avant.id ?? '?'} -> ${apres.id ?? '?'}`);

  if (!vivant) {
    console.error('\n⛔ le message n est pas arrive. Verifiez l adresse du webhook :');
    console.error(`   ${N8N}/webhook/${ID_NOEUD_WA}/whatsapp/<slug>`);
    console.error('   n8n sert aussi `/webhook/<chemin>`, qui rend 404 ici.');
    return;
  }

  /**
   * LE CONTROLE LE PLUS IMPORTANT DU BANC.
   *
   * Le 20 aout 2026, un simple « bonjour » a fait naitre une commande fantome :
   * l'assistante composait un panier et l'enregistrait sans que personne n'ait
   * rien demande. Le verrou de consentement a ete pose dans le CODE, pas dans
   * le prompt — parce qu'une consigne au modele n'est pas un verrou.
   *
   * Si ce controle tombe un jour, c'est que le verrou a saute.
   */
  const apresBonjour = await commandes();
  verifier('un « bonjour » ne fait naitre AUCUNE commande', apresBonjour.length === 0,
    apresBonjour.length ? apresBonjour.map((c) => c.reference).join(', ') : 'aucune');

  console.log('\n--- ce qui doit etre REFUSE ---');

  /**
   * ON EPROUVE LE REFUS SUR « STOP », ET C'EST DELIBERE.
   *
   * « STOP » produit une ECRITURE observable en base quand il est accepte.
   * Un refus se prouve donc par l'absence de cette ligne — un effet dont on
   * vient de montrer, plus bas, qu'il se produit vraiment. Eprouver le refus
   * sur un « bonjour » n'aurait rien prouve : un bonjour n'ecrit rien, meme
   * accepte.
   */
  await ecrire('STOP', { secret: 'ceci-nest-pas-le-bon-secret' });
  await dormir(12000);
  let { data: stops } = await sb.from('relances_stop').select('telephone').eq('boutique', SLUG);
  verifier('un secret FAUX n ecrit rien', (stops?.length ?? 0) === 0, `${stops?.length ?? 0} ligne(s)`);

  await ecrire('STOP', { secret: null });
  await dormir(12000);
  ({ data: stops } = await sb.from('relances_stop').select('telephone').eq('boutique', SLUG));
  verifier('sans en-tete, rien n ecrit non plus', (stops?.length ?? 0) === 0, `${stops?.length ?? 0} ligne(s)`);

  console.log('\n--- ce qui doit PASSER ---');

  /**
   * Un « stop » non enregistre coûte une session bannie : le client bloque et
   * signale, et c'est le signalement qui fait bannir le numero du marchand.
   */
  await ecrire('STOP');
  await dormir(15000);
  ({ data: stops } = await sb.from('relances_stop').select('telephone').eq('boutique', SLUG));
  const enregistre = verifier('avec le bon secret, le « STOP » est enregistre',
    (stops?.length ?? 0) === 1, `${stops?.length ?? 0} ligne(s)`);

  if (enregistre) {
    const attendu = ('225' + TEL.replace(/^0/, '')).slice(-8);
    const vu = String(stops[0].telephone ?? '').replace(/\D/g, '');
    verifier('il porte le numero du client, pas un autre', vu.endsWith(attendu), vu);
  }


  console.log('\n--- la commande, creee pour de vrai ---');

  /**
   * CE QUE LE MODELE DECIDE N'EST PAS EPROUVABLE. CE QU'IL DECLENCHE L'EST.
   *
   * On pourrait tenir une vraie conversation — « je veux deux articles »,
   * « oui c'est bon » — et attendre qu'une commande naisse. Ce serait un banc
   * INSTABLE : le modele peut demander l'adresse d'abord, reformuler, ou juger
   * qu'il manque une information. Un banc qui echoue une fois sur trois pour
   * une raison legitime finit par n'etre plus lance, et ne garde alors rien.
   *
   * On separe donc les deux moities :
   *
   *   - LA DECISION du modele est gardee plus haut, par le verrou de
   *     consentement : un « bonjour » ne commande rien. C'est le seul aspect de
   *     son jugement qu'on puisse figer.
   *   - LA MACHINERIE qu'il declenche est appelee ici DIRECTEMENT, exactement
   *     comme il l'appelle : meme route, meme secret, meme forme de corps.
   *     Tout ce qui suit sa decision est deterministe, et c'est la que vivent
   *     les defauts qu'on a payes.
   */
  const SYNC = env('SYNC_SECRET');
  if (!SYNC) {
    verifier('la commande est creee', false,
      'INDETERMINE — SYNC_SECRET absent, la route de creation ne peut pas etre appelee.');
    return;
  }

  const REFERENCE = `BANCA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  /**
   * LE NOM EST ECRIT SANS ACCENT, ET C'EST LE POINT.
   *
   * Le catalogue porte « Café du banc ». L'assistante recopie ce que le client
   * a tape, et un client tape rarement les accents. L'ancienne regle
   * (`toLowerCase()` seul) ne rapprochait pas les deux et enregistrait la ligne
   * a ZERO FRANC. Ce banc echouerait donc sur la version d'avant.
   */
  const creation = await fetch(`${BASE}/api/commandes/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': SYNC },
    body: JSON.stringify({
      reference: REFERENCE,
      boutique_id: UUID,
      customer_name: 'Client du banc',
      phone: TEL,
      address: 'Rue du banc, Abidjan',
      chat_id: '225' + TEL.replace(/^0/, ''),
      canal: 'whatsapp',
      // LA FORME QUE L'ASSISTANTE ENVOIE : un tableau d'objets. Le texte
      // « 2x Cafe du banc » marcherait aussi — quantite d'abord, c'est la
      // regle du parseur — mais l'outil du modele rend du JSON, et un banc
      // doit emprunter le meme chemin que ce qu'il eprouve.
      items: [{ nom: 'Cafe du banc', quantite: 2 }],
      total_price: 1000,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const corpsCreation = await creation.json().catch(() => ({}));
  const creee = verifier('la commande est acceptee', creation.status === 200,
    `HTTP ${creation.status}${corpsCreation.error ? ' — ' + corpsCreation.error : ''}`);

  if (creee) {
    verifier('elle rend un jeton de suivi', String(corpsCreation.jeton_suivi ?? '').length > 10,
      corpsCreation.jeton_suivi ? 'present' : 'ABSENT');

    const { data: enBase } = await sb
      .from('commandes')
      .select('reference, boutique_id, total, client_nom, statut')
      .eq('reference', corpsCreation.reference ?? REFERENCE)
      .maybeSingle();

    verifier('elle existe en base, chez LA BONNE boutique',
      enBase?.boutique_id === UUID, String(enBase?.boutique_id ?? 'introuvable'));

    verifier('elle porte le total annonce', Number(enBase?.total) === 1000,
      `${enBase?.total} F`);

    /**
     * LE CONTROLE QUI TIENT LE CORRECTIF DU JOUR.
     *
     * « Cafe du banc » sans accent doit retrouver « Café du banc » et son prix.
     * S'il vaut zero, c'est que l'appariement est retombe sur `?? 0` — et un
     * marchand livrerait gratuitement sans le savoir.
     */
    const { data: lignes } = await sb
      .from('commande_items')
      .select('nom_produit, quantite, prix_unitaire')
      .eq('commande_id', (await sb.from('commandes').select('id')
        .eq('reference', corpsCreation.reference ?? REFERENCE).maybeSingle()).data?.id ?? '');

    const ligne = (lignes ?? [])[0];
    verifier('l article est enregistre', Boolean(ligne), ligne?.nom_produit ?? 'aucune ligne');
    verifier('son prix vient du catalogue, PAS de zero',
      Number(ligne?.prix_unitaire) === 500, `${ligne?.prix_unitaire} F l unite`);
    verifier('sa quantite est celle demandee', Number(ligne?.quantite) === 2,
      String(ligne?.quantite));
  }

  // ---- Rien n'a debordé chez un autre marchand.
  const { count } = await sb
    .from('commandes')
    .select('reference', { count: 'exact', head: true })
    .neq('boutique_id', UUID)
    .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString());

  verifier('aucune commande creee ailleurs pendant ce banc', (count ?? 0) === 0,
    `${count ?? 0} commande(s) chez d autres marchands`);
}

// ---------------------------------------------------------------------- MAIN
console.log(`--- banc de l assistante — ${N8N} ---`);
console.log(`    boutique : ${SLUG}`);
console.log(`    tout part au salon ${SALON}, prefixe « 🧪 BANC »`);

await installer();
try {
  await derouler();
} catch (e) {
  console.error(`\n⛔ le banc s'est interrompu : ${e instanceof Error ? e.message : e}`);
  ko += 1;
} finally {
  console.log('\n--- nettoyage ---');
  await nettoyer();
  const { data } = await sb.from('boutiques').select('id').eq('id', UUID).maybeSingle();
  verifier('la boutique de banc a disparu', !data);
}

console.log();
console.log(ko === 0
  ? 'L ASSISTANTE REPOND, ET ELLE NE COMMANDE RIEN QU ON NE LUI A DEMANDE'
  : `${ko} CONTROLE(S) EN ECHEC`);
process.exit(ko === 0 ? 0 : 1);
