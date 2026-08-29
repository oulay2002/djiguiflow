/**
 * Banc d'essai multi-marchand.
 *
 *   node scripts/essai-multi-marchand.mjs                 (production)
 *   BASE=http://localhost:3000 node scripts/essai-multi-marchand.mjs
 *
 * POURQUOI CE BANC EXISTE. Les deux fuites les plus graves du projet — les
 * reglages d'une enseigne ecrits chez sa voisine le 19 aout, le client d'un
 * marchand servi par le bot d'un autre le 20 — n'ont ete trouvees qu'en
 * FABRIQUANT UN SECOND MARCHAND A LA MAIN. Aucun test ne les couvrait, parce
 * qu'aucun test n'avait deux marchands.
 *
 * Un defaut d'isolement ne se voit jamais avec un seul locataire. Il faut donc
 * qu'en avoir deux soit ROUTINIER, pas heroique.
 *
 * CE QU'IL FAIT. Il provisionne une boutique jetable, deroule la chaine par les
 * VRAIES routes HTTP de production, verifie qu'elle ne voit rien de sa voisine
 * et que sa voisine ne voit rien d'elle — puis il supprime tout, meme s'il
 * echoue.
 *
 * IL NE REVEILLE PERSONNE. La boutique est marquee `essai` : ses commandes ne
 * declenchent pas le dispatch livreurs. Le test reste fidele la ou il compte et
 * muet la ou il derangerait.
 *
 * A LANCER AVANT TOUT DEPLOIEMENT QUI TOUCHE LA COMMANDE.
 *
 * ⚠ IL DEPEND D'UN CACHE DE TRENTE SECONDES, et c'est sa seule fragilite
 * connue. `getMarchand` garde le registre des boutiques en memoire pendant
 * `TTL = 30_000` (`src/lib/marchands.ts`). Le banc cree sa boutique puis
 * demande sa fiche dans la foulee : si le cache a ete rempli MOINS de trente
 * secondes avant, la boutique n'y est pas encore et le premier controle rend
 * 404 — puis tout le reste s'effondre.
 *
 * Contre la production le probleme ne se voit pas : chaque appel tombe souvent
 * sur une instance fraiche, au cache vide. Contre un serveur local qui vit
 * plusieurs minutes, il se voit tout de suite. Constate le 22 aout 2026 en
 * eprouvant une base restauree : un simple appel de verification, une minute
 * plus tot, avait suffi a faire echouer les 26 controles.
 *
 * Le remede est de ne pas solliciter `${BASE}` dans les trente secondes qui
 * precedent, ou de redemarrer le serveur juste avant.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = (process.env.BASE || 'https://www.djiguiflow.com').replace(/\/+$/, '');

// ---- Les cles, lues dans .env.local comme le ferait l'application.
function env(nom) {
  if (process.env[nom]) return process.env[nom];
  try {
    const fichier = readFileSync('.env.local', 'utf8');
    const ligne = fichier.split('\n').find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
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

// Un identifiant qui ne peut pas entrer en collision avec une vraie boutique,
// et qui se reconnait d'un coup d'oeil si un nettoyage echoue.
const marque = Date.now().toString(36);
const SLUG = `essai-${marque}`;
const UUID = crypto.randomUUID();
const COMPTE = crypto.randomUUID();

let ko = 0;
const resultats = [];

function verifier(titre, condition, detail = '') {
  const ok = condition === true;
  if (!ok) ko++;
  resultats.push({ ok, titre, detail });
  console.log(`  ${ok ? 'ok   ' : 'RATE '} ${titre}${detail ? `  — ${detail}` : ''}`);
  return ok;
}

async function json(chemin, options) {
  const r = await fetch(`${BASE}${chemin}`, options);
  let corps = null;
  try { corps = await r.json(); } catch { corps = null; }
  return { statut: r.status, corps };
}

// ---------------------------------------------------------------- INSTALLER
/**
 * UNE INSTALLATION QUI ECHOUE DOIT LE DIRE. Ces deux insertions ignoraient leur
 * resultat : si la boutique n'etait pas creee, le banc deroulait quand meme et
 * rendait vingt-six echecs dont aucun ne nommait la cause. On perd alors le
 * temps a chercher une regression applicative qui n'existe pas.
 *
 * Constate le 22 aout 2026 en eprouvant une base restauree : le premier
 * controle rendait 404 et rien ne distinguait « la boutique n'a pas ete creee »
 * de « la route ne la trouve pas ». C'etait la seconde, mais il a fallu le
 * prouver a la main.
 */
