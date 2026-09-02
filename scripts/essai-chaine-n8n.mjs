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
  // Les fiches livreur AVANT la boutique : `livreurs.boutique_id` cascade, mais
  // `commandes.livreur_id` est en SET NULL et les commandes viennent de partir.
  await sb.from('livreurs').delete().eq('boutique_id', UUID);
  await sb.from('boutiques').delete().eq('id', UUID);

  const { data } = await sb.from('boutiques').select('id').eq('id', UUID).maybeSingle();
  verifier('la boutique de banc a disparu', !data);
}

/**
 * Le dernier identifiant d'execution de « Dispatch livreurs », ou null.
 *
 * SERT A PROUVER UN SILENCE, ce qui est plus difficile que de prouver un
 * evenement : compter TOUTES les executions ne dit rien, puisque le client est
 * prevenu dans les deux cas. Il faut regarder CE workflow-la.
 */
const DISPATCH = 'whr4BFlseHHQURZl';

/**
 * La derniere execution de « Dispatch livreurs », OU l'aveu qu'on n'a pas pu lire.
 *
 * ── POURQUOI CE RETOUR A DEUX ETATS ────────────────────────────────────────
 *
 * Elle rendait `null` sur N'IMPORTE QUEL echec — reseau coupe, delai depasse,
 * VPS qui hoquette — et l'appelant comparait bêtement `apres !== avant`. Un
 * `null` valait donc « la valeur a change », c'est-a-dire « UN LIVREUR EST
 * PARTI ».
 *
 * Le 28 aout 2026 elle a crie au loup : « 5520 -> null » sur une commande a
 * emporter, alors que `Dispatch livreurs` n'avait pas tourne — sa derniere
 * execution datait de 16:04:44 et la commande etait de 16:04:56. Le banc
 * accusait la chaine d'un defaut grave qui n'existait pas.
 *
 * UN DOUTE RENDU COMME UNE CERTITUDE est le pire defaut qu'un banc puisse
 * avoir : il use la confiance qu'on lui accorde, et le jour ou il aura raison
 * on cherchera d'abord l'erreur de mesure. C'est le meme motif que la sonde de
 * veille qui annoncait n8n injoignable sur un seul fetch rate.
 *
 * On reessaie donc — un trou passager n'est pas une reponse — puis, si la
 * lecture reste impossible, on le DIT au lieu de conclure.
 */
