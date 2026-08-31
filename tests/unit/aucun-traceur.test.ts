import { promises as fs } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * « Aucun outil d'analytique n'est installé sur le service. »
 *
 * ── POURQUOI CE FICHIER EXISTE, ET IL A UNE DATE ───────────────────────────
 *
 * Le 31 août 2026, on m'a demandé comment attirer plus de visiteurs et mieux
 * les convertir. J'ai recommandé d'installer un outil de mesure d'audience,
 * **sans avoir lu l'article 9 de la politique de confidentialité**. Il dit :
 *
 *   « Aucun témoin de mesure d'audience, de publicité ou de suivi
 *     comportemental n'est déposé, et aucun outil d'analytique n'est installé
 *     sur le service. Il n'y a donc pas de bandeau de consentement, parce
 *     qu'il n'y a rien à consentir. »
 *
 * L'engagement était publié, opposable, et **rien ne le tenait**. Treize tests
 * accordaient déjà le document au code sur les durées de conservation ; aucun
 * ne gardait celui-ci. Une consigne que rien n'éprouve finit toujours par être
 * enfreinte de bonne foi, par quelqu'un qui ne l'a pas lue — en l'occurrence
 * moi.
 *
 * ── CE QUE CE FICHIER GARDE, DANS LES DEUX SENS ────────────────────────────
 *
 * Il ne suffit pas de vérifier que la phrase est toujours dans le document :
 * ce serait garder l'intention et non le fait. Il faut aussi vérifier que le
 * CODE ne contredit pas la phrase. Les deux moitiés sont ici.
 *
 * ── CE QUI RESTE PERMIS ────────────────────────────────────────────────────
 *
 * Ce test n'interdit pas de MESURER. Il interdit de mesurer **en déposant
 * quelque chose chez le visiteur**. L'entonnoir d'activation, calculé côté
 * serveur depuis des données déjà détenues au titre du contrat, ne dépose
 * rien et ne relève pas de cet article — voir `scripts/entonnoir.mjs`.
 *
 * Si un jour la décision est prise d'installer un traceur, ce test doit être
 * modifié **en même temps** que l'article 9, dans le même commit. C'est
 * exactement son rôle : rendre impossible de changer l'un sans l'autre.
 */

const RACINE = path.join(__dirname, '..', '..');

const lire = (p: string) => fs.readFile(path.join(RACINE, p), 'utf8');

/**
 * Les familles de traceurs, par leur nom de paquet ou leur hote.
 *
 * La liste vise les OUTILS, pas les mots : chercher « analytics » en clair
 * attraperait un commentaire qui explique justement qu'on n'en veut pas.
 */
const TRACEURS = [
  '@vercel/analytics',
  '@vercel/speed-insights',
  'posthog-js',
  'plausible-tracker',
  'react-ga',
  'react-ga4',
  'mixpanel-browser',
  '@amplitude/analytics-browser',
  '@segment/analytics-next',
  'umami',
  'fathom-client',
];

const HOTES = [
  'googletagmanager.com',
  'google-analytics.com',
  'plausible.io',
  'posthog.com',
  'mixpanel.com',
  'segment.com',
  'hotjar.com',
  'clarity.ms',
  'matomo',
];

describe('l article 9 est toujours ecrit', () => {
  it('la politique promet l absence de traceur', async () => {
    const doc = await lire('docs/legal/politique-confidentialite.md');
    expect(doc).toContain("aucun outil d'analytique n'est installé");
    expect(doc).toContain('pas de bandeau de consentement');
  });
});

describe('et le code ne le contredit pas', () => {
  it('AUCUN PAQUET DE MESURE D AUDIENCE N EST INSTALLE', async () => {
    const pkg = JSON.parse(await lire('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installes = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const fautifs = installes.filter((n) => TRACEURS.some((t) => n === t || n.startsWith(`${t}/`)));

    // Le message porte la raison : celui qui verra ce test rouge saura qu'il
    // ne s'agit pas d'un oubli de liste blanche mais d'un engagement publie.
    expect(
      fautifs,
      `Paquet de mesure d'audience installe : ${fautifs.join(', ')}.\n`
        + "L'article 9 de la politique de confidentialite promet qu'il n'y en a AUCUN.\n"
        + 'Modifier le document et ce test dans le meme commit, ou retirer le paquet.',
    ).toEqual([]);
  });

  it('AUCUN HOTE DE TRACAGE N EST APPELE DEPUIS LE CODE', async () => {
    const fichiers: string[] = [];
    const parcourir = async (rel: string) => {
      for (const e of await fs.readdir(path.join(RACINE, rel), { withFileTypes: true })) {
        const chemin = `${rel}/${e.name}`;
        if (e.isDirectory()) await parcourir(chemin);
        else if (/\.(tsx?|jsx?|css)$/.test(e.name)) fichiers.push(chemin);
      }
    };
    await parcourir('src');

    const fautifs: string[] = [];
    for (const f of fichiers) {
      const contenu = await lire(f);
      for (const h of HOTES) {
        // On ignore les lignes de commentaire : ce fichier-ci nomme ces hotes
        // pour les interdire, et un garde qui s'attrape lui-meme est inutile.
        const lignes = contenu.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
        if (lignes.some((l) => l.includes(h))) fautifs.push(`${f} → ${h}`);
      }
    }

    expect(
      fautifs,
      `Hote de tracage appele : ${fautifs.join(', ')}.\n`
        + "L'article 9 promet qu'aucun suivi comportemental n'est depose.",
    ).toEqual([]);
  });

  it('la CSP n ouvre aucun hote de tracage', async () => {
    const config = await lire('next.config.ts');
    const lignes = config.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    const ouverts = HOTES.filter((h) => lignes.some((l) => l.includes(h)));

    // La CSP est la DERNIERE barriere : un hote qui n'y figure pas est bloque
    // par le navigateur meme si un script tentait de l'appeler. L'y voir
    // apparaitre serait le signe qu'on prepare le terrain a un traceur.
    expect(ouverts, `La CSP autorise : ${ouverts.join(', ')}`).toEqual([]);
  });
});