function exigerSucces(quoi, { error }) {
  if (!error) return;
  console.error(`\n⛔ installation impossible — ${quoi} : ${error.message}`);
  console.error('   Le banc s arrete ici : derouler sur une installation ratee ne prouve rien.');
  process.exit(1);
}

async function installer() {
  exigerSucces('la boutique d essai', await sb.from('boutiques').insert({
    id: UUID,
    user_id: COMPTE,
    slug: SLUG,
    nom: `Boutique d’essai ${marque}`,
    categorie: 'Commerce',
    zone: 'Banc de test',
    telephone: '0700000000',
    actif: false,
    // LE DRAPEAU QUI REND CE BANC SUPPORTABLE : pas de dispatch, donc pas de
    // course envoyee a de vrais livreurs, donc pas d'alerte technique a chaque
    // execution.
    essai: true,
  }));

  exigerSucces('les articles temoins', await sb.from('produits').insert([
    {
      boutique_id: UUID, nom: 'Article temoin', categorie: 'Essai',
      prix: 1000, disponible: true, stock: 5, menu_du_jour: false,
    },
    {
      boutique_id: UUID, nom: 'Article epuise', categorie: 'Essai',
      prix: 2000, disponible: true, stock: 0, menu_du_jour: false,
    },
  ]));
}

