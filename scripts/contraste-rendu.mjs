/**
 * LE CONTRASTE TEL QU'IL EST A L'ECRAN, ET NON TEL QU'IL EST ECRIT.
 *
 * ── CE QUE `contraste.mjs` NE PEUT PAS VOIR ────────────────────────────────
 *
 * Son grand frere releve les paires fond/texte ecrites dans un MEME attribut
 * `className`. C'est utile et rapide, et c'est structurellement aveugle a
 * quatre choses, qui sont justement celles qui cassent :
 *
 *   1. un fond SEMI-TRANSPARENT — `bg-accent-500/20` ne vaut pas
 *      `accent-500`, il vaut ce qu'il laisse passer de ce qu'il y a dessous ;
 *   2. une couleur HERITEE d'un ancetre lointain, jamais ecrite a cote du
 *      texte qu'elle colore ;
 *   3. un fond pose sur un AUTRE element que celui qui porte le texte ;
 *   4. un element FIXE qui survole un fond changeant.
 *
 * L'en-tete de chaque vitrine cumule les trois premiers : `text-accent-200`
 * sur `bg-accent-500/20`, le tout sur `bg-nuit-900` et un motif.
 *
 * ── CE QU'IL FAIT, ET CE QU'IL REFUSE DE FAIRE ─────────────────────────────
 *
 * Il compose les couches de fond en tenant compte de l'alpha, jusqu'a trouver
 * une couche opaque. Quand une IMAGE ou un DEGRADE s'interpose, il ne devine
 * pas : il rend `indecidable` et le compte a part. Un doute ne devient jamais
 * une certitude — le contraire ferait exactement ce qu'on reproche a l'autre
 * sonde, mais avec l'assurance d'avoir regarde.
 *
 * Usage :
 *   node scripts/contraste-rendu.mjs                    (production, ecrans publics)
 *   BASE=http://localhost:3000 node scripts/contraste-rendu.mjs
 *   AVEC_SESSION=1 node scripts/contraste-rendu.mjs      (+ le tableau de bord)
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://www.djiguiflow.com';

/** Les ecrans PUBLICS : aucun n'exige de session. */
const PAGES = ['/', '/boutiques', '/boutiques/rose-monde', '/boutiques/zahara', '/suivi'];

/**
 * LE TABLEAU DE BORD, QUE RIEN N'AVAIT JAMAIS MESURE.
 *
 * C'est l'ecran que le marchand ouvre tous les jours, et il est derriere une
 * session — donc invisible a toute sonde qui se contente des URL publiques.
 * On reutilise le compte d'essai de la suite e2e plutot que d'en fabriquer un.
 */
const PAGES_MARCHAND = [
  '/dashboard',
  '/dashboard/commandes',
  '/dashboard/ma-boutique',
  '/dashboard/products',
  '/dashboard/analytics',
];

/** `.env.local` n'est pas charge par node : on le lit, comme les autres scripts. */
const env = (() => {
  try {
    return Object.fromEntries(
      readFileSync('.env.local', 'utf8').split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
        }),
    );
  } catch {
    return {};
  }
})();

/** WCAG AA : 4,5:1 pour du texte courant, 3:1 pour du grand texte. */
const SEUIL_COURANT = 4.5;
const SEUIL_GRAND = 3;

/** En dessous, un texte n'est plus confortable sur un telephone. */
const TAILLE_MINIMALE = 12;

