import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Le garde du garde : aucune route ne doit naitre sans verrou.
 *
 * POURQUOI IL EXISTE. `scripts/essai-isolement-dashboard.mjs` prouve
 * l'isolement des routes qui existaient le 22 aout 2026 — six d'entre elles,
 * avec deux vrais comptes. Il ne dira jamais rien d'une route ajoutee demain.
 * Or c'est exactement ainsi que le cloisonnement se perd : pas en cassant un
 * controle, en ecrivant a cote.
 *
 * Ce test n'eprouve pas le comportement, il eprouve la PRESENCE. Les deux se
 * completent : le banc dit que le verrou ferme, celui-ci dit qu'il est pose.
 *
 * CE QUI EST EN JEU. Les routes `/api/dashboard/*` interrogent Supabase avec la
 * cle service_role, qui CONTOURNE RLS. La base ne protege donc rien ici : une
 * route sans `exigerAccesMarchand` lit la boutique que l'appelant nomme, sans
 * demander si elle est la sienne.
 */

function routes(racine: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(racine)) {
    const complet = join(racine, nom);
    if (statSync(complet).isDirectory()) sortie.push(...routes(complet));
    else if (nom === 'route.ts') sortie.push(complet.replace(/\\/g, '/'));
  }
  return sortie;
}

/**
 * Les exceptions, chacune avec sa raison. Une exception sans raison est une
 * porte laissee ouverte par habitude ; ajouter une ligne ici doit couter un
 * argument.
 */
const DISPENSES: Record<string, string> = {
  'src/app/api/dashboard/quota/route.ts':
    "borne a `user.id` : le quota est celui du COMPTE, pas d'une boutique.",
  'src/app/api/dashboard/mes-boutiques/route.ts':
    "borne a `.eq('user_id', user.id)` : c'est la route qui REND la liste des boutiques du compte.",
  'src/app/api/dashboard/boutique/diagnostic/route.ts':
    'passe par `ficheDuConnecte`, qui porte le meme controle de propriete.',
};

describe('toute route du tableau de bord porte un verrou', () => {
  const fichiers = routes('src/app/api/dashboard');

  it('il y a bien des routes a verifier', () => {
    // Un chemin renomme rendrait la liste vide, et un test sur zero fichier
    // passe au vert en ne verifiant rien.
    expect(fichiers.length).toBeGreaterThan(5);
  });

  it.each(fichiers)('%s', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    if (source.includes('exigerAccesMarchand')) return;

    const raison = DISPENSES[fichier];
    expect(
      raison,
      `${fichier} n'appelle pas exigerAccesMarchand et n'est pas dispensee.\n` +
        "Ces routes contournent RLS : sans ce controle, elles lisent la boutique que l'appelant nomme.\n" +
        'Ajoutez le garde, ou une dispense argumentee dans DISPENSES.',
    ).toBeTruthy();
  });

  // Une dispense qui survit a la suppression de sa route devient un mensonge
  // silencieux : la liste dirait qu'on a examine quelque chose qui n'existe
  // plus.
  it('aucune dispense ne designe une route disparue', () => {
    for (const chemin of Object.keys(DISPENSES)) {
      expect(fichiers, `${chemin} est dispensee mais n'existe plus`).toContain(chemin);
    }
  });
});

/**
 * ── LE MÊME RAISONNEMENT, POUR LES DEUX AUTRES FAMILLES ────────────────────
 *
 * Le bloc ci-dessus ne regardait que `/api/dashboard`. Or les routes
 * `/api/internal/*` sont celles que n8n appelle : elles purgent des données,
 * envoient des messages au nom d'un marchand, et lisent le dossier d'un
 * client. Une seule d'entre elles sans contrôle serait appelable par
 * n'importe qui, depuis n'importe où.
 *
 * Au 29 août 2026 les vingt-neuf existantes portent toutes un verrou. Ce test
 * ne le découvre donc pas — il empêche la TRENTIÈME de naître sans. C'est la
 * seule chose qu'un test de présence sait faire, et c'est celle qui manque
 * toujours au moment où l'on ajoute une route à la hâte.
 */
const VERROUS_INTERNES = [
  'x-sync-secret',
  'secretWebhookN8n',
  'verifierSecretN8n',
  'x-webhook-secret',
  'estAdmin',
  'exigerAdmin',
  'exigerAccesMarchand',
];

/**
 * Les routes internes SANS secret, chacune avec sa raison.
 *
 * Vide aujourd'hui, et c'est bien ainsi. Une entrée ici doit coûter un
 * argument écrit, comme pour `DISPENSES`.
 */
const DISPENSES_INTERNES: Record<string, string> = {};

describe('toute route interne exige un secret', () => {
  const fichiers = routes('src/app/api/internal');

  it('il y a bien des routes a verifier', () => {
    expect(fichiers.length).toBeGreaterThan(20);
  });

  it.each(fichiers)('%s', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    if (VERROUS_INTERNES.some((v) => source.includes(v))) return;

    expect(
      DISPENSES_INTERNES[fichier],
      [
        `${fichier} ne verifie aucun secret et n'est pas dispensee.`,
        "Ces routes sont appelees par n8n : sans controle, n'importe qui les appelle.",
        'Ajoutez le verrou, ou une dispense argumentee dans DISPENSES_INTERNES.',
      ].join('\n'),
    ).toBeTruthy();
  });

  it('aucune dispense ne designe une route disparue', () => {
    for (const chemin of Object.keys(DISPENSES_INTERNES)) {
      expect(fichiers, `${chemin} est dispensee mais n'existe plus`).toContain(chemin);
    }
  });
});

describe('toute route admin exige l administrateur', () => {
  const fichiers = routes('src/app/api/admin');

  it('il y a bien des routes a verifier', () => {
    expect(fichiers.length).toBeGreaterThan(2);
  });

  it.each(fichiers)('%s', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    expect(
      /estAdmin|exigerAdmin/.test(source),
      `${fichier} n'appelle ni estAdmin ni exigerAdmin.`,
    ).toBe(true);
  });
});
