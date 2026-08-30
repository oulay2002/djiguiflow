# Vidéo TikTok hebdomadaire du forfait Premium — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer chaque lundi au marchand Premium une vidéo verticale de 15 s, montée depuis ses propres photos de catalogue, prête à publier sur TikTok et en statut WhatsApp.

**Architecture:** n8n déclenche, Vercel fabrique, Supabase range. Le lundi, le workflow `Contenus Hebdo` appelle une route interne une fois par boutique Premium ; la route compose un plan de tournage à partir des données de vente, rend un MP4 avec `sharp` (mouvement), Satori (textes) et `ffmpeg` (encodage), le dépose dans un bucket `videos`, et rend son URL publique. Le message hebdomadaire porte le lien. La chaîne d'envoi n'est pas modifiée.

**Tech Stack:** TypeScript, Next.js App Router (runtime Node.js), `sharp`, `next/og` (Satori), `ffmpeg-static`, Supabase Storage, vitest, n8n.

**Spec:** [`docs/superpowers/specs/2026-08-30-video-tiktok-premium-design.md`](../specs/2026-08-30-video-tiktok-premium-design.md)

## Global Constraints

- **Rien ne peut faire échouer l'envoi hebdomadaire.** Toute panne de cette fonctionnalité dégrade en silence côté marchand — il reçoit au minimum ce qu'il reçoit aujourd'hui — mais **jamais en silence côté exploitant** : `prevenirExploitant(cle, message)` est appelée, plafonnée à 3 alertes par jour et par clé.
- **Rendu déterministe.** Aucun modèle génératif d'image ou de vidéo. Ce qui s'affiche vient de la base.
- **Rien à l'écran qui ne soit publiable.** Le bucket est public : ni chiffre d'affaires, ni panier moyen, ni volume de commandes. Le chiffre de ventes n'apparaît que si `SEUIL_QUANTITE_PUBLIABLE` (5) est atteint — même constante, même règle que le visuel fixe.
- **La voix off ne prononce jamais un nom de produit.** Uniquement des nombres, un prix, des phrases courantes. Le nom du plat reste à l'écran.
- **Comportement de référence : la vidéo muette.** Tant que la réserve de la tâche 1 n'est pas levée par l'exploitant, `VOIX_OFF_FOURNISSEUR` reste vide et aucune voix n'est produite.
- **Le forfait se lit par le compte**, jamais par un champ sur la boutique : `boutiques.user_id` → `subscriptions` → `planApplicable()`.
- **Format cible :** **1080×1920**, 24 im/s, 15 s, H.264, audio AAC mono. Tranché par la mesure du 30 août : 36,1 s et 103 Mo, contre un budget de 60 s et 1 Go.
- **Budget de rendu :** 60 s et 1 Go de mémoire par vidéo.
- **Langue du code :** identifiants et commentaires en français, sans accents dans les identifiants, comme le reste du dépôt. Tests nommés en français.
- **Commits :** un par tâche minimum, message en français, minuscule, `domaine : description`.

---

## Structure des fichiers

| Fichier | Responsabilité | Créé / modifié |
|---|---|---|
| `src/lib/contenus/video.ts` | Décide **ce qu'on montre** : les 4 prises, leur photo, leur mouvement, leur texte, leur narration. Pure, aucun effet de bord. | Créé (tâche 2) |
| `src/lib/contenus/hebdo.ts` | Ajoute `premium` au contenu et le chemin « Premium sans vente ». | Modifié (tâche 3) |
| `src/lib/conservation.ts` | Déclare la durée de conservation des vidéos. | Modifié (tâche 4) |
| `src/app/api/internal/conservation/route.ts` | Purge le bucket `videos`. | Modifié (tâche 4) |
| `src/lib/video/rendu.tsx` | Fabrique le MP4 à partir d'un plan de tournage. Ne sait rien du métier. | Créé (tâche 5) |
| `src/lib/video/voix.ts` | Synthèse vocale. Un seul appel, échecs typés. | Créé (tâche 6) |
| `src/app/api/internal/contenus/video/route.ts` | Vérifie le forfait, orchestre, range, rend l'URL, alerte. | Créé (tâche 7) |
| `src/lib/billing/plans.ts` | La ligne commerciale du Premium. | Modifié (tâche 9) |
| `scripts/mesurer-rendu-video.mjs` | Banc de mesure et d'écoute. | Créé (tâche 1) |

---

## Task 1: Lever les deux réserves — mesurer et faire écouter

Rien ne s'écrit avant. Les deux issues changent les tâches 5 et 6.

**Files:**
- Create: `scripts/mesurer-rendu-video.mjs`
- Modify: `docs/superpowers/specs/2026-08-30-video-tiktok-premium-design.md` (consigner les résultats)
- Modify: `package.json` (dépendance `ffmpeg-static`, script `mesurer:video`)

**Interfaces:**
- Consumes: rien.
- Produces: deux décisions écrites dans la spec — la résolution retenue (1080×1920 ou 720×1280), et le fournisseur de voix retenu ou `aucun`.

- [x] **Step 1: Installer le binaire d'encodage**

```bash
npm install --save ffmpeg-static
```

`ffmpeg-static` télécharge un binaire statique à l'installation et exporte son chemin en export par défaut. Pas de `fluent-ffmpeg` : on appelle le binaire par `spawn`, ce qui laisse les arguments lisibles et évite une couche de traduction.

- [x] **Step 2: Écrire le banc de mesure**

Créer `scripts/mesurer-rendu-video.mjs` :

```js
// Combien coute REELLEMENT une vidéo ? La spec fixe un budget de 60 s et 1 Go.
// Tant que ce chiffre n'existe pas, la résolution cible est une opinion.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const RESOLUTIONS = [
  { nom: '1080x1920', largeur: 1080, hauteur: 1920 },
  { nom: '720x1280', largeur: 720, hauteur: 1280 },
];
const IMAGES_PAR_SECONDE = 24;
const SECONDES = 15;

// Une photo de synthèse : on mesure l'encodage, pas le réseau.
async function photoDeTest(largeur, hauteur) {
  return sharp({
    create: { width: largeur * 2, height: hauteur * 2, channels: 3, background: '#7a5c3a' },
  }).jpeg({ quality: 90 }).toBuffer();
}

for (const r of RESOLUTIONS) {
  const dossier = await mkdtemp(join(tmpdir(), 'djigui-video-'));
  const depart = Date.now();
  const source = await photoDeTest(r.largeur, r.hauteur);
  const total = IMAGES_PAR_SECONDE * SECONDES;

  for (let i = 0; i < total; i++) {
    // Zoom lent : le recadrage se resserre image après image.
    const facteur = 1 - (i / total) * 0.15;
    const l = Math.round(r.largeur * 2 * facteur);
    const h = Math.round(r.hauteur * 2 * facteur);
    const image = await sharp(source)
      .extract({
        left: Math.round((r.largeur * 2 - l) / 2),
        top: Math.round((r.hauteur * 2 - h) / 2),
        width: l,
        height: h,
      })
      .resize(r.largeur, r.hauteur)
      .jpeg({ quality: 85 })
      .toBuffer();
    await writeFile(join(dossier, `img${String(i).padStart(4, '0')}.jpg`), image);
  }

  const apresImages = Date.now();

  await new Promise((resoudre, rejeter) => {
    const p = spawn(ffmpeg, [
      '-y', '-framerate', String(IMAGES_PAR_SECONDE),
      '-i', join(dossier, 'img%04d.jpg'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '24',
      join(dossier, 'sortie.mp4'),
    ]);
    p.on('error', rejeter);
    p.on('close', (code) => (code === 0 ? resoudre() : rejeter(new Error(`ffmpeg ${code}`))));
  });

  const fin = Date.now();
  const poids = (await stat(join(dossier, 'sortie.mp4'))).size;
  const memoire = process.memoryUsage().rss;

  console.log(
    `${r.nom.padEnd(10)} images ${String(apresImages - depart).padStart(6)} ms  `
    + `encodage ${String(fin - apresImages).padStart(6)} ms  `
    + `TOTAL ${String(fin - depart).padStart(6)} ms  `
    + `poids ${(poids / 1024 / 1024).toFixed(2)} Mo  `
    + `rss ${(memoire / 1024 / 1024).toFixed(0)} Mo  `
    + `${fin - depart <= 60000 ? 'DANS LE BUDGET' : 'HORS BUDGET'}`,
  );

  await rm(dossier, { recursive: true, force: true });
}
```

