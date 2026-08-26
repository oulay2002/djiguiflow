import { adresseAppelante, rafaleDepassee } from '@/lib/limiteur';

export const dynamic = 'force-dynamic';

/**
 * Où atterrissent les violations de la politique de sécurité du contenu.
 *
 * POURQUOI CETTE ROUTE EXISTE. La CSP était posée en `Report-Only` avec une
 * intention écrite noir sur blanc dans `next.config.ts` : « collecter les
 * violations réelles avant de basculer en mode bloquant ». Mais AUCUNE
 * directive `report-uri` ni `report-to` n'accompagnait la politique.
 *
 * Une politique en mode rapport SANS destinataire de rapport ne rapporte à
 * personne. Les violations partaient dans la console de chaque visiteur — que
 * personne ne lit, et surtout pas un client sur son téléphone à Abidjan. La
 * politique ne bloquait donc rien ET n'apprenait rien : un interrupteur éteint
 * avec un commentaire dessus.
 *
 * CE QUI EST EN JEU. La session du marchand vit dans des cookies lisibles par
 * JavaScript — l'architecture l'impose, puisque les pages interrogent Supabase
 * depuis le navigateur en s'appuyant sur RLS. La CSP est donc la vraie
 * barrière contre le vol de session par XSS. Tant qu'elle n'est pas bloquante,
 * cette barrière n'existe pas.
 *
 * ELLE NE REND JAMAIS D'ERREUR. Un navigateur qui n'arrive pas à déposer son
 * rapport réessaie, ou pire, remonte un bruit que personne n'a demandé. Ce
 * point d'entrée acquitte toujours en 204 : c'est un journal, pas une
 * transaction.
 */

/**
 * Une page qui viole la politique le fait souvent à chaque chargement. Sans
 * frein, un seul visiteur sur une page fautive remplirait le journal — et le
 * journal plein est aussi illisible que le journal vide.
 */
const RAFALE = 20;
const FENETRE_MS = 60_000;

/** Le corps d'un rapport reste petit ; au-delà, c'est autre chose qu'un rapport. */
const TAILLE_MAX = 16_384;

type Violation = {
  'document-uri'?: unknown;
  'violated-directive'?: unknown;
  'effective-directive'?: unknown;
  'blocked-uri'?: unknown;
  disposition?: unknown;
};

/** Deux formats coexistent selon les navigateurs. On lit les deux. */
function extraire(charge: unknown): Violation[] {
  if (!charge || typeof charge !== 'object') return [];

  // Ancien format : { "csp-report": { … } }
  const ancien = (charge as { 'csp-report'?: unknown })['csp-report'];
  if (ancien && typeof ancien === 'object') return [ancien as Violation];

  // Nouveau format : [ { type: "csp-violation", body: { … } }, … ]
  if (Array.isArray(charge)) {
    return charge
      .map((r) => (r && typeof r === 'object' ? (r as { body?: unknown }).body : null))
      .filter((b): b is Violation => Boolean(b) && typeof b === 'object');
  }

  return [];
}

export async function POST(req: Request) {
  // Le frein passe AVANT la lecture du corps : refuser après avoir lu coûterait
  // le travail qu'on cherche justement à éviter.
  const rafale = rafaleDepassee(`csp:${adresseAppelante(req)}`, RAFALE, FENETRE_MS);
  if (rafale.depassee) return new Response(null, { status: 204 });

  let charge: unknown = null;
  try {
    const brut = await req.text();
    if (!brut || brut.length > TAILLE_MAX) return new Response(null, { status: 204 });
    charge = JSON.parse(brut);
  } catch {
    // Un corps illisible n'apprend rien et ne mérite pas une erreur.
    return new Response(null, { status: 204 });
  }

  for (const v of extraire(charge)) {
    const directive = String(v['effective-directive'] ?? v['violated-directive'] ?? '?');
    const bloque = String(v['blocked-uri'] ?? '?');
    const page = String(v['document-uri'] ?? '?');

    // ON NE JOURNALISE QUE TROIS CHAMPS, et c'est délibéré. Un rapport complet
    // porte l'extrait de script fautif et l'URL entière — donc potentiellement
    // un jeton dans une chaîne de requête. La directive, la ressource bloquée
    // et le chemin de la page suffisent à décider si la politique est prête.
    let chemin = page;
    try {
      chemin = new URL(page).pathname;
    } catch {
      // Une URL non analysable est journalisée telle quelle, tronquée.
      chemin = page.slice(0, 120);
    }

    console.warn(
      `CSP — violation sur ${chemin} : ${directive} a bloqué ${bloque.slice(0, 120)}`,
    );
  }

  return new Response(null, { status: 204 });
}
