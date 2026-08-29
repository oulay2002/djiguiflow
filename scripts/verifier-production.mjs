/**
 * Ce que la production doit rendre — et que la CI ne regarde pas.
 *
 *   node scripts/verifier-production.mjs
 *   BASE=https://un-apercu.vercel.app node scripts/verifier-production.mjs
 *
 * POURQUOI CE SCRIPT EXISTE. Les deux bancs éprouvent la chaîne de commande :
 * `essai-multi-marchand` l'isolement, `essai-chaine-n8n` le parcours jusqu'aux
 * livreurs. Ni l'un ni l'autre ne dit quoi que ce soit du sitemap, d'un en-tête
 * de sécurité, ou d'un champ qu'une route publique aurait cessé de rendre.
 *
 * Or c'est exactement là qu'une régression passe inaperçue. Le 26 août 2026, le
 * bloc « Ce que le client doit savoir » était MORT POUR TOUT LE MONDE depuis la
 * veille : la route du registre ne renvoyait pas ces champs, et la voie qui les
 * portait n'était jamais atteinte. La CI était verte, les tests passaient, et
 * l'écran ne montrait rien. Ce contrôle est né de là.
 *
 * IL NE RELIT PAS LE CODE, IL INTERROGE LE SITE EN LIGNE. Une modification qui
 * passe la CI mais ne se voit pas en production n'est pas livrée.
 *
 * CE QU'IL VÉRIFIE EST DURABLE, pas la liste des changements d'un jour : le
 * guide doit rester indexable, la politique doit rester bloquante, ces champs
 * doivent continuer d'être rendus. Chaque ligne est une promesse qui ne doit
 * plus jamais se rompre en silence.
 *
 * Il ne touche à rien : que des lectures. Il peut donc tourner en production
 * autant de fois qu'on veut, et viser un aperçu Vercel via `BASE`.
 */

const BASE = process.env.BASE?.replace(/\/$/, '') || 'https://www.djiguiflow.com';

let ko = 0;
const verifier = (intitule, condition, detail = '') => {
  const ok = condition === true;
  if (!ok) ko++;
  console.log(`  ${ok ? 'ok  ' : 'RATE'}  ${intitule}${detail ? `  — ${detail}` : ''}`);
};

const lire = async (chemin) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { 'user-agent': 'controle-djiguiflow' } });
  return { statut: r.status, texte: await r.text(), entetes: r.headers };
};

console.log(`--- contrôle des livraisons du 26 août — ${BASE} ---\n`);

/**
 * UNE BOUTIQUE VIVANTE, CHOISIE À L'EXÉCUTION — PLUS JAMAIS UN NOM EN DUR.
 *
 * Quatre contrôles nommaient `zahara` et `rose-monde`. Ces deux boutiques sont
 * factices et seront SUPPRIMÉES à l'arrivée du premier vrai marchand : ce
 * contrôle serait alors tombé en bloc, un matin de lancement, sur des 404 qui
 * n'auraient rien dit du produit.
 *
 * On demande donc à l'annuaire public quelle boutique existe, et on éprouve
 * celle-là. Le contrôle survit au changement de catalogue, et il éprouve
 * toujours quelque chose de réel.
 *
 * S'il n'y a AUCUNE boutique, on le dit — et les contrôles qui en dépendent
 * s'annoncent indéterminés plutôt que de passer au vert sur du vide.
 */
/**
 * ON LA DEMANDE AU SITEMAP, ET C'EST LE BON ENDROIT.
 *
 * Deux tentatives ont échoué avant celle-ci, et chacune apprend quelque chose.
 *
 * `/api/marchands` rend TOUTES les boutiques, actives ou non, et ne dit ni leur
 * `slug` ni leur état. Le contrôle est donc tombé sur `atelier-temoin`, qui
 * porte `actif = false` : sa page ne publie NI type structuré NI indexation —
 * exactement le comportement voulu depuis qu'une boutique retirée ne doit plus
 * survivre dans Google. Le contrôle accusait la page ; la faute était dans le
 * choix.
 *
 * Le sitemap, lui, ne contient QUE ce qui est publiable. Demander « quelle
 * boutique le public peut-il voir » revient exactement à demander « qu'y a-t-il
 * au sitemap ». Aucune règle n'est recopiée : on lit la réponse que le site
 * donne déjà à Google.
 */
async function boutiqueVivante() {
  const { texte } = await lire('/sitemap.xml');
  const trouvees = [...texte.matchAll(/\/boutiques\/([a-z0-9-]+)</gi)].map((m) => m[1]);
  return trouvees[0] ?? null;
}

const SLUG = await boutiqueVivante();
if (!SLUG) {
  console.log('  (aucune boutique publique : les contrôles de fiche seront indéterminés)\n');
}