// ------------------------------------------------------------------ DEROULER
async function derouler() {
  // ---- 1. La fiche publique est la sienne.
  const fiche = await json(`/api/boutiques/${SLUG}`);
  verifier('la fiche publique repond', fiche.statut === 200, `HTTP ${fiche.statut}`);
  verifier('elle porte SON nom', String(fiche.corps?.nom || '').includes(marque));

  // ---- 2. Le menu ne rend QUE ses articles.
  //
  // C'est le controle d'isolement le plus direct : si un article d'un autre
  // marchand apparait ici, tout le reste est sans valeur.
  const menu = await json(`/api/boutiques/${SLUG}/menu`);
  // LE BANC DOIT ECHOUER, PAS EXPLOSER.
  //
  // `menu.corps` valait `(corps ?? [])`, ce qui protege du nul mais PAS d'un
  // corps qui n'est pas un tableau — une reponse d'erreur rend un objet, et
  // `.map` n'existe pas dessus. Le 29 aout 2026 le banc s'est interrompu sur
  // « (menu.corps ?? []).map is not a function », en cachant la vraie cause :
  // un 404 deux lignes plus haut. Un banc qui explose est un banc qu'on cesse
  // de lire.
  const articles = Array.isArray(menu.corps) ? menu.corps : [];
  const noms = articles.map((p) => String(p.nom));
  verifier('le menu repond', menu.statut === 200, `HTTP ${menu.statut}`);
  verifier('il rend exactement 2 articles', noms.length === 2, noms.join(', ') || '(vide)');
  verifier(
    'aucun article d’une autre boutique',
    noms.every((n) => n.startsWith('Article ')),
    noms.join(', '),
  );

  // ---- 3. Le stock voyage jusqu'a la vitrine.
  const temoin = articles.find((p) => p.nom === 'Article temoin');
  const epuise = articles.find((p) => p.nom === 'Article epuise');
  verifier('le stock est rendu', temoin?.stock === 5, `stock=${temoin?.stock}`);
  verifier('l’article epuise est a zero', epuise?.stock === 0, `stock=${epuise?.stock}`);

  // ---- 4. Un article epuise se refuse, en le NOMMANT.
  const refus = await json(`/api/boutiques/${SLUG}/commander`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom: 'Client du banc', tel: '0102030405', adresse: 'Banc de test',
      panier: [{ id: epuise?.id, quantite: 1 }],
    }),
  });
  verifier('l’epuise est refuse', refus.statut === 409, `HTTP ${refus.statut}`);
  verifier(
    'le refus nomme l’article',
    String(refus.corps?.error || '').includes('Article epuise'),
    String(refus.corps?.error || '').slice(0, 70),
  );

  // ---- 5. Une commande valide passe, et porte SON prefixe.
  const commande = await json(`/api/boutiques/${SLUG}/commander`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom: 'Client du banc', tel: '0102030405', adresse: 'Banc de test',
      panier: [{ id: temoin?.id, quantite: 2 }],
    }),
  });
  const reference = String(commande.corps?.order_id || '');
  verifier('la commande est acceptee', commande.statut === 200, `HTTP ${commande.statut}`);
  verifier('la reference derive de SON slug', reference.startsWith('ESS-'), reference);

  // ---- 6. Elle est rattachee a SA boutique, et le stock a bouge chez elle.
  const { data: ligne } = await sb
    .from('commandes')
    .select('boutique_id, total, canal')
    .eq('reference', reference)
    .maybeSingle();
  verifier('la commande est rattachee a sa boutique', ligne?.boutique_id === UUID);
  verifier('le total est juste', Number(ligne?.total) === 2000, `${ligne?.total} F`);

  const { data: apres } = await sb
    .from('produits')
    .select('stock')
    .eq('boutique_id', UUID)
    .eq('nom', 'Article temoin')
    .maybeSingle();
  verifier('le stock a ete decompte', Number(apres?.stock) === 3, `${apres?.stock} restant`);

  // ---- 6 bis. LE JETON DE SUIVI.
  //
  // Une reference de commande se devine : la base porte des compteurs
  // sequentiels et des formes batie sur le telephone du client. Le jeton est
  // ce qui prouve qu'un lien appartient bien a celui qui l'ouvre — sans lui,
  // deviner suffisait a lire l'adresse d'un client et a ANNULER sa commande.
  //
  // Ce banc le verifie par les VRAIES routes, la ou les tests unitaires
  // travaillent sur des doublures : c'est ici qu'on voit si le jeton traverse
  // reellement toute la chaine.
  const jeton = String(commande.corps?.jeton_suivi ?? '');
  verifier(
    'la commande rend un jeton de suivi',
    /^[0-9a-f]{32}$/.test(jeton),
    jeton ? `${jeton.slice(0, 8)}… (${jeton.length} caracteres)` : 'ABSENT',
  );

  const bonJeton = await json(
    `/api/suivi?ref=${encodeURIComponent(reference)}&t=${encodeURIComponent(jeton)}`,
  );
  verifier('le suivi accepte le bon jeton', bonJeton.statut === 200, `HTTP ${bonJeton.statut}`);
  verifier(
    'et rend bien CETTE commande',
    bonJeton.corps?.order_id === reference,
    String(bonJeton.corps?.order_id ?? ''),
  );

  // Le jeton ne doit jamais revenir au navigateur : le rendre reviendrait a le
  // distribuer a qui vient de le deviner.
  // `''.includes('')` vaut TOUJOURS vrai : sans la garde sur un jeton vide,
  // ce controle s'inverse et accuse une fuite là où il n'y a rien a fuir.
  // Constate au premier passage du banc.
  verifier(
    'le suivi ne renvoie JAMAIS le jeton',
    jeton ? !JSON.stringify(bonJeton.corps ?? {}).includes(jeton) : false,
    jeton ? '' : 'indecidable : aucun jeton rendu',
  );

  const fauxJeton = await json(
    `/api/suivi?ref=${encodeURIComponent(reference)}&t=${'f'.repeat(32)}`,
  );
  verifier('le suivi REFUSE un jeton faux', fauxJeton.statut === 404, `HTTP ${fauxJeton.statut}`);
  verifier(
    'et ne dit pas que la reference existe',
    !JSON.stringify(fauxJeton.corps ?? {}).includes('Client du banc'),
  );

  // PHASE 4, depuis le 22 aout 2026 : l'absence de jeton est REFUSEE. Ce
  // controle attendait 200 et disait « passera a 404 » — il a fait son travail
  // le jour de la bascule.
  //
  // La seconde preuve reste ouverte a qui tape sa reference a la main : quatre
  // chiffres du telephone, plafonnes par commande. C'est elle qui evite que la
  // phase 4 punisse le client qui a perdu son message.
  const sansJeton = await json(`/api/suivi?ref=${encodeURIComponent(reference)}`);
  verifier(
    'l’absence de jeton est REFUSEE (phase 4)',
    sansJeton.statut === 404,
    `HTTP ${sansJeton.statut}`,
  );
  verifier(
    'et le refus ne dit pas que la reference existe',
    !JSON.stringify(sansJeton.corps ?? {}).includes('Client du banc'),
  );

  // ---- 7. LE VOISIN N'A PAS BOUGE.
  //
  // Le controle d'isolement qui compte vraiment : une commande chez l'un ne
  // doit rien changer chez l'autre. C'est exactement ce qui avait ete viole.
  const { data: voisins } = await sb
    .from('commandes')
    .select('reference')
    .neq('boutique_id', UUID)
    .eq('reference', reference);
  verifier('aucune trace chez un autre marchand', (voisins ?? []).length === 0);

  // ---- 8. La pause ferme la boutique, tout de suite.
  await sb
    .from('boutiques')
    .update({ pause_jusqua: new Date(Date.now() + 3_600_000).toISOString() })
    .eq('id', UUID);

  const enPause = await json(`/api/boutiques/${SLUG}/commander`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom: 'Client du banc', tel: '0102030405', adresse: 'Banc de test',
      panier: [{ id: temoin?.id, quantite: 1 }],
    }),
  });
  verifier('la pause refuse la commande', enPause.statut === 409, `HTTP ${enPause.statut}`);

  // ---- 9. Le stock n'est pas public.
  const stock = await json(`/api/boutiques/${SLUG}/stock`);
  verifier('le stock exige le secret', stock.statut === 401, `HTTP ${stock.statut}`);

  // IL VIENT EN DERNIER, ET C'EST OBLIGATOIRE. Ce controle epuise volontairement
  // le quota de l'appelant sur cette boutique. Place plus haut, il ferait
  // repondre 429 au test de pause, qui attend un 409 — le banc accuserait alors
  // une regression qui n'existe pas.
  // ---- 10. LE FREIN DE LA PRISE DE COMMANDE.
  //
  // Cette route est publique et elle ECRIT : elle insere et decompte le stock.
  // Sans frein, une boucle vidait le stock de n'importe quel marchand.
  //
  // On envoie des paniers VIDES : le frein passe avant la lecture du corps, on
  // eprouve donc le plafond sans consommer un seul article.
  // TRENTE APPELS, ET NON SEPT. Sept n'eprouvaient que le frein par appelant,
  // celui qui compte EN MEMOIRE : en production il se disperse sur plusieurs
  // instances et le banc ne pouvait rien affirmer. Trente depassent le frein
  // PAR BOUTIQUE — vingt par dix minutes — qui vit desormais en base et vaut
  // donc pour toutes les instances a la fois.
  let refuseAu = 0;
  for (let essai = 1; essai <= 30 && refuseAu === 0; essai += 1) {
    const vide = await json(`/api/boutiques/${SLUG}/commander`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: 'Frein', tel: '0102030405', adresse: 'x', panier: [] }),
    });
    if (vide.statut === 429) refuseAu = essai;
  }
  // LE VERDICT VAUT PARTOUT DESORMAIS, et c'est ce qui a change.
  //
  // Il ne valait qu'en local tant que le frein comptait en memoire du
  // processus : Vercel repartit les appels sur plusieurs instances, et le banc
  // obtenait un refus une fois sur deux. Le frein par boutique vit maintenant
  // en base — voir `reserver_fenetre` — donc il compte pareil pour toutes les
  // instances, et le banc peut de nouveau AFFIRMER en production.
  //
  // Il n'eprouve toujours pas le plafond du JOUR, qui demanderait 300 appels :
  // il le dit plutot que de le laisser croire.
  verifier(
    'la prise de commande refuse une rafale, meme repartie',
    refuseAu > 0 && refuseAu <= 30,
    refuseAu ? `429 au ${refuseAu}e appel` : 'AUCUN REFUS EN 30 APPELS',
  );
}

