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
 * Politique de securite du contenu.
 *
 * Posee en Report-Only volontairement. La session du marchand vit dans des
 * cookies lisibles par JavaScript — l'architecture l'impose, puisque les
 * pages interrogent Supabase depuis le navigateur en s'appuyant sur RLS. Une
 * CSP est donc la vraie barriere contre le vol de session par XSS, mais une
 * CSP mal calibree casse l'application en silence. Report-Only permet de
 * collecter les violations reelles avant de basculer en mode bloquant :
 * remplacer l'en-tete par `Content-Security-Policy` une fois la console
 * propre.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' : Next injecte ses scripts d'hydratation en ligne. S'en
  // passer demande des nonces generes par le proxy.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${origineSupabase}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${origineSupabase} ${origineSupabaseWs} https://api.stripe.com`.trim(),
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
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
].join('; ');

const enTetesSecurite = [
  { key: 'Content-Security-Policy-Report-Only', value: csp },
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