const mesurer = () => {
  const canal = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) =>
    0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  /**
   * ON NE PARSE PAS LA COULEUR — ON LA FAIT PEINDRE.
   *
   * La premiere version ne reconnaissait que `rgb()` / `rgba()`. Or Tailwind v4
   * et les navigateurs recents rendent en `oklab(...)`, et `getComputedStyle`
   * le rend tel quel. Resultat mesure le 3 septembre 2026 : la barre de
   * navigation, `oklab(0.19 ... / 0.9)` — un fond SOMBRE — etait ignoree, on
   * remontait jusqu'au fond clair de la page, et la sonde declarait « blanc sur
   * clair, 1.18 » un texte parfaitement lisible. DEUX FAUX POSITIFS SUR TROIS.
   *
   * Le navigateur, lui, sait convertir n'importe quel espace colorimetrique.
   * On le laisse peindre sur blanc PUIS sur noir : la difference donne l'alpha,
   * et le rendu sur noir donne la couleur. C'est exact, et ca ne connait aucun
   * format particulier — donc rien a rattraper au prochain espace de couleur.
   */
  const toile = document.createElement('canvas');
  toile.width = 1;
  toile.height = 1;
  const ctx = toile.getContext('2d', { willReadFrequently: true });

  const peindre = (couleur, fond) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = couleur;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };

  const lire = (s) => {
    const brut = String(s ?? '').trim();
    if (!brut || brut === 'none' || brut === 'transparent') return null;

    // Une valeur que le navigateur refuse laisserait `fillStyle` inchange et
    // rendrait la couleur du fond : on le detecte en essayant deux fois.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = brut;
    if (ctx.fillStyle === '#000000') {
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = brut;
      if (ctx.fillStyle === '#ffffff') return null;
    }

    const surBlanc = peindre(brut, '#ffffff');
    const surNoir = peindre(brut, '#000000');
    // c_blanc = c*a + 255(1-a) ; c_noir = c*a  →  a = 1 - (c_blanc - c_noir)/255
    const a = 1 - (surBlanc[0] - surNoir[0]) / 255;
    if (a <= 0.004) return { rgb: [0, 0, 0], a: 0 };
    return { rgb: surNoir.map((c) => Math.min(255, Math.round(c / a))), a: Math.round(a * 1000) / 1000 };
  };
  /** Une couche translucide posee sur ce qu'il y a dessous. */
  const composer = (dessus, dessous) =>
    dessus.rgb.map((c, i) => Math.round(c * dessus.a + dessous[i] * (1 - dessus.a)));

  const resultats = [];

  for (const el of document.querySelectorAll('body *')) {
    // Le texte que CET element porte lui-meme, pas celui de ses enfants.
    const propre = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!propre) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const boite = el.getBoundingClientRect();
    if (boite.width < 1 || boite.height < 1) continue;

    const texte = lire(cs.color);
    if (!texte || texte.a === 0) continue;

    // ---- Le fond effectif : on empile les couches jusqu'a l'opacite.
    let fond = null;
    let indecidable = null;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        indecidable = s.backgroundImage.slice(0, 40);
        break;
      }
      const c = lire(s.backgroundColor);
      if (!c || c.a === 0) continue;
      fond = fond === null ? { rgb: c.rgb, a: c.a } : { rgb: composer(fond, c.rgb), a: 1 };
      if (c.a === 1) { fond = { rgb: fond.rgb, a: 1 }; break; }
    }

    const taille = parseFloat(cs.fontSize);
    const gras = Number(cs.fontWeight) >= 700;
    const grand = taille >= 24 || (taille >= 18.66 && gras);

    const base = {
      texte: propre.slice(0, 60),
      taille: Math.round(taille * 10) / 10,
      balise: el.tagName.toLowerCase(),
      couleur: cs.color,
    };

    if (indecidable || !fond || fond.a < 1) {
      resultats.push({ ...base, verdict: 'indecidable', cause: indecidable || 'aucun fond opaque' });
      continue;
    }

    // Le texte lui-meme peut etre translucide.
    const couleurTexte = texte.a < 1 ? composer(texte, fond.rgb) : texte.rgb;
    const r = ratio(couleurTexte, fond.rgb);
    const seuil = grand ? SEUIL_GRAND : SEUIL_COURANT;

    resultats.push({
      ...base,
      fond: `rgb(${fond.rgb.join(', ')})`,
      ratio: Math.round(r * 100) / 100,
      seuil,
      verdict: r >= seuil ? 'ok' : 'INSUFFISANT',
    });
  }
  return resultats;
};

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } });

let insuffisants = 0;
let petits = 0;
let indecidables = 0;

let aVisiter = [...PAGES];

if (process.env.AVEC_SESSION === '1') {
  const email = process.env.E2E_EMAIL || env.E2E_EMAIL;
  const motDePasse = process.env.E2E_PASSWORD || env.E2E_PASSWORD;
  if (!email || !motDePasse) {
    console.log('AVEC_SESSION demande mais E2E_EMAIL / E2E_PASSWORD manquent — ecrans publics seuls.');
  } else {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
    /**
     * ⚠ LE NOM EXACT, ET SURTOUT PAS `.first()`.
     *
     * L'ecran porte DEUX boutons qui repondent a « se connecter » : celui de
     * Google, place plus haut dans le DOM, et celui du formulaire. Un
     * `.first()` cliquait donc sur Google et attendait une redirection qui ne
     * venait jamais — 60 s pour rien, et aucune trace de la vraie cause.
     *
     * Il est aussi `disabled` tant que React n'a pas repris la main : Playwright
     * attend cet etat de lui-meme, mais seulement si on vise le bon bouton.
     */
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 60000 });
    console.log(`session ouverte — ${PAGES_MARCHAND.length} ecran(s) marchand en plus`);
    aVisiter = [...PAGES, ...PAGES_MARCHAND];
  }
}

for (const chemin of aVisiter) {
  await page.goto(BASE + chemin, { waitUntil: 'networkidle', timeout: 60000 });
  // La vitrine est entierement 'use client' : sans cette attente, on mesure
  // une page vide et on la declare parfaite.
  await page.waitForTimeout(1500);

  const mesures = await page.evaluate(
    `(${mesurer.toString()})()`.replace('SEUIL_COURANT', SEUIL_COURANT)
      .replace('SEUIL_GRAND', SEUIL_GRAND),
  );

  const rouges = mesures.filter((m) => m.verdict === 'INSUFFISANT');
  const minus = mesures.filter((m) => m.taille < TAILLE_MINIMALE);
  const doutes = mesures.filter((m) => m.verdict === 'indecidable');

  insuffisants += rouges.length;
  petits += minus.length;
  indecidables += doutes.length;

  console.log(`\n=== ${chemin} — ${mesures.length} textes mesures ===`);
  for (const m of rouges) {
    console.log(`  CONTRASTE ${m.ratio} < ${m.seuil}  [${m.balise} ${m.taille}px]`);
    console.log(`     « ${m.texte} »  ${m.couleur} sur ${m.fond}`);
  }
  for (const m of minus) {
    console.log(`  TAILLE ${m.taille}px < ${TAILLE_MINIMALE}  [${m.balise}] « ${m.texte} »`);
  }
  if (doutes.length) {
    console.log(`  (${doutes.length} texte(s) sur fond non decidable — image ou degrade)`);
  }
  if (!rouges.length && !minus.length) console.log('  nothing to report');
}

console.log(`\n---- TOTAL : ${insuffisants} contraste(s) insuffisant(s),`
  + ` ${petits} texte(s) sous ${TAILLE_MINIMALE}px, ${indecidables} indecidable(s) ----`);

await navigateur.close();
process.exit(insuffisants > 0 ? 1 : 0);