- [x] **Step 3: Ajouter le script à `package.json`**

Dans `"scripts"`, après `"essai:assistante"` :

```json
"mesurer:video": "node scripts/mesurer-rendu-video.mjs"
```

- [x] **Step 4: Mesurer** — fait le 30 août : 1080×1920 en 36 115 ms / 103 Mo, DANS LE BUDGET

Run: `npm run mesurer:video`

Attendu : deux lignes, une par résolution, chacune marquée `DANS LE BUDGET` ou `HORS BUDGET`.

**Décision :** retenir 1080×1920 si sa ligne dit `DANS LE BUDGET`, sinon 720×1280. Reporter le chiffre mesuré dans la spec, section « Les deux réserves », en remplaçant « Le temps d'encodage n'est pas mesuré » par la mesure et sa date.

- [ ] **Step 5: Produire les échantillons de voix**

Générer le **même** script avec trois voix, chez deux fournisseurs au moins. Le texte à faire lire, identique pour toutes :

```
Douze commandes cette semaine. 2500 francs, livré chez vous. Commandez sur WhatsApp.
```

Le prix est donné **en chiffres**, délibérément : les synthèses françaises lisent « 2500 » correctement, et cela évite d'écrire une conversion nombre-vers-lettres dont personne n'a besoin. Si une voix l'écorche, c'est l'issue 3 de la réserve.

Déposer les fichiers dans le répertoire de travail temporaire de la session, **hors du dépôt**, et les transmettre à l'exploitant.

- [ ] **Step 6: Faire écouter et consigner**

L'exploitant écoute et tranche. Reporter dans la spec, section « La voix off n'a pas été entendue », l'issue retenue parmi les trois qui y sont décrites, la date, et le fournisseur.

**Si l'issue est « aucune ne convient » : la tâche 6 est retirée du plan**, `VOIX_OFF_FOURNISSEUR` reste vide, et la tâche 5 produit une vidéo sans piste audio. Le reste du plan est inchangé.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/mesurer-rendu-video.mjs docs/superpowers/specs/2026-08-30-video-tiktok-premium-design.md
git commit -m "video : mesurer avant d ecrire, ecouter avant de promettre"
```

---

## Task 2: Le plan de tournage — ce qu'on montre

La pièce métier, pure et testable sans jamais encoder une image.

**Files:**
- Create: `src/lib/contenus/video.ts`
- Test: `tests/unit/plan-de-tournage.test.ts`

**Interfaces:**
- Consumes: `ContenuHebdo`, `Vedette`, `SEUIL_QUANTITE_PUBLIABLE` depuis `@/lib/contenus/hebdo`.
- Produces:
  - `type Mouvement = 'zoom-avant' | 'panoramique' | 'zoom-arriere' | 'fixe'`
  - `type PriseDeVue = { photo: string | null; mouvement: Mouvement; dureeMs: number; texte: string; narration: string | null }`
  - `type PlanDeTournage = { slug: string; nom: string; prises: PriseDeVue[]; dureeTotaleMs: number }`
  - `const PHOTOS_MINIMUM = 2`
  - `function planDeTournage(contenu: ContenuHebdo): PlanDeTournage | null`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/unit/plan-de-tournage.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { planDeTournage, PHOTOS_MINIMUM } from '@/lib/contenus/video';
import type { ContenuHebdo, Vedette } from '@/lib/contenus/hebdo';

/**
 * « Ce qu'on montre, et ce qu'on ne dit jamais. »
 *
 * DEUX RISQUES OPPOSES. Trop permissif, on livre au marchand un diaporama de
 * cartes de texte qu'il ne publiera pas, ou une voix qui ecorche le nom de son
 * plat devant sa clientele. Trop strict, le Premium ne recoit rien et paie
 * 25 000 F pour un compteur.
 */

const vedette = (n: Partial<Vedette> = {}): Vedette => ({
  nom: 'Attieke poisson',
  prix: 2500,
  quantite: 12,
  photo: 'https://exemple.test/1.webp',
  ...n,
});

const contenu = (v: Vedette[], extra: Partial<ContenuHebdo> = {}): ContenuHebdo =>
  ({
    slug: 'zahara', nom: 'Zahara', vedettes: v, note: null, avis: 0,
    mentionNote: null, lien: 'https://exemple.test/zahara', photoVedette: null,
    vide: false, legende: '', hashtags: '', scriptTikTok: '', statutWhatsApp: '',
    urlVisuel: '', premium: true, ...extra,
  }) as ContenuHebdo;

describe('quand aucune video ne doit etre produite', () => {
  it('MOINS DE DEUX PHOTOS : un diaporama de cartes de texte n est pas publiable', () => {
    const plan = planDeTournage(contenu([vedette(), vedette({ photo: null })]));
    expect(plan).toBeNull();
  });

  it('aucune vedette du tout', () => {
    expect(planDeTournage(contenu([]))).toBeNull();
  });

  it('le seuil est bien de deux photos, pas d une', () => {
    expect(PHOTOS_MINIMUM).toBe(2);
  });
});

describe('le plan produit', () => {
  const plan = planDeTournage(
    contenu([
      vedette({ nom: 'Attieke poisson', photo: 'https://exemple.test/a.webp' }),
      vedette({ nom: 'Garba', photo: 'https://exemple.test/b.webp' }),
      vedette({ nom: 'Alloco', photo: 'https://exemple.test/c.webp' }),
    ]),
  )!;

  it('compte quatre prises', () => {
    expect(plan.prises).toHaveLength(4);
  });

  it('dure quinze secondes', () => {
    expect(plan.dureeTotaleMs).toBe(15000);
  });

  it('la derniere prise est la carte de marque, sans photo', () => {
    expect(plan.prises[3].photo).toBeNull();
    expect(plan.prises[3].texte).toContain('Zahara');
  });

  it('AUCUNE NARRATION NE CONTIENT UN NOM DE PRODUIT', () => {
    const dit = plan.prises.map((p) => p.narration ?? '').join(' ').toLowerCase();
    for (const nom of ['attieke', 'garba', 'alloco']) {
      expect(dit).not.toContain(nom);
    }
  });

  it('le prix est donne en chiffres a la voix, pas en lettres', () => {
    expect(plan.prises[1].narration).toContain('2500');
  });
});

describe('le chiffre de ventes ne parait qu au dessus du seuil', () => {
  const photos = [
    vedette({ photo: 'https://exemple.test/a.webp' }),
    vedette({ photo: 'https://exemple.test/b.webp' }),
  ];

  it('au dessus du seuil, il est ecrit ET dit', () => {
    const plan = planDeTournage(contenu(photos.map((p) => ({ ...p, quantite: 12 }))))!;
    expect(plan.prises[0].texte).toContain('12');
    expect(plan.prises[0].narration).toContain('12');
  });

  it('SOUS LE SEUIL, IL N EST NI ECRIT NI DIT', () => {
    const plan = planDeTournage(contenu(photos.map((p) => ({ ...p, quantite: 2 }))))!;
    expect(plan.prises[0].texte).not.toContain('2 fois');
    expect(plan.prises[0].narration).toBeNull();
  });
});

describe('deux photos seulement', () => {
  it('la troisieme prise reprend la premiere photo sous un autre cadrage', () => {
    const plan = planDeTournage(
      contenu([
        vedette({ photo: 'https://exemple.test/a.webp' }),
        vedette({ photo: 'https://exemple.test/b.webp' }),
      ]),
    )!;
    expect(plan.prises[2].photo).toBe('https://exemple.test/a.webp');
    expect(plan.prises[2].mouvement).not.toBe(plan.prises[0].mouvement);
  });
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run tests/unit/plan-de-tournage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/contenus/video'`

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/lib/contenus/video.ts` :

```ts
import { SEUIL_QUANTITE_PUBLIABLE, type ContenuHebdo } from '@/lib/contenus/hebdo';

