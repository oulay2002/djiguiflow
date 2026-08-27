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

  const { texte: fiche } = await lire('/boutiques/rose-monde');
  verifier(
    'une boutique de vêtements se déclare ClothingStore',
    fiche.includes('"@type":"ClothingStore"'),
    'Google ne fait presque rien d’un LocalBusiness',
  );
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
  const { texte } = await lire('/api/boutiques/zahara');
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
for (const page of ['/', '/boutiques', '/boutiques/zahara', '/aide/brancher', '/suivi']) {
  const { statut } = await lire(page);
  verifier(`${page} répond`, statut === 200, `HTTP ${statut}`);
}

// ── La route de test ne doit rien rendre en production ─────────────────────
{
  const { statut } = await lire('/api/test-sheets?boutique_id=zahara');
  verifier('la sonde de test reste muette en production', statut === 404, `HTTP ${statut}`);
}

console.log();
if (ko) {
  console.log(`${ko} contrôle(s) échouent.`);
  process.exit(1);
}
console.log('La production rend tout ce qu elle doit rendre.');