async function derniereExecutionDispatch() {
  const api = env('N8N_API_URL') || 'https://n8n.djiguiflow.com/api/v1';
  const clef = env('N8N_VPS_KEY') || env('N8N_API_KEY');
  if (!clef) return { lisible: false, raison: 'aucune cle n8n' };

  // Trois essais : le VPS a des coupures de quelques secondes, et conclure sur
  // la premiere serait conclure sur un hoquet.
  for (let essai = 0; essai < 3; essai += 1) {
    if (essai > 0) await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await fetch(`${api}/executions?limit=1&workflowId=${DISPATCH}`, {
        headers: { 'X-N8N-API-KEY': clef },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      return { lisible: true, id: j?.data?.[0]?.id ?? 'aucune' };
    } catch {
      // Trou passager : on retente.
    }
  }
  return { lisible: false, raison: 'n8n illisible apres trois essais' };
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

// Hisses hors du `try` : le `finally` lit la reference pour l'annoncer quand on
// conserve la boutique de banc.
let r = null;
let corps = null;
let panne = '';

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
  /**
   * LE REGISTRE DES MARCHANDS EST EN CACHE TRENTE SECONDES.
   *
   * Ce banc cree sa boutique puis commande dans la seconde : il court apres ce
   * cache. Et Vercel sert plusieurs instances, chacune avec le sien — l'appel
   * peut tomber sur une instance tiede, qui ne connait pas encore la boutique
   * et repond « Marchand introuvable ».
   *
   * CONSTATE LE 23 AOUT : trois passages consecutifs, 200, puis 404, puis 200,
   * sans qu'une ligne de code ait bouge entre eux. Un banc qui echoue au hasard
   * ne prouve rien et finit par ne plus etre lu — exactement le sort d'une
   * veille qu'on bruite. Et un banc qui REUSSIT au hasard est pire : il a
   * manque de peu de faire croire qu'un reglage n8n avait casse la chaine.
   *
   * On reessaie donc tant que la boutique n'est pas vue, jusqu'a depasser le
   * TTL. Ce n'est PAS masquer un defaut : la boutique vient d'etre creee, et le
   * cache a le droit de ne pas encore la connaitre. Seul le 404 est reessaye —
   * tout autre code s'arrete immediatement, 409 compris.
   */
  panne = '';
  const commander = () =>
    fetch(`${BASE}/api/boutiques/${SLUG}/commander`, {
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

  try {
    for (let essai = 0; essai < 9; essai++) {
      r = await commander();
      if (r.status !== 404) break;
      if (essai === 0) process.stdout.write('  ...  pas encore au registre ');
      process.stdout.write('.');
      await new Promise((attendre) => setTimeout(attendre, 5000));
    }
    if (r?.status === 404) console.log();
    corps = await r?.json().catch(() => null);
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

  /**
   * ---- QUI A LIVRE ? Le maillon que ce banc ne couvrait pas.
   *
   * Le banc s'arretait a « n8n a execute ». Il ne disait rien du RETOUR : la
   * course acceptee est-elle rattachee a une fiche de l'annuaire ? C'est
   * exactement le trou par lequel le defaut du 23 aout est passe — trois
   * compteurs faux affiches au marchand pendant des semaines, parce que
   * `commandes` n'avait aucune clef vers `livreurs`.
   *
   * ON APPELLE LA ROUTE DE PRODUCTION, avec le corps EXACT que n8n envoie
   * depuis « Refleter dans Supabase ». Ce n'est donc pas une simulation de la
   * regle : c'est la regle deployee, exercee telle quelle.
   *
   * L'IDENTIFIANT TELEGRAM EST FICTIF, ET CE N'EST PAS UN PIS-ALLER. Le depot
   * est public : y ecrire celui d'un vrai livreur en ferait une donnee
   * personnelle rattachable. Un identifiant invente exerce le meme chemin —
   * la route resout ce qu'on lui donne contre l'annuaire de LA boutique.
   */
  const secret = env('SYNC_SECRET');
  const reference = corps?.order_id;

  if (!secret) {
    console.log('\n  note  SYNC_SECRET absente : le rattachement du livreur n est pas verifie.');
  } else if (!reference) {
    console.log('\n  note  aucune reference : le rattachement du livreur n est pas verifie.');
  } else {
    console.log('\n--- qui a livre ---');

    const TG_FICTIF = `9${marque}`;
    const { data: fiche } = await sb
      .from('livreurs')
      .insert({
        boutique_id: UUID,
        nom: 'Livreur du banc',
        telephone: '0700000001',
        type: 'interne',
        statut: 'disponible',
        telegram_id: TG_FICTIF,
        rattache_le: new Date().toISOString(),
      })
      .select('id')
      .single();

    verifier('la fiche livreur du banc existe', Boolean(fiche?.id));

    const livrer = async (telegramId) =>
      fetch(`${BASE}/api/internal/commandes/livraison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
        body: JSON.stringify({
          reference,
          // EXIGEE DEPUIS LE 2 SEPTEMBRE 2026. `reference` est une cle globale :
          // sans la boutique, la route refuse en 400 plutot que de basculer la
          // commande d'un autre marchand en « livree ». Le workflow
          // « Acceptation Livraison » l'envoie de la meme facon.
          boutique: SLUG,
          statut_livraison: 'livre',
          nom_livreur: 'Livreur du banc',
          livreur_telegram_id: telegramId,
        }),
        signal: AbortSignal.timeout(20000),
      }).then((x) => x.json().catch(() => null));

    // ---- Le cas nominal : ce livreur est dans l'annuaire de CETTE boutique.
    const rep = await livrer(TG_FICTIF);
    verifier('la route annonce le rattachement', rep?.livreur_attribue === true, JSON.stringify(rep?.livreur_attribue));

    const { data: apresLivraison } = await sb
      .from('commandes')
      .select('livreur_id')
      .eq('reference', reference)
      .maybeSingle();

    verifier(
      'la commande porte la fiche du livreur',
      apresLivraison?.livreur_id === fiche?.id,
      apresLivraison?.livreur_id ?? '(vide)',
    );

    // ---- LE CAS QUI COMPTE AUTANT : un identifiant inconnu de cette boutique
    // ne doit RIEN rattacher. Un identifiant Telegram est mondial ; sans
    // cloisonnement, les courses d'un marchand tomberaient chez le livreur d'un
    // autre. Le test unitaire le prouve par mutation, celui-ci le prouve contre
    // la production.
    const repInconnu = await livrer(`0${marque}`);
    verifier("un livreur inconnu de la boutique n est pas rattache", repInconnu?.livreur_attribue === false);

    const { data: apresInconnu } = await sb
      .from('commandes')
      .select('livreur_id')
      .eq('reference', reference)
      .maybeSingle();

    verifier(
      'et il n a pas efface le rattachement precedent',
      apresInconnu?.livreur_id === fiche?.id,
      apresInconnu?.livreur_id ?? '(vide)',
    );
  }
  /**
   * ---- LA SECONDE PASSE : UNE COMMANDE A EMPORTER.
   *
   * Ce banc n'eprouvait qu'une LIVRAISON. Le retrait est arrive le 26 aout, et
   * il repose sur une promesse qu'aucun controle ne tenait : « une commande a
   * emporter ne reveille aucun livreur ».
   *
   * PROUVER UN SILENCE DEMANDE PLUS QUE PROUVER UN EVENEMENT. Compter les
   * executions n8n ne suffit pas : le client est prevenu dans les deux cas, et
   * le compteur bouge donc de toute facon. On regarde « Dispatch livreurs »
   * NOMMEMENT, avant et apres — s'il n'a pas bouge, personne n'est parti.
   *
   * La boutique passe en `les_deux` : c'est le reglage le plus exigeant, celui
   * ou la route doit choisir d'apres ce que le client demande et non d'apres ce
   * que la boutique impose.
   */
  console.log('\n--- a emporter : personne ne doit partir ---');

  await sb.from('boutiques').update({
    mode_recuperation: 'les_deux',
    delai_preparation_min: 20,
  }).eq('id', UUID);

  const dispatchAvant = await derniereExecutionDispatch();

  let rRetrait = null;
  let corpsRetrait = null;
  try {
    rRetrait = await fetch(`${BASE}/api/boutiques/${SLUG}/commander`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: 'Client qui vient chercher',
        tel: '0102030405',
        // AUCUNE ADRESSE : c'est tout l'objet du retrait, et c'est ce que la
        // route refusait avant le 26 aout.
        adresse: '',
        mode_recuperation: 'retrait',
        heure_retrait: '',
        panier: [{ id: article?.id, quantite: 1 }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    corpsRetrait = await rRetrait.json().catch(() => null);
  } catch (e) {
    panne = e instanceof Error ? e.message : 'erreur reseau';
  }

  verifier(
    'une commande a emporter est acceptee SANS adresse',
    rRetrait?.status === 200,
    panne || `HTTP ${rRetrait?.status}`,
  );
  verifier(
    'elle rend une reference',
    Boolean(corpsRetrait?.order_id),
    corpsRetrait?.order_id ?? '(aucune)',
  );

  if (corpsRetrait?.order_id) {
    const { data: enBase } = await sb
      .from('commandes')
      .select('mode_recuperation, client_adresse, frais_livraison')
      .eq('reference', corpsRetrait.order_id)
      .maybeSingle();

    verifier('elle est enregistree en retrait', enBase?.mode_recuperation === 'retrait',
      String(enBase?.mode_recuperation));
    verifier("elle n'a AUCUNE adresse", enBase?.client_adresse === '',
      JSON.stringify(enBase?.client_adresse));
    // Zero EXPLICITE, jamais NULL : « rien a encaisser » ne se confond pas avec
    // « le livreur ne s'est pas encore prononce ».
    verifier('ses frais valent zero explicite', enBase?.frais_livraison === 0,
      String(enBase?.frais_livraison));
  }

  if (dispatchAvant.lisible) {
    // On laisse a la chaine le temps de se tromper : conclure trop vite au
    // silence, c'est se feliciter d'une lenteur.
    process.stdout.write('  ...  on laisse le temps de se tromper ');
    for (let i = 0; i < 6; i++) {
      await new Promise((r2) => setTimeout(r2, 5000));
      process.stdout.write('.');
    }
    console.log();
    const dispatchApres = await derniereExecutionDispatch();

    /**
     * TROIS ISSUES, ET NON DEUX.
     *
     * « Je n'ai pas pu lire » n'est pas « un livreur est parti ». Les
     * confondre a fait accuser la chaine a tort le 28 aout ; le banc echoue
     * donc toujours quand il ne sait pas, mais en DISANT qu'il ne sait pas.
     * Un banc qui se trompe de reproche est pire qu'un banc muet : on cherche
     * le defaut la ou il n'est pas.
     */
    if (!dispatchApres.lisible) {
      verifier(
        'AUCUN LIVREUR N A ETE LANCE',
        false,
        `INDETERMINE — ${dispatchApres.raison}. Ce n'est PAS la preuve qu'un `
        + 'livreur est parti : relancez le banc, ou lisez les executions de '
        + 'Dispatch livreurs a la main.',
      );
    } else {
      const inchange = dispatchApres.id === dispatchAvant.id;
      verifier(
        'AUCUN LIVREUR N A ETE LANCE',
        inchange,
        inchange
          ? `Dispatch livreurs inchange (${dispatchAvant.id})`
          : `Dispatch livreurs a tourne : ${dispatchAvant.id} -> ${dispatchApres.id}`,
      );
    }
  } else {
    console.log(`  ...  contrôle du silence impossible — ${dispatchAvant.raison}`);
  }

  /**
   * ET LE MODE QUE LA BOUTIQUE NE PROPOSE PAS SE REFUSE.
   *
   * Le selecteur de la vitrine n'empeche rien : un onglet reste ouvert apres
   * que le marchand a change d'avis, un appel se forge.
   */
  await sb.from('boutiques').update({ mode_recuperation: 'livraison' }).eq('id', UUID);

  let rRefus = null;
  try {
    rRefus = await fetch(`${BASE}/api/boutiques/${SLUG}/commander`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: 'Client insistant',
        tel: '0102030405',
        adresse: '',
        mode_recuperation: 'retrait',
        panier: [{ id: article?.id, quantite: 1 }],
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    rRefus = null;
  }
  verifier(
    'une boutique qui ne fait que livrer refuse le retrait',
    rRefus?.status === 409,
    `HTTP ${rRefus?.status}`,
  );
} finally {
  /**
   * `--garder` laisse la boutique de banc en place.
   *
   * Utile pour la seule moitie que ce script ne peut pas couvrir seul :
   * declencher `Acceptation Livraison` dans n8n, ce que l'API publique ne
   * permet pas (`/run` repond 405). On garde alors la commande vivante, on
   * declenche le workflow a la main, puis on relance le nettoyage.
   *
   * ⚠ NE PAS OUBLIER DE NETTOYER. Une boutique de banc laissee en production
   * est deja arrivee une fois — voir le commentaire de `nettoyer()`.
   */
  if (process.argv.includes('--garder')) {
    console.log('\n--- boutique de banc CONSERVEE (--garder) ---');
    console.log(`    slug      : ${SLUG}`);
    console.log(`    uuid      : ${UUID}`);
    console.log(`    reference : ${corps?.order_id ?? '(aucune)'}`);
    console.log('    Pensez a relancer le nettoyage.');
  } else {
    console.log('\n--- nettoyage ---');
    await nettoyer();
  }
}

console.log(
  ko === 0
    ? '\nLA CHAINE VA JUSQU AU BOUT — et personne n a ete reveille'
    : `\n${ko} CONTROLE(S) EN ECHEC`,
);
process.exit(ko === 0 ? 0 : 1);
