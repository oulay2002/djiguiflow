import type { NextConfig } from "next";
import path from "node:path";

// Origine Supabase : le navigateur doit pouvoir l'appeler (REST, Realtime,
// Storage) sans quoi la CSP couperait toute l'application.
const origineSupabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return '';
  }
})();

const origineSupabaseWs = origineSupabase.replace(/^https:/, 'wss:');

/**
 * Politique de securite du contenu — BLOQUANTE depuis le 26 aout 2026.
 *
 * La session du marchand vit dans des cookies lisibles par JavaScript :
 * l'architecture l'impose, puisque les pages interrogent Supabase depuis le
 * navigateur en s'appuyant sur RLS. Cette politique est donc LA barriere
 * contre le vol de session par XSS — et tant qu'elle etait en `Report-Only`,
 * cette barriere n'existait pas.
 *
 * ── CE QUI A DECIDE DU BASCULEMENT ─────────────────────────────────────────
 *
 * Le plan ecrit ici etait « collecter les violations reelles, puis basculer ».
 * Le collecteur a tourne : ZERO rapport en vingt-quatre heures — mais sur cinq
 * chargements de page seulement, tous les notres. Une absence sur cinq visites
 * ne prouve rien, et attendre un vrai trafic aurait repousse le basculement
 * apres l'ouverture aux marchands.
 *
 * On a donc remplace la preuve empirique, hors d'atteinte, par l'ELIMINATION
 * DES CAUSES, verifiees une par une dans le code :
 *
 *   - tout ce qui est appele a l'exterieur — Sheets, Telegram, Mistral,
 *     GeniusPay — l'est cote SERVEUR ; le navigateur ne joint que notre
 *     origine et Supabase, tous deux autorises ;
 *   - les polices viennent de `next/font`, qui les sert depuis notre domaine ;
 *   - aucune iframe, donc `frame-src 'self'` ne peut rien casser ;
 *   - aucune analytique tierce ;
 *   - les apercus d'image passent par `blob:`, deja autorise ;
 *   - le service worker est de meme origine, couvert par `worker-src`.
 *
 * ── ET C'EST MAINTENANT QUE C'EST LE MOINS RISQUE ──────────────────────────
 *
 * Aucun marchand reel n'est en production. Une politique trop stricte casserait
 * aujourd'hui l'ecran de son auteur, et dans un mois celui de quelqu'un qui
 * vend. C'est le meme raisonnement que la limite de boutiques par forfait,
 * posee le meme jour : le geste est gratuit tant qu'il ne coute a personne.
 *
 * ── LE FILET RESTE, ET IL DEVIENT UNE ALARME ───────────────────────────────
 *
 * `report-uri` et `report-to` sont CONSERVES. Une politique bloquante rapporte
 * ce qu'elle bloque : le collecteur cesse d'etre un observateur muet pour
 * devenir la sonde qui dira, en une ligne de journal, ce qui a ete refuse et ou.
 *
 * POUR REVENIR EN ARRIERE : remettre `Content-Security-Policy-Report-Only` a la
 * place de `Content-Security-Policy` dans `enTetesSecurite`. Une seule ligne.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' : Next injecte ses scripts d'hydratation en ligne. S'en
  // passer demande des nonces generes par le proxy.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${origineSupabase}`.trim(),
  "font-src 'self' data:",
  // STRIPE A ETE RETIRE DE CES DEUX DIRECTIVES. Il ne subsiste qu'une route
  // de webhook heritee, jamais appelee depuis le navigateur : verifie en
  // listant tous les domaines externes du code cote client, ou ne figurent que
  // notre propre origine et Supabase. Une autorisation qui ne sert plus est
  // une porte qu'on laisse ouverte pour personne.
  `connect-src 'self' ${origineSupabase} ${origineSupabaseWs}`.trim(),
  "frame-src 'self'",
  "form-action 'self'",
  // Le service worker est un script, mais il ne releve pas de `script-src` :
  // sans `worker-src`, la CSP le refuse une fois passee en mode bloquant.
  "worker-src 'self'",
  "manifest-src 'self'",
  // Le dashboard ne doit jamais etre encadre : c'est ce qui rend le
  // detournement de clic (clickjacking) impossible sur les navigateurs
  // recents, la ou X-Frame-Options ne couvre plus tous les cas.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  // OU LES VIOLATIONS SONT COLLECTEES.
  //
  // Elles n'allaient NULLE PART. La politique etait posee en `Report-Only`
  // avec l'intention ecrite de « collecter les violations reelles avant de
  // basculer » — mais sans `report-uri` ni `report-to`, elles partaient dans
  // la console de chaque visiteur, que personne ne lit.
  //
  // Une politique en mode rapport sans destinataire ne bloque rien ET
  // n'apprend rien : un interrupteur eteint avec un commentaire dessus. Elle
  // ne pouvait donc jamais etre basculee sur preuve.
  //
  // Les deux directives coexistent a dessein : `report-uri` est obsolete mais
  // reste la seule comprise par une partie des navigateurs, `report-to` est la
  // moderne. En omettre une, c'est perdre les rapports d'un parc entier.
  'report-uri /api/securite/csp',
  "report-to csp",
].join('; ');

const enTetesSecurite = [
  { key: 'Content-Security-Policy', value: csp },
  // Declare le groupe que `report-to` designe plus haut. Sans lui, la
  // directive moderne ne pointe vers rien.
  {
    key: 'Reporting-Endpoints',
    value: 'csp="/api/securite/csp"',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Empeche le navigateur de « deviner » un type MIME : un fichier televerse
  // par un marchand ne doit pas pouvoir etre reinterprete en HTML executable.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // 2 ans, sous-domaines inclus : le trafic marchand contient des jetons de
  // session, il ne doit jamais partir en clair.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  // Fixe la racine du workspace sur ce projet : un package-lock.json existe
  // aussi dans le dossier home (autre projet), ce qui faussait la détection.
  turbopack: {
    root: path.resolve(__dirname),
  },

  async headers() {
    return [
      { source: '/:path*', headers: enTetesSecurite },
      {
        // Le service worker se met a jour en se retelechargeant. S'il est mis
        // en cache, un correctif n'atteint jamais un marchand qui garde
        // l'application ouverte — d'ou le no-store.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
