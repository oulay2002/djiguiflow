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

/**
 * ── LE SECRET DIT QUI APPELLE, PAS POUR QUEL MARCHAND ──────────────────────
 *
 * Les trois blocs precedents verifient qu'une route porte un VERROU D'ENTREE.
 * Celui-ci verifie autre chose, et c'est le defaut ferme le 2 septembre 2026 :
 * une route interne peut porter le secret et rester ouverte d'un marchand a
 * l'autre.
 *
 * `reference` est une cle GLOBALE. Elle ne dit pas a qui la commande
 * appartient. Une seule instance n8n sert tous les marchands ; le secret
 * partage atteste que l'appelant est n8n, jamais POUR QUI il appelle. Quatre
 * routes cherchaient ainsi — `fiche`, `note`, `prevenu` et `livraison`, cette
 * derniere sur ses trois ecritures. Le cloisonnement ne tenait qu'a ce
 * qu'aucun workflow ne se trompe jamais de reference.
 *
 * CE QUE CE TEST SAIT FAIRE, ET CE QU'IL NE SAIT PAS. Il COMPTE : autant de
 * bornes de boutique que de recherches par reference. C'est grossier — il ne
 * verifie pas que la borne est sur la BONNE requete — et cela ne remplace pas
 * `cloisonnement-commandes-internes.test.ts`, qui fait tourner les routes
 * contre une base a deux marchands et regarde ce qui sort.
 *
 * Sa valeur est ailleurs : le banc ne parle que des quatre routes du jour,
 * celui-ci parle de la CINQUIEME, celle qu'on ajoutera un soir de hate. Le
 * cloisonnement ne se perd pas en cassant un controle, il se perd en ecrivant
 * a cote.
 */
const DISPENSES_CLOISONNEMENT: Record<string, string> = {
  'src/app/api/internal/commandes/abandons/route.ts':
    "balayage planifie sans reference en entree : la seule `eq('reference')` marque une ligne "
    + "que la route vient elle-meme de lire, et chaque message repart par le canal de SA boutique.",
};

describe('toute recherche interne par reference est bornee a une boutique', () => {
  const fichiers = routes('src/app/api/internal').filter((f) =>
    readFileSync(f, 'utf8').includes("from('commandes')"),
  );

  it('il y a bien des routes a verifier', () => {
    expect(fichiers.length).toBeGreaterThan(5);
  });

  it.each(fichiers)('%s', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    const compter = (motif: RegExp) => (source.match(motif) ?? []).length;

    // `ilike` compte autant que `eq` : `commandes/livraison` cherche ainsi,
    // et c'est la route qui ECRIT le statut.
    const recherches = compter(/\.(eq|ilike)\('reference'/g);
    if (recherches === 0) return;

    const bornes = compter(/\.eq\('boutique_id'/g);
    if (bornes >= recherches) return;

    expect(
      DISPENSES_CLOISONNEMENT[fichier],
      [
        `${fichier} cherche ${recherches} fois par reference et ne borne que ${bornes} fois.`,
        '`reference` est une cle globale : sans borne, cette route touche la commande',
        "d'un autre marchand des que l'appelant se trompe de cle.",
        'Ajoutez `.eq(\'boutique_id\', marchand.boutiqueId)`, ou une dispense argumentee.',
      ].join('\n'),
    ).toBeTruthy();
  });

  it('aucune dispense ne designe une route disparue', () => {
    for (const chemin of Object.keys(DISPENSES_CLOISONNEMENT)) {
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