// ---------------------------------------------------------------- DESINSTALLER
async function desinstaller() {
  // L'ordre suit les dependances : articles, puis commandes, puis produits,
  // puis la boutique. Un `delete` qui echoue ne doit pas empecher les suivants.
  const { data: commandes } = await sb.from('commandes').select('id').eq('boutique_id', UUID);
  const ids = (commandes ?? []).map((c) => c.id);
  if (ids.length) await sb.from('commande_items').delete().in('commande_id', ids);
  await sb.from('commandes').delete().eq('boutique_id', UUID);
  await sb.from('produits').delete().eq('boutique_id', UUID);
  await sb.from('boutiques').delete().eq('id', UUID);

  const { data: reste } = await sb.from('boutiques').select('id').eq('id', UUID).maybeSingle();
  verifier('la boutique d’essai a disparu', !reste);
}

// ---------------------------------------------------------------------- MAIN
console.log(`--- banc multi-marchand — ${BASE} ---`);
console.log(`    boutique jetable : ${SLUG}\n`);

try {
  await installer();
  await derouler();
} catch (e) {
  console.error('\n⛔ le banc s’est interrompu :', e instanceof Error ? e.message : e);
  ko++;
} finally {
  // LE NETTOYAGE PASSE, MEME APRES UN ECHEC. Une boutique d'essai oubliee
  // apparaitrait dans la vitrine publique et fausserait les statistiques.
  console.log('\n--- nettoyage ---');
  try {
    await desinstaller();
  } catch (e) {
    console.error('  ⛔ NETTOYAGE INCOMPLET —', e instanceof Error ? e.message : e);
    console.error(`     supprimer a la main la boutique ${SLUG} (${UUID})`);
    ko++;
  }
}

console.log(
  ko === 0
    ? `\n${resultats.length} CONTROLES PASSENT — l’isolement tient`
    : `\n${ko} CONTROLE(S) EN ECHEC sur ${resultats.length}`,
);
process.exit(ko === 0 ? 0 : 1);