/**
 * Ce qu'on montre pendant quinze secondes, et ce qu'on en dit.
 *
 * PURE, ET C'EST LE POINT. Ce fichier repond a « quoi montrer » ;
 * `@/lib/video/rendu` repond a « comment le fabriquer ». On teste le premier
 * sans jamais encoder une image, et on peut changer d'encodeur sans toucher au
 * metier.
 */

export type Mouvement = 'zoom-avant' | 'panoramique' | 'zoom-arriere' | 'fixe';

export type PriseDeVue = {
  /** Photo a animer, ou `null` pour la carte de marque finale. */
  photo: string | null;
  mouvement: Mouvement;
  dureeMs: number;
  /** Texte incruste, deja mis en forme. */
  texte: string;
  /**
   * Ce que la voix dit pendant cette prise, ou `null` si elle se tait.
   *
   * ELLE NE PRONONCE JAMAIS UN NOM DE PRODUIT. Une synthese francaise lit
   * « attieke », « garba », « alloco » avec un accent metropolitain et les
   * ecorche souvent : devant un public abidjanais, cela s'entend
   * immediatement. Le nom du plat reste a l'ecran, ou il est deja juste.
   */
  narration: string | null;
};

export type PlanDeTournage = {
  slug: string;
  nom: string;
  prises: PriseDeVue[];
  dureeTotaleMs: number;
};

const DUREE_PLAN_MS = 4000;
const DUREE_CARTE_MS = 3000;

/**
 * En dessous, aucune video.
 *
 * Un diaporama de cartes de texte n'est pas publiable : mieux vaut ne rien
 * livrer que livrer ca. Le marchand garde son visuel fixe et son script.
 */
export const PHOTOS_MINIMUM = 2;

const fcfa = (n: number) => `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

export function planDeTournage(contenu: ContenuHebdo): PlanDeTournage | null {
  const photos = contenu.vedettes
    .map((v) => v.photo)
    .filter((p): p is string => Boolean(p && p.trim()));

  if (photos.length < PHOTOS_MINIMUM) return null;

  const meilleure = contenu.vedettes.find((v) => v.photo) ?? contenu.vedettes[0];
  if (!meilleure) return null;

  const chiffrable = meilleure.quantite >= SEUIL_QUANTITE_PUBLIABLE;

  const prises: PriseDeVue[] = [
    {
      photo: photos[0],
      mouvement: 'zoom-avant',
      dureeMs: DUREE_PLAN_MS,
      texte: chiffrable
        ? `${meilleure.nom}\n${meilleure.quantite} fois commandé cette semaine`
        : meilleure.nom,
      // Sous le seuil, la voix se tait plutot que d'annoncer un chiffre qu'on
      // ne publie pas a l'ecran. Deux canaux, une seule regle.
      narration: chiffrable ? `${meilleure.quantite} commandes cette semaine.` : null,
    },
    {
      photo: photos[1],
      mouvement: 'panoramique',
      dureeMs: DUREE_PLAN_MS,
      texte: meilleure.prix !== null ? fcfa(meilleure.prix) : 'Voir les prix',
      // Le prix est donne EN CHIFFRES : les syntheses francaises lisent « 2500 »
      // correctement, ce qui evite d'ecrire une conversion nombre-vers-lettres.
      narration: meilleure.prix !== null ? `${meilleure.prix} francs.` : null,
    },
    {
      // Avec deux photos seulement, on reprend la premiere sous un autre
      // cadrage : le mouvement differe, donc l'oeil ne voit pas une repetition.
      photo: photos[2] ?? photos[0],
      mouvement: 'zoom-arriere',
      dureeMs: DUREE_PLAN_MS,
      texte: 'Livré chez vous',
      narration: 'Livré chez vous.',
    },
    {
      photo: null,
      mouvement: 'fixe',
      dureeMs: DUREE_CARTE_MS,
      texte: `${contenu.nom}\nCommandez sur WhatsApp`,
      narration: 'Commandez sur WhatsApp.',
    },
  ];

  return {
    slug: contenu.slug,
    nom: contenu.nom,
    prises,
    dureeTotaleMs: prises.reduce((t, p) => t + p.dureeMs, 0),
  };
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run tests/unit/plan-de-tournage.test.ts`
Expected: PASS — 11 tests.

Note : le test référence `premium: true` sur `ContenuHebdo`, champ ajouté à la tâche 3. Le cast `as ContenuHebdo` du fabricant de test le tolère d'ici là ; le retirer à la fin de la tâche 3.

- [ ] **Step 5: Éprouver le garde par mutation**

Remplacer temporairement `if (photos.length < PHOTOS_MINIMUM) return null;` par `if (false) return null;`.

Run: `npx vitest run tests/unit/plan-de-tournage.test.ts`
Expected: **FAIL** sur « MOINS DE DEUX PHOTOS ». Un garde qu'on n'a jamais vu rouge ne protège de rien.

Rétablir la ligne, relancer, vérifier le vert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contenus/video.ts tests/unit/plan-de-tournage.test.ts
git commit -m "video : le plan de tournage, et la voix qui ne nomme jamais le plat"
```

---

## Task 3: `hebdo.ts` — le drapeau Premium et la semaine sans vente

**Files:**
- Modify: `src/lib/contenus/hebdo.ts`
- Test: `tests/unit/contenus-premium.test.ts`

**Interfaces:**
- Consumes: `planApplicable` depuis `@/lib/billing/acces`.
- Produces: `ContenuHebdo.premium: boolean` et `ContenuHebdo.vide` désormais réellement utilisé.

**Pourquoi :** n8n ne peut pas savoir qui est Premium — le forfait vit dans `subscriptions`, qu'il n'interroge pas. Et sans message hebdomadaire, la vidéo n'a nulle part où voyager : `contenusHebdo` n'émet aujourd'hui rien pour une boutique sans vente.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/unit/contenus-premium.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { ContenuHebdo } from '@/lib/contenus/hebdo';

/**
 * « Le Premium sans vente doit recevoir quelque chose. »
 *
 * Le silence dirait deux choses a la fois — « vous n'avez rien vendu » et « la
 * plateforme est morte » — et le marchand ne peut pas les distinguer. C'est le
 * defaut qui a produit cinq nuits de rapports quotidiens muets.
 *
 * MAIS SEULEMENT LE PREMIUM. Envoyer un post vide a un Essai ou a un Pro leur
 * rappellerait chaque lundi qu'ils n'ont rien vendu, sans rien leur offrir en
 * echange : c'est la regle d'origine, et elle reste juste pour eux.
 */

const type = (c: ContenuHebdo) => c;

describe('la forme du contenu', () => {
  it('porte un drapeau premium, car n8n ne peut pas le deduire', () => {
    const c = type({
      slug: 'x', nom: 'X', vedettes: [], note: null, avis: 0, mentionNote: null,
      lien: '', photoVedette: null, vide: true, legende: '', hashtags: '',
      scriptTikTok: '', statutWhatsApp: '', urlVisuel: '', premium: true,
    });
    expect(c.premium).toBe(true);
  });

  it('vide vaut vrai quand la semaine n a produit aucune vente', () => {
    const c = type({
      slug: 'x', nom: 'X', vedettes: [], note: null, avis: 0, mentionNote: null,
      lien: '', photoVedette: null, vide: true, legende: '', hashtags: '',
      scriptTikTok: '', statutWhatsApp: '', urlVisuel: '', premium: true,
    });
    expect(c.vide).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/unit/contenus-premium.test.ts`