// ── #98 : être trouvé, et être compris pour ce qu'on vend ──────────────────
console.log('#98  attractivité');
{
  const { texte: sitemap } = await lire('/sitemap.xml');
  verifier(
    'le guide de branchement est au sitemap',
    sitemap.includes('/aide/brancher'),
    'une page d’aide hors de l’index n’aide que ceux qui ont déjà le lien',
  );

  const { texte: accueil } = await lire('/');
  const description = accueil.match(/<meta name="description" content="([^"]*)/)?.[1] ?? '';
  verifier(
    'la description est accentuée',
    description.includes('reçoit') && description.includes('reçu'),
    description.slice(0, 60) + '…',
  );

  if (SLUG) {
    const { texte: fiche } = await lire(`/boutiques/${SLUG}`);
    /**
     * CE QU'ON EPROUVE ICI, ET CE QU'ON N'EPROUVE PLUS.
     *
     * Le controle exigeait `ClothingStore`, ce qui revenait a exiger que Rose
     * Monde existe. Avec une boutique choisie a l'execution, sa categorie est
     * inconnue — et reproduire la table de correspondance ici en ferait une
     * SECONDE copie de la regle, qui finirait par diverger.
     *
     * On eprouve donc que la fiche porte SA PROPRE identite structuree : au
     * moins un `@type` qui ne soit pas l'un de ceux que TOUTES les pages
     * portent. C'est exactement ce qui avait casse le 26 aout — un bloc mort
     * pour tout le monde — et c'est verifiable sans savoir ce que vend le
     * marchand.
     *
     * La justesse de la table (mode -> ClothingStore) releve d'un test
     * unitaire, pas d'un appel reseau.
     */
    const PARTOUT = ['Organization', 'WebSite', 'BreadcrumbList', 'ListItem', 'ImageObject'];
    const types = [...fiche.matchAll(/"@type":"([A-Za-z]+)"/g)].map((m) => m[1]);
    const propres = types.filter((t) => !PARTOUT.includes(t));
    verifier(
      'la fiche d’une boutique porte sa propre identité structurée',
      propres.length > 0,
      propres.join(', ') || `aucune — seulement ${[...new Set(types)].join(', ') || 'rien'}`,
    );
  } else {
    verifier('la fiche d’une boutique se declare avec un type structuré', false,
      'INDETERMINE — aucune boutique publique a eprouver');
  }
}

// ── #108 : la politique de sécurité bloque vraiment ────────────────────────
console.log('\n#108 sécurité');
{
  const { entetes } = await lire('/');
  const bloquante = entetes.get('content-security-policy');
  const rapport = entetes.get('content-security-policy-report-only');

  verifier('la CSP est bloquante', Boolean(bloquante) && !rapport);
  verifier(
    'elle rapporte ce qu’elle bloque',
    Boolean(bloquante?.includes('report-uri')) && Boolean(entetes.get('reporting-endpoints')),
    'sans destinataire, elle n’apprend rien',
  );
  verifier(
    'Stripe n’y est plus autorisé',
    !bloquante?.includes('stripe'),
    'une autorisation qui ne sert plus est une porte ouverte pour personne',
  );
}

// ── #107 : retrait, réservation, livraison offerte ─────────────────────────
console.log('\n#107 retrait et livraison offerte');
{
  const { texte } = await lire(`/api/boutiques/${SLUG ?? 'aucune'}`);
  let fiche = {};
  try { fiche = JSON.parse(texte).fiche ?? {}; } catch { /* rendu plus bas */ }

  for (const champ of ['mode_recuperation', 'delai_preparation_min', 'livraison_offerte_des']) {
    verifier(`la fiche rend « ${champ} »`, champ in fiche, String(fiche[champ]));
  }

  // Ces trois-là avaient été livrés la veille et NE S'AFFICHAIENT POUR
  // PERSONNE : la fiche du registre ne les renvoyait pas, et la voie Supabase
  // qui les portait n'était jamais atteinte.
  for (const champ of ['delai_livraison', 'zones_livrees', 'paiements_acceptes']) {
    verifier(`« ${champ} » n’est plus mort`, champ in fiche, String(fiche[champ]).slice(0, 40));
  }
}

// ── Les pages répondent toujours ───────────────────────────────────────────
console.log('\n     les pages publiques');
const pages = ['/', '/boutiques', '/aide/brancher', '/suivi'];
if (SLUG) pages.splice(2, 0, `/boutiques/${SLUG}`);
for (const page of pages) {
  const { statut } = await lire(page);
  verifier(`${page} répond`, statut === 200, `HTTP ${statut}`);
}

// ── La route de test ne doit rien rendre en production ─────────────────────
{
  const { statut } = await lire(`/api/test-sheets?boutique_id=${SLUG ?? 'aucune'}`);
  verifier('la sonde de test reste muette en production', statut === 404, `HTTP ${statut}`);
}

console.log();
if (ko) {
  console.log(`${ko} contrôle(s) échouent.`);
  process.exit(1);
}
console.log('La production rend tout ce qu elle doit rendre.');
