/**
 * Photographie les ecrans, pour que le controle visuel cesse d'etre heroique.
 *
 * POURQUOI CE SCRIPT EXISTE. Les cinq marques qui font dire « c'est genere »
 * — l'emoji nu, le vocabulaire du premier marchand, la couleur hors palette,
 * le rayon etranger, la couleur ecrite en hexadecimal — NE SE VERIFIENT PAS AU
 * DIFF. Un composant peut etre juste dans le code et bancal a l'ecran : un fond
 * qui colle au filet, une ombre qui n'a plus de sens sans son rayon.
 *
 * Et le tableau de bord ne se photographie pas sans compte : c'est l'ecran ou
 * le marchand passe ses journees, donc celui sur lequel il juge si le produit
 * est tenu par quelqu'un, et c'est justement celui qu'on ne regardait jamais.
 *
 *   npm run dev            (dans un autre terminal)
 *   node scripts/captures-design.mjs
 *
 * Les images atterrissent dans `captures/`, ignore par git : ce sont des
 * constats dates, pas des livrables.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/+$/, '');
const DOSSIER = 'captures';

function env(nom) {
  if (process.env[nom]) return process.env[nom];
  try {
    const ligne = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

/**
 * Les ecrans a photographier.
 *
 * `session` dit s'il faut etre connecte. Les deux boutiques reelles couvrent a
 * elles deux tous les cas de bascule : l'une a choisi son emoji, l'autre porte
 * celui par defaut.
 */
const ECRANS = [
  { nom: 'accueil', chemin: '/', session: false },
  // Publiques, mais elles portent le socle partage : LienRetour (le talon),
  // classesBouton et BoutonGoogle. Elles suffisent a juger la geometrie meme
  // quand la session du marchand refuse de s'ouvrir.
  { nom: 'connexion', chemin: '/login', session: false },
  { nom: 'inscription', chemin: '/register', session: false },
  { nom: 'vitrine-zahara', chemin: '/boutiques/zahara', session: false },
  { nom: 'vitrine-rose-monde', chemin: '/boutiques/rose-monde', session: false },
  { nom: 'suivi', chemin: '/suivi', session: false },
  { nom: 'guide-brancher', chemin: '/aide/brancher', session: false },
  { nom: 'tableau-de-bord', chemin: '/dashboard', session: true },
  { nom: 'commandes', chemin: '/dashboard/commandes', session: true },
  { nom: 'produits', chemin: '/dashboard/products', session: true },
  { nom: 'ma-boutique', chemin: '/dashboard/ma-boutique', session: true },
  { nom: 'paiements', chemin: '/dashboard/paiements', session: true },
  { nom: 'onboarding', chemin: '/onboarding', session: true },
];

const email = env('E2E_EMAIL');
const motDePasse = env('E2E_PASSWORD');

mkdirSync(DOSSIER, { recursive: true });

/**
 * ON REPREND LA SESSION DEJA OUVERTE, ON N'EN OUVRE PAS UNE SECONDE.
 *
 * Ce script se connectait lui-meme, et n'y arrivait pas : le formulaire se
 * remplissait, le bouton se cliquait, et rien ne partait. `auth.setup.ts`, lui,
 * y arrive en 25 s. Reecrire un second chemin de connexion aurait ete refaire
 * le travail ET le refaire moins bien.
 *
 *   npx playwright test --project=setup     (ouvre et enregistre la session)
 *   node scripts/captures-design.mjs
 */
// Le chemin est recopie plutot qu'importe : `tests/e2e/session.ts` utilise
// `__dirname`, que Node refuse de melanger a un `await` de premier niveau dans
// un module ES. La source de verite reste ce fichier-la.
const FICHIER_SESSION = 'tests/e2e/.auth/marchand.json';

const sessionExiste = existsSync(FICHIER_SESSION)
  && JSON.parse(readFileSync(FICHIER_SESSION, 'utf8')).cookies?.length > 0;

const navigateur = await chromium.launch();
// 390 px : le marchand pilote depuis son telephone. C'est la largeur qui
// compte, pas le confort d'un ecran de bureau qu'il n'utilise pas.
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  locale: 'fr-FR',
  ...(sessionExiste ? { storageState: FICHIER_SESSION } : {}),
});
const page = await contexte.newPage();

let connecte = sessionExiste;
if (!connecte && email && motDePasse) {
  // Les memes gestes que `tests/e2e/auth.setup.ts`, qui fonctionne : on ne
  // reinvente pas des selecteurs quand le depot en a deja d'eprouves.
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
    connecte = true;
  } catch (e) {
    console.log('  connexion refusee —', e instanceof Error ? e.message.split('\n')[0] : e);
  }
}

console.log(connecte ? (sessionExiste ? 'session reprise de auth.setup.ts' : 'session marchand ouverte') : 'AUCUNE SESSION — les ecrans du marchand seront sautes');

for (const { nom, chemin, session } of ECRANS) {
  if (session && !connecte) {
    console.log(`  saute   ${nom}  (demande une session)`);
    continue;
  }
  try {
    await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle', timeout: 30_000 });
    // Les pages chargent leur contenu en JavaScript : sans cette pause, on
    // photographie un squelette et l'on conclut a tort qu'un ecran est vide.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: true });
    console.log(`  ok      ${nom}`);
  } catch (e) {
    console.log(`  ECHEC   ${nom} — ${e instanceof Error ? e.message.split('\n')[0] : e}`);
  }
}

await navigateur.close();
console.log(`\nImages dans ${DOSSIER}/`);