Expected: FAIL — `Object literal may only specify known properties, 'premium' does not exist in type 'ContenuHebdo'`

- [ ] **Step 3: Ajouter le champ au type**

Dans `src/lib/contenus/hebdo.ts`, à la fin du type `ContenuHebdo`, après `urlVisuel: string;` :

```ts
  /**
   * Le compte proprietaire est-il Premium ?
   *
   * CALCULE ICI, PAS DANS n8n. Le forfait vit dans `subscriptions`, que n8n
   * n'interroge pas — et il est porte par le COMPTE, pas par la boutique : un
   * Premium peut en tenir plusieurs. Le workflow ne fait que lire ce drapeau.
   */
  premium: boolean;
```

- [ ] **Step 4: Élargir la lecture des boutiques**

⚠️ La requête actuelle, ligne ~299, ne lit **ni `nom`, ni `user_id`, ni `actif`** :

```ts
  const { data: boutiques } = await sb.from('boutiques').select('id, slug, zone');
```

La remplacer par :

```ts
  const { data: boutiques } = await sb
    .from('boutiques')
    .select('id, slug, zone, nom, user_id, actif');
```

- [ ] **Step 5: Lire le forfait par compte**

Ajouter l'import en tête de fichier :

```ts
import { planApplicable } from '@/lib/billing/acces';
```

Puis, après la lecture des boutiques :

```ts
  // Le forfait applicable, par COMPTE. `planApplicable` refuse un abonnement
  // echu ou suspendu : lire `plan_key` seul reviendrait a croire sur parole une
  // ligne que plus rien ne revoque.
  const { data: abonnements } = await sb
    .from('subscriptions')
    .select('user_id, plan_key, current_period_start, current_period_end, status');

  const planParCompte = new Map<string, string>();
  for (const a of abonnements ?? []) {
    planParCompte.set(String(a.user_id), planApplicable(a));
  }

  const estPremium = (b: { user_id?: unknown }) =>
    planParCompte.get(String(b.user_id ?? '')) === 'premium';
```

- [ ] **Step 6: Renseigner le drapeau sur le chemin des ventes**

Dans `composer`, ajouter un sixième paramètre `premium: boolean` et le porter dans l'objet rendu, à côté de `vide: false`. À l'appel, ligne ~336, passer `estPremium(...)` en retrouvant la boutique par son slug.

- [ ] **Step 7: Ouvrir le chemin « Premium sans vente »**

À la fin de `contenusHebdo`, avant `return sorties;` :

```ts
  /**
   * LE PREMIUM SANS VENTE RECOIT QUAND MEME.
   *
   * Sans message, la video n'a nulle part ou voyager — et le marchand qui n'a
   * rien vendu est justement celui qui en a le plus besoin. Le contenu se batit
   * alors sur le catalogue au lieu des ventes.
   *
   * Essai et Pro restent absents, comme depuis l'origine : leur envoyer un post
   * vide leur rappellerait chaque lundi qu'ils n'ont rien vendu.
   *
   * ON REUTILISE `composer` PLUTOT QUE DE RECOPIER SA LOGIQUE : une regle
   * recopiee est une regle qui divergera, et c'est deja ce qui avait fait
   * afficher au visuel une note que le texte taisait.
   */
  const dejaServies = new Set(sorties.map((c) => c.slug));

  for (const b of boutiques ?? []) {
    const slug = String(b.slug ?? '').trim();
    if (!slug || dejaServies.has(slug)) continue;

    // Une boutique retiree de l'annuaire ne recoit rien. « Atelier Temoin » est
    // un compte d'essai desactive qui porte un numero composable : sans cette
    // ligne, chaque lundi calme aurait ecrit a un inconnu.
    if (b.actif === false) continue;
    if (!estPremium(b)) continue;

    const catalogue = catalogueParBoutique.get(String(b.id));
    if (!catalogue || catalogue.size === 0) continue;

    // Aucune vente cette semaine : `quantite: 0` passe sous
    // SEUIL_QUANTITE_PUBLIABLE, ce qui fait taire le chiffre PARTOUT a la fois
    // — texte, visuel, video et voix off.
    const plats = [...catalogue.keys()].slice(0, 3).map((produit) => ({
      slug, produit, quantite: 0,
    }));

    const contenu = composer(
      { slug, boutique_nom: String(b.nom ?? slug), avis: 0 },
      plats,
      catalogue,
      baseUrl,
      String(b.zone ?? ''),
      true,
    );

    if (contenu) sorties.push({ ...contenu, vide: true });
  }
```

- [ ] **Step 8: Exporter `indexSemaine`**

La tâche 7 en a besoin pour un chemin de dépôt idempotent. Passer `function indexSemaine()` (ligne ~101) en `export function indexSemaine()`. Ne pas réécrire de calcul de semaine ailleurs : une date recalculée à la main est une date qui divergera.

- [ ] **Step 9: Lancer la suite complète**

Run: `npm test`
Expected: PASS. Retirer le cast `as ContenuHebdo` de `tests/unit/plan-de-tournage.test.ts` — le champ existe désormais.

- [ ] **Step 10: Éprouver par mutation**

Remplacer `if (planParCompte.get(String(b.user_id)) !== 'premium') continue;` par `if (false) continue;`.

Run: `npm test`
Expected: **FAIL** — un test doit constater qu'un Pro sans vente reçoit un contenu. Si aucun ne tombe, **ce test manque** : l'ajouter avant de continuer.

Rétablir, relancer, vérifier le vert.

- [ ] **Step 11: Commit**

```bash
git add src/lib/contenus/hebdo.ts tests/unit/contenus-premium.test.ts tests/unit/plan-de-tournage.test.ts
git commit -m "contenus : un drapeau premium, et le lundi de celui qui n a rien vendu"
```

---

## Task 4: Le bucket `videos` et sa purge

**Files:**
- Create: `supabase/migrations/<horodatage>_bucket_videos.sql`
- Modify: `src/lib/conservation.ts`
- Modify: `src/app/api/internal/conservation/route.ts`
- Test: `tests/unit/conservation-videos.test.ts`

**Interfaces:**
- Produces: `JOURS_VIDEO_HEBDO = 90` exporté depuis `@/lib/conservation`.

**Contrainte mesurée :** le bucket `images` refuse le MP4 — ses `allowed_mime_types` s'arrêtent à `image/*`. Il faut un bucket distinct.

- [ ] **Step 1: Créer le bucket par migration**

⚠️ `apply_migration` n'écrit **aucun fichier** dans le dépôt et s'attribue son propre horodatage. Appliquer la migration, puis **relire l'horodatage réellement attribué** et nommer le fichier du dépôt à l'identique, sans quoi dépôt et base divergent.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 20971520, array['video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 2: Écrire le test de conservation**

Créer `tests/unit/conservation-videos.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { JOURS_VIDEO_HEBDO } from '@/lib/conservation';

describe('la conservation des videos hebdomadaires', () => {
  it('dure quatre-vingt-dix jours', () => {
    expect(JOURS_VIDEO_HEBDO).toBe(90);
  });

  it('N EST PAS ILLIMITEE : un MP4 par boutique et par semaine s accumule sans fin', () => {
    expect(Number.isFinite(JOURS_VIDEO_HEBDO)).toBe(true);
    expect(JOURS_VIDEO_HEBDO).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Lancer pour voir échouer**

Run: `npx vitest run tests/unit/conservation-videos.test.ts`
Expected: FAIL — `JOURS_VIDEO_HEBDO` n'est pas exporté.

- [ ] **Step 4: Déclarer la durée**

Dans `src/lib/conservation.ts`, après `JOURS_TRACE_RELANCE` :

```ts
/**
 * Les videos hebdomadaires du Premium.
 *
 * Un MP4 par boutique et par semaine s'accumule sans fin. Quatre-vingt-dix
 * jours laissent au marchand le temps de republier une ancienne video, et
 * bornent le stockage a une douzaine de fichiers par boutique.
 *
 * Elles ne contiennent aucune donnee personnelle : ce que le marchand vend, a
 * quel prix. La duree est une regle de menage, pas une regle de protection.
 */
export const JOURS_VIDEO_HEBDO = 90;
```

- [ ] **Step 5: Purger le bucket dans la tâche nocturne**

Dans `src/app/api/internal/conservation/route.ts`, ajouter une étape à la suite des autres :

```ts
  // Les videos hebdomadaires. Le chemin porte l'uuid de la boutique puis la
  // semaine ISO : `list` par boutique, et on supprime au-dela de l'age.
  {
    const limite = Date.now() - JOURS_VIDEO_HEBDO * 24 * 3600 * 1000;
    const { data: dossiers, error } = await sb.storage.from('videos').list('', { limit: 1000 });

    if (error) {
      console.error('Conservation — videos illisibles :', error.message);
    } else {
      for (const d of dossiers ?? []) {
        const { data: fichiers } = await sb.storage.from('videos').list(d.name, { limit: 1000 });
        const perimes = (fichiers ?? [])
          .filter((f) => new Date(f.created_at ?? 0).getTime() < limite)
          .map((f) => `${d.name}/${f.name}`);

        if (!perimes.length) continue;
        if (essai) { bilan.videosASupprimer = (bilan.videosASupprimer ?? 0) + perimes.length; continue; }

        const { error: errSuppr } = await sb.storage.from('videos').remove(perimes);
        if (errSuppr) console.error('Conservation — suppression video impossible :', errSuppr.message);
        else bilan.videosSupprimees = (bilan.videosSupprimees ?? 0) + perimes.length;
      }
    }
  }
```

Ajouter `JOURS_VIDEO_HEBDO` à l'import depuis `@/lib/conservation`.

- [ ] **Step 6: Lancer et vérifier à blanc**

Run: `npm test`
Expected: PASS.

Puis appeler la route en mode essai (`{ "essai": true }`) avec le secret partagé et vérifier que `videosASupprimer` apparaît au bilan sans qu'aucun fichier ne disparaisse.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations src/lib/conservation.ts src/app/api/internal/conservation/route.ts tests/unit/conservation-videos.test.ts
git commit -m "video : un bucket a part, et la purge posee le meme jour"
```

---

## Task 5: `rendu.tsx` — l'image qui bouge

**Files:**
- Create: `src/lib/video/rendu.tsx` — **extension `.tsx`**, le fichier contient du JSX, comme `visuel/route.tsx`
- Create: `scripts/essai-rendu-video.mjs`
- Modify: `next.config.ts` (inclusion du binaire dans le paquet de fonction)

**Interfaces:**
- Consumes: `PlanDeTournage`, `PriseDeVue` depuis `@/lib/contenus/video`.
- Produces:
  - `type Rendu = { donnees: Buffer; octets: number; largeur: number; hauteur: number; dureeMs: number; muette: boolean }`
  - `async function rendreVideo(plan: PlanDeTournage, voix: Buffer | null): Promise<Rendu>`

Résolution retenue à la tâche 1 : **1080×1920**.

- [ ] **Step 1: Inclure le binaire dans le paquet de fonction**

Vercel élague ce que le traçage ne voit pas, et `ffmpeg-static` expose un chemin calculé à l'exécution : le binaire serait absent en production alors qu'il fonctionne en local. Dans `next.config.ts` :

```ts
  outputFileTracingIncludes: {
    '/api/internal/contenus/video': ['./node_modules/ffmpeg-static/**'],
  },
```

- [ ] **Step 2: Écrire le rendu**

Créer `src/lib/video/rendu.tsx` :

```ts
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import type { PlanDeTournage, PriseDeVue } from '@/lib/contenus/video';

/**
 * Fabrique le MP4. NE SAIT RIEN DU METIER.
 *
 * Le mouvement n'est pas un effet : un zoom lent est une suite de recadrages
 * progressifs, que `sharp` fait nativement. Le texte est rendu UNE FOIS PAR
 * PRISE en PNG transparent, puis compose sur chaque image — quatre rendus de
 * texte, pas trois cent soixante.
 */

export const LARGEUR = 1080;
export const HAUTEUR = 1920;
const IPS = 24;

const NUIT = '#131c3d';
const CHAUX = '#f8f7f3';

export type Rendu = {
  donnees: Buffer;
  octets: number;
  largeur: number;
  hauteur: number;
  dureeMs: number;
  muette: boolean;
};

/**
 * La photo, chargee par nous et non par le rendu.
 *
 * Meme raison que pour le visuel fixe : une URL qui ne repond pas ferait
 * echouer TOUT le rendu. On la charge avec un delai court, et une prise sans
 * photo se rabat sur un fond uni plutot que de perdre la video entiere.
 */
async function chargerPhoto(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const octets = Buffer.from(await r.arrayBuffer());
    return octets.length > 8 * 1024 * 1024 ? null : octets;
  } catch {
    return null;
  }
}

/** Le texte de la prise, en PNG transparent, rendu une seule fois. */
async function calqueTexte(prise: PriseDeVue): Promise<Buffer> {
  const image = new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        width: LARGEUR, height: HAUTEUR, padding: 72,
        background: prise.photo ? 'linear-gradient(transparent 55%, rgba(19,28,61,0.88))' : NUIT,
      }}>
        {prise.texte.split('\n').map((ligne, i) => (
          <div key={i} style={{
            display: 'flex', color: CHAUX, fontSize: i === 0 ? 72 : 56,
            fontWeight: i === 0 ? 700 : 500, lineHeight: 1.15, marginTop: i ? 16 : 0,
          }}>{ligne}</div>
        ))}
      </div>
    ),
    { width: LARGEUR, height: HAUTEUR },
  );
  return Buffer.from(await image.arrayBuffer());
}

/** Le recadrage de l'image `i` sur `total`, selon le mouvement demande. */
function cadrage(mouvement: PriseDeVue['mouvement'], i: number, total: number, l: number, h: number) {
  const t = total <= 1 ? 0 : i / (total - 1);
  const AMPLEUR = 0.14;

  if (mouvement === 'zoom-avant') {
    const f = 1 - t * AMPLEUR;
    return { width: Math.round(l * f), height: Math.round(h * f), left: Math.round((l - l * f) / 2), top: Math.round((h - h * f) / 2) };
  }
  if (mouvement === 'zoom-arriere') {
    const f = 1 - AMPLEUR + t * AMPLEUR;
    return { width: Math.round(l * f), height: Math.round(h * f), left: Math.round((l - l * f) / 2), top: Math.round((h - h * f) / 2) };
  }
  if (mouvement === 'panoramique') {
    const f = 1 - AMPLEUR;
    return { width: Math.round(l * f), height: Math.round(h * f), left: Math.round((l - l * f) * t), top: Math.round((h - h * f) / 2) };
  }
  return { width: l, height: h, left: 0, top: 0 };
}

export async function rendreVideo(plan: PlanDeTournage, voix: Buffer | null): Promise<Rendu> {
  const dossier = await mkdtemp(join(tmpdir(), 'djigui-video-'));

  try {
    let numero = 0;

    for (const prise of plan.prises) {
      const calque = await calqueTexte(prise);
      const brute = prise.photo ? await chargerPhoto(prise.photo) : null;

      /**
       * LE FOND EST AU DOUBLE DU FORMAT, ET DECODE UNE SEULE FOIS.
       *
       * Au double, parce que le mouvement recadre DANS l'image : sans cette
       * marge, un zoom avant agrandirait des pixels et le plan perdrait en
       * nettete a mesure qu'il avance.
       *
       * Decode une seule fois, parce que rappeler `sharp(jpeg)` a chaque image
       * refait le decodage : mesure du 30 aout, 76 ms par image, soit
       * l'essentiel des 27 s du banc. En pixels bruts, le recadrage ne coute
       * presque plus rien.
       */
      const source = brute
        ? sharp(brute).resize(LARGEUR * 2, HAUTEUR * 2, { fit: 'cover' })
        : sharp({ create: { width: LARGEUR * 2, height: HAUTEUR * 2, channels: 3, background: NUIT } });

      const { data: pixels, info } = await source.raw().toBuffer({ resolveWithObject: true });
      const cru = { raw: { width: info.width, height: info.height, channels: info.channels } };

      const total = Math.round((prise.dureeMs / 1000) * IPS);

      for (let i = 0; i < total; i++) {
        const c = cadrage(prise.photo ? prise.mouvement : 'fixe', i, total, info.width, info.height);
        const image = await sharp(pixels, cru)
          .extract(c)
          .resize(LARGEUR, HAUTEUR)
          .composite([{ input: calque, top: 0, left: 0 }])
          .jpeg({ quality: 85 })
          .toBuffer();
        await writeFile(join(dossier, `img${String(numero++).padStart(5, '0')}.jpg`), image);
      }
    }

    const cheminVoix = voix ? join(dossier, 'voix.mp3') : null;
    if (voix && cheminVoix) await writeFile(cheminVoix, voix);

    const sortie = join(dossier, 'sortie.mp4');
    const args = [
      '-y', '-framerate', String(IPS), '-i', join(dossier, 'img%05d.jpg'),
      ...(cheminVoix ? ['-i', cheminVoix] : []),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '24',
      ...(cheminVoix ? ['-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-shortest'] : []),
      sortie,
    ];

    await new Promise<void>((resoudre, rejeter) => {
      const p = spawn(ffmpeg as unknown as string, args);
      let erreur = '';
      p.stderr.on('data', (d) => { erreur = String(d).slice(-300); });
      p.on('error', rejeter);
      p.on('close', (code) => (code === 0 ? resoudre() : rejeter(new Error(`ffmpeg ${code} ${erreur}`))));
    });

    const donnees = await readFile(sortie);

    return {
      donnees,
      octets: donnees.length,
      largeur: LARGEUR,
      hauteur: HAUTEUR,
      dureeMs: plan.dureeTotaleMs,
      muette: !voix,
    };
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Écrire le banc**

Un banc qui ne vérifie que « le fichier existe » ne prouve rien. Créer `scripts/essai-rendu-video.mjs` :

```js
// Le fichier produit est-il une VIDEO, ou seulement un fichier ?
//
// Quatre controles, parce qu'un MP4 peut exister, peser 4 Mo, et ne contenir
// qu'une image fixe de la mauvaise taille sans que rien ne leve.
import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpeg from 'ffmpeg-static';

const BASE = process.env.APP_URL?.trim() || 'https://www.djiguiflow.com';
const SECRET = process.env.SYNC_SECRET;
const BOUTIQUE = process.argv[2] || 'zahara';
const LARGEUR = Number(process.env.VIDEO_LARGEUR || 1080);
const HAUTEUR = Number(process.env.VIDEO_HAUTEUR || 1920);

if (!SECRET) { console.error('SYNC_SECRET absent.'); process.exit(1); }

let echecs = 0;
const controle = (nom, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${nom}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs++;
};

const r = await fetch(`${BASE}/api/internal/contenus/video`, {
  method: 'POST',
  headers: { 'x-sync-secret': SECRET, 'Content-Type': 'application/json' },
  body: JSON.stringify({ boutique: BOUTIQUE }),
  signal: AbortSignal.timeout(180000),
});

const corps = await r.json();
if (!corps.urlVideo) {
  console.error(`Aucune video rendue — raison : ${corps.raison ?? 'inconnue'}`);
  process.exit(1);
}

const fichier = await fetch(corps.urlVideo, { signal: AbortSignal.timeout(60000) });
const octets = Buffer.from(await fichier.arrayBuffer());
const chemin = join(tmpdir(), `essai-${Date.now()}.mp4`);
await writeFile(chemin, octets);

controle('le fichier pese quelque chose et reste sous 20 Mo',
  octets.length > 10000 && octets.length < 20 * 1024 * 1024,
  `${(octets.length / 1024 / 1024).toFixed(2)} Mo`);

// ffprobe est livre a cote de ffmpeg par le meme paquet.
const sonde = await new Promise((resoudre) => {
  const p = spawn(ffmpeg.replace(/ffmpeg(\.exe)?$/, (m) => m.replace('ffmpeg', 'ffprobe')), [
    '-v', 'error', '-show_entries', 'stream=codec_type,width,height',
    '-show_entries', 'format=duration', '-of', 'json', chemin,
  ]);
  let sortie = '';
  p.stdout.on('data', (d) => { sortie += d; });
  p.on('close', () => resoudre(JSON.parse(sortie || '{}')));
  p.on('error', () => resoudre({}));
});

const flux = sonde.streams ?? [];
const image = flux.find((f) => f.codec_type === 'video');
const duree = Number(sonde.format?.duration ?? 0);

controle('le conteneur porte une piste video', Boolean(image));
controle('la duree est de 15 s', Math.abs(duree - 15) <= 0.5, `${duree.toFixed(2)} s`);
controle('les dimensions sont celles attendues',
  image?.width === LARGEUR && image?.height === HAUTEUR,
  `${image?.width}x${image?.height}`);

await rm(chemin, { force: true });
process.exit(echecs ? 1 : 0);
```

Ajouter à `package.json` : `"essai:video": "node scripts/essai-rendu-video.mjs"`.

- [ ] **Step 4: Lancer le banc**

Run: `node scripts/essai-rendu-video.mjs`
Expected: quatre contrôles verts.

- [ ] **Step 5: Éprouver par mutation**

Remplacer l'URL de photo par une adresse morte dans le catalogue de test.
Expected: la vidéo est **produite quand même**, avec un fond uni. Le rendu ne perd jamais la vidéo entière pour une photo manquante.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video/rendu.tsx scripts/essai-rendu-video.mjs next.config.ts package.json package-lock.json
git commit -m "video : le mouvement vient de sharp, le texte de satori, l encodage de ffmpeg"
```

---

## Task 6: La voix off

**À exécuter uniquement si l'issue 1 ou 3 de la réserve a été retenue à la tâche 1.** Si l'exploitant a répondu « aucune ne convient », sauter cette tâche entièrement.

**Files:**
- Create: `src/lib/video/voix.ts`
- Test: `tests/unit/voix-off.test.ts`

**Interfaces:**
- Consumes: `PlanDeTournage`.
- Produces:
  - `type EchecVoix = 'desactivee' | 'sans_jeton' | 'refus' | 'injoignable' | 'reponse_illisible'`
  - `type ResultatVoix = { ok: true; audio: Buffer } | { ok: false; raison: EchecVoix }`
  - `function texteNarration(plan: PlanDeTournage): string`
  - `async function synthetiser(texte: string): Promise<ResultatVoix>`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/unit/voix-off.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { texteNarration } from '@/lib/video/voix';
import type { PlanDeTournage } from '@/lib/contenus/video';

const plan = (narrations: (string | null)[]): PlanDeTournage => ({
  slug: 'zahara', nom: 'Zahara', dureeTotaleMs: 15000,
  prises: narrations.map((n) => ({
    photo: null, mouvement: 'fixe' as const, dureeMs: 4000, texte: '', narration: n,
  })),
});

describe('le texte donne a la synthese', () => {
  it('enchaine les narrations dans l ordre des prises', () => {
    expect(texteNarration(plan(['Un.', 'Deux.', 'Trois.'])))
      .toBe('Un. Deux. Trois.');
  });

  it('SAUTE LES PRISES MUETTES sans laisser de trou', () => {
    expect(texteNarration(plan(['Un.', null, 'Trois.'])))
      .toBe('Un. Trois.');
  });

  it('rend une chaine vide si rien n est a dire', () => {
    expect(texteNarration(plan([null, null]))).toBe('');
  });
});
```

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/unit/voix-off.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire la synthèse**

Créer `src/lib/video/voix.ts` :

```ts
import type { PlanDeTournage } from '@/lib/contenus/video';

/**
 * La voix off. UN SEUL APPEL POUR TOUTE LA VIDEO.
 *
 * Quatre appels donneraient quatre fragments recolles, avec quatre attaques et
 * quatre extinctions : la diction serait hachee. On demande les phrases mises
 * bout a bout, et le mixage les pose sur la bande.
 *
 * ELLE N'EST JAMAIS INDISPENSABLE. Toute panne ici rend une video muette, pas
 * une video manquante — le son est un supplement du supplement.
 */

export type EchecVoix =
  | 'desactivee'
  | 'sans_jeton'
  | 'refus'
  | 'injoignable'
  | 'reponse_illisible';

export type ResultatVoix = { ok: true; audio: Buffer } | { ok: false; raison: EchecVoix };

export function texteNarration(plan: PlanDeTournage): string {
  return plan.prises
    .map((p) => (p.narration ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

export async function synthetiser(texte: string): Promise<ResultatVoix> {
  const fournisseur = process.env.VOIX_OFF_FOURNISSEUR?.trim();
  // Tant que l'ecoute de la tache 1 n'a pas tranche, la variable reste vide et
  // la video est muette. C'est le comportement de reference, pas une panne.
  if (!fournisseur) return { ok: false, raison: 'desactivee' };

  const jeton = process.env.VOIX_OFF_CLE?.trim();
  if (!jeton) return { ok: false, raison: 'sans_jeton' };
  if (!texte.trim()) return { ok: false, raison: 'desactivee' };

  let reponse: Response;
  try {
    reponse = await fetch(`${fournisseur.replace(/\/$/, '')}/v1/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.VOIX_OFF_MODELE?.trim() || 'tts-1',
        voice: process.env.VOIX_OFF_VOIX?.trim() || 'alloy',
        input: texte,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { ok: false, raison: 'injoignable' };
  }

  if (!reponse.ok) return { ok: false, raison: 'refus' };

  try {
    const audio = Buffer.from(await reponse.arrayBuffer());
    if (!audio.length) return { ok: false, raison: 'reponse_illisible' };
    return { ok: true, audio };
  } catch {
    return { ok: false, raison: 'reponse_illisible' };
  }
}
```

- [ ] **Step 4: Lancer pour voir passer**

Run: `npx vitest run tests/unit/voix-off.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Éprouver le repli par mutation**

Forcer `synthetiser` à lever (`throw new Error('panne')` en première ligne) et lancer le banc de la tâche 5.

Expected: **la vidéo est produite, lisible, sans piste audio.** Pas d'exception remontée, pas de fichier corrompu. C'est le mixage qu'il faut sauter, pas seulement l'appel : une commande `ffmpeg` qui garde `-c:a aac` sans entrée audio échoue.

Rétablir.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video/voix.ts tests/unit/voix-off.test.ts
git commit -m "video : une voix off qui ne peut jamais empecher la video"
```

---

## Task 7: La route interne

**Files:**
- Create: `src/app/api/internal/contenus/video/route.ts`

**Interfaces:**
- Consumes: `planDeTournage`, `rendreVideo`, `texteNarration`, `synthetiser`, `contenusHebdo`, `prevenirExploitant`, `planApplicable`.
- Produces: `POST { boutique: string } -> { urlVideo: string | null, raison?: string }`

- [ ] **Step 1: Écrire la route**

```ts
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { contenusHebdo, indexSemaine } from '@/lib/contenus/hebdo';
import { planDeTournage } from '@/lib/contenus/video';
import { rendreVideo } from '@/lib/video/rendu';
import { synthetiser, texteNarration } from '@/lib/video/voix';
import { prevenirExploitant } from '@/lib/alerteExploitant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * La video de la semaine, pour UNE boutique.
 *
 * UN APPEL PAR BOUTIQUE, et non un appel qui les rendrait toutes : dix Premium
 * a une minute de rendu chacun depasseraient tout delai raisonnable sur une
 * seule requete.
 *
 * ELLE NE PEUT PAS FAIRE ECHOUER LE LUNDI. Tout echec rend `urlVideo: null` en
 * 200 : le workflow poursuit, le marchand recoit son message habituel. Mais
 * aucun echec n'est silencieux — l'exploitant est prevenu.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let slug = '';
  try {
    slug = String(((await req.json()) as { boutique?: unknown }).boutique ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Corps illisible' }, { status: 400 });
  }
  if (!slug) return NextResponse.json({ error: 'Boutique manquante' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Stockage indisponible' }, { status: 503 });

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || new URL(req.url).origin;

  try {
    const contenus = await contenusHebdo(base);
    const contenu = contenus.find((c) => c.slug === slug);

    // LE SECRET PARTAGE PROUVE QUE L'APPEL VIENT DE NOUS, PAS QUE LA BOUTIQUE
    // Y A DROIT. On revérifie le forfait plutot que de croire l'appelant.
    if (!contenu || !contenu.premium) {
      return NextResponse.json({ urlVideo: null, raison: 'hors_premium' });
    }

    const plan = planDeTournage(contenu);
    if (!plan) {
      // Cas NORMAL, pas une panne : le marchand n'a pas assez de photos. Il le
      // découvrira en voyant son catalogue, pas par une alerte de nuit.
      return NextResponse.json({ urlVideo: null, raison: 'photos_insuffisantes' });
    }

    const narration = texteNarration(plan);
    const voix = narration ? await synthetiser(narration) : ({ ok: false, raison: 'desactivee' } as const);
    if (!voix.ok && voix.raison !== 'desactivee') {
      await prevenirExploitant('video-voix', `Voix off indisponible (${voix.raison}) — ${slug} : vidéo muette.`);
    }

    const rendu = await rendreVideo(plan, voix.ok ? voix.audio : null);

    const { data: boutique } = await sb.from('boutiques').select('id').eq('slug', slug).maybeSingle();
    if (!boutique) return NextResponse.json({ urlVideo: null, raison: 'boutique_absente' });

    // L'index de semaine, REUTILISE et non recalcule : une date refaite a la
    // main est une date qui divergera. Relancer le lundi deux fois ecrase le
    // meme fichier au lieu d'en creer un second.
    const chemin = `${boutique.id}/s${indexSemaine()}.mp4`;

    const { error } = await sb.storage.from('videos').upload(chemin, rendu.donnees, {
      contentType: 'video/mp4', cacheControl: '604800', upsert: true,
    });

    if (error) {
      await prevenirExploitant('video-depot', `Dépôt vidéo impossible — ${slug} : ${error.message}`);
      return NextResponse.json({ urlVideo: null, raison: 'depot_impossible' });
    }

    return NextResponse.json({
      urlVideo: sb.storage.from('videos').getPublicUrl(chemin).data.publicUrl,
      muette: rendu.muette,
      octets: rendu.octets,
    });
  } catch (e) {
    const raison = e instanceof Error ? e.message.replace(/[\r\n]+/g, ' ') : 'erreur inconnue';
    console.error('Vidéo hebdo — rendu impossible :', raison);
    // Un throw n8n perd son texte sur un retour a la ligne : on aplatit avant
    // de le transmettre a l'alerte.
    await prevenirExploitant('video-rendu', `Vidéo hebdo impossible — ${slug} : ${raison}`);
    return NextResponse.json({ urlVideo: null, raison: 'rendu_impossible' });
  }
}
```

- [ ] **Step 2: Vérifier la typologie et la compilation**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 3: Éprouver les trois refus par mutation**

1. Appeler avec un mauvais `x-sync-secret` → **401**.
2. Appeler sur une boutique dont le compte n'est pas Premium → `{ urlVideo: null, raison: 'hors_premium' }`, **et aucune alerte**.
3. Forcer `rendreVideo` à lever → `{ urlVideo: null, raison: 'rendu_impossible' }`, **et une alerte partie**.

Le point 2 est le plus important : ce n'est pas une panne, et une alerte qui se déclenche pour un cas normal finit par n'être plus lue.

- [ ] **Step 4: Déployer avant d'essayer depuis n8n**

n8n appelle la production. Pousser et attendre la fin du déploiement Vercel **avant** la tâche 8, sans quoi le nœud recevra un 404 qu'on prendra pour un défaut de configuration.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/internal/contenus/video/route.ts
git commit -m "video : la route qui reverifie le forfait et n alerte que sur les vraies pannes"
```

---

## Task 8: Le workflow n8n

⚠️ `update_workflow` n'écrit qu'un brouillon : **`publish_workflow` est obligatoire**, sinon la production ne bouge pas.

**Files:** workflow `Contenus Hebdo` (`CXVWhhXEn3rpDJlC`) sur `n8n.djiguiflow.com`.

- [ ] **Step 1: Ajouter le nœud de rendu**

Entre `Lire le registre` et `Composer les envois`, insérer un nœud HTTP Request nommé **`Vidéo de la semaine`** :

- Méthode `POST`, URL `https://www.djiguiflow.com/api/internal/contenus/video`
- Authentification : `httpHeaderAuth`, même credential que les autres appels internes
- Corps JSON : `={{ { "boutique": $json.slug } }}`
- `retryOnFail: true`, `maxTries: 2`, `waitBetweenTries: 3000`
- **`onError: "continueRegularOutput"`** — une vidéo qui échoue ne doit pas emporter le message

Le nœud reçoit un article par boutique : faire précéder d'un nœud qui éclate `contenus` en articles, et d'un filtre `{{ $json.premium === true }}`.

- [ ] **Step 2: Ajouter la ligne au message**

Dans `Composer les envois`, après le bloc `🖼️ Le visuel à télécharger` :

```js
  // La video ne part qu'au Premium, et seulement si elle a ete produite. Une
  // ligne vide vaudrait mieux qu'une promesse non tenue : on n'ecrit rien.
  const urlVideo = String(c.urlVideo || '').trim();
  const blocVideo = urlVideo
    ? '\n🎬 VOTRE VIDÉO TIKTOK — prête à publier :\n' + urlVideo
      + '\n\nAjoutez un son tendance dans TikTok avant de publier.\n'
    : '';
```

et l'insérer dans `message` avant le bloc `━━━ FACEBOOK / INSTAGRAM ━━━`.

- [ ] **Step 3: Publier**

Appeler `publish_workflow` sur `CXVWhhXEn3rpDJlC`. Vérifier ensuite que `activeVersionId` a changé — c'est la seule preuve que la production a bougé.

- [ ] **Step 4: Exécuter à la main et lire l'exécution**

Déclencher le workflow, puis lire l'exécution nœud par nœud : `Vidéo de la semaine` doit rendre une `urlVideo` non nulle pour Zahara, et `Composer les envois` doit produire un message contenant `🎬`.

**Neutraliser au préalable les envois réels** si le banc risque d'écrire à un vrai destinataire.

- [ ] **Step 5: Ouvrir le lien depuis un téléphone**

Le seul contrôle qui compte : la vidéo se télécharge et se lit sur un téléphone, en vertical, et le texte est lisible à la taille réelle. Un fichier valide sur un poste de travail peut être illisible sur un écran de 6 pouces.

---

## Task 9: La ligne commerciale

**Files:**
- Modify: `src/lib/billing/plans.ts`
- Test: `tests/unit/plans-premium.test.ts`

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from 'vitest';
import { BILLING_PLANS } from '@/lib/billing/plans';

describe('ce qui distingue le Premium du Pro', () => {
  const pro = BILLING_PLANS.find((p) => p.key === 'pro')!;
  const premium = BILLING_PLANS.find((p) => p.key === 'premium')!;

  it('LE PREMIUM ANNONCE LA VIDEO, LE PRO NON', () => {
    expect(premium.features.some((f) => /vidéo tiktok/i.test(f))).toBe(true);
    expect(pro.features.some((f) => /vidéo tiktok/i.test(f))).toBe(false);
  });

  it('leurs listes ne sont plus identiques a une ligne pres', () => {
    const communes = premium.features.filter((f) => pro.features.includes(f));
    expect(communes.length).toBeLessThan(pro.features.length);
  });
});
```

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/unit/plans-premium.test.ts`
Expected: FAIL sur le premier test.

- [ ] **Step 3: Modifier la ligne Premium**

Remplacer dans `features` du plan `premium` :

```
'Contenus hebdomadaires prêts à publier — visuel, légende, hashtags, script TikTok et statut WhatsApp',
```

par :

```
'Vidéo TikTok prête à publier, chaque semaine',
'Visuel, légende, hashtags et statut WhatsApp',
```

Le Pro garde sa ligne inchangée.

- [ ] **Step 4: Lancer la suite complète**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout au vert.

- [ ] **Step 5: Vérifier la page tarifs à l'écran**

Ouvrir la page des forfaits et vérifier que la carte Premium ne déborde pas avec la ligne supplémentaire.

- [ ] **Step 6: Commit et PR**

```bash
git add src/lib/billing/plans.ts tests/unit/plans-premium.test.ts
git commit -m "forfaits : la video, ce qui separe enfin le premium du pro"
```

Ouvrir la PR vers `main` après accord de l'exploitant.

---

## Ce que ce plan ne fait pas

- **Publier à la place du marchand.** Ni Facebook ni Instagram ne l'autorisent sans App Review et connexion OAuth par marchand ; TikTok encore moins.
- **Ajouter de la musique.** Une piste que nous ne possédons pas ferait couper le son de la publication du marchand ou retirer la vidéo.
- **Laisser le marchand choisir son produit.** Aucun écran à construire ; le choix est automatique.
- **Envoyer le fichier sur le canal.** La chaîne d'envoi ne transporte que du texte, et on ne modifie pas ses quatorze appelants pour une nouveauté hebdomadaire.
- **Le SMS et la diffusion WhatsApp promotionnelle.** Reportés : le SMS attend un coût réel chez un agrégateur ivoirien, la diffusion WhatsApp attend un consentement recueilli, une finalité déclarée au registre et un article de plus à la politique de confidentialité.
