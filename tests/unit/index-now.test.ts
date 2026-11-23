import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * IndexNow : prevenir les moteurs, sans jamais gener l'enregistrement.
 *
 * Trois proprietes, et chacune a une raison :
 *  - il NE LEVE JAMAIS — un article se sauvegarde meme si le moteur est sourd ;
 *  - il ne part QUE DE LA PRODUCTION — un apercu annoncerait des pages qui
 *    n'existent pas sur le vrai site ;
 *  - il NE MARTELE PAS — vingt plats saisis d'affilee font un appel, pas vingt.
 */

const etats = vi.hoisted(() => ({ rafales: new Set<string>() }));

vi.mock('@/lib/limiteur', () => ({
  rafaleDepassee: (cle: string) => {
    const deja = etats.rafales.has(cle);
    etats.rafales.add(cle);
    return { depassee: deja, attendreSecondes: 0 };
  },
}));

const { CLE_INDEXNOW, prevenirMoteurs } = await import('@/lib/indexNow');

let appels: { url: string; corps: Record<string, unknown> }[] = [];
let statut = 200;

beforeEach(() => {
  appels = [];
  statut = 200;
  etats.rafales.clear();
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    appels.push({ url, corps: JSON.parse(init.body) });
    return { status: statut };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('la cle publiee', () => {
  it('le fichier de cle existe et contient exactement la cle', () => {
    // S'il disparait ou change, les moteurs refusent TOUS les appels — en
    // silence, puisque rien d'autre ne lit ce fichier.
    const chemin = `public/${CLE_INDEXNOW}.txt`;
    expect(existsSync(chemin), `${chemin} est absent`).toBe(true);
    expect(readFileSync(chemin, 'utf8')).toBe(CLE_INDEXNOW);
  });

  it('a la forme que le protocole exige', () => {
    expect(CLE_INDEXNOW).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('prevenirMoteurs', () => {
  it('annonce la page, avec la cle et l’adresse du fichier de cle', async () => {
    expect(await prevenirMoteurs(['/boutiques/chez-awa'])).toBe('envoye');
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe('https://api.indexnow.org/indexnow');
    expect(appels[0].corps).toEqual({
      host: 'www.djiguiflow.com',
      key: CLE_INDEXNOW,
      keyLocation: `https://www.djiguiflow.com/${CLE_INDEXNOW}.txt`,
      urlList: ['https://www.djiguiflow.com/boutiques/chez-awa'],
    });
  });

  it('ne part PAS hors de la production', async () => {
    for (const env of ['preview', 'development', '']) {
      vi.stubEnv('VERCEL_ENV', env);
      expect(await prevenirMoteurs(['/boutiques/chez-awa']), env).toBe('ignore');
    }
    expect(appels).toHaveLength(0);
  });

  it('ne martele pas : la meme page n’est annoncee qu’une fois par fenetre', async () => {
    await prevenirMoteurs(['/boutiques/chez-awa']);
    expect(await prevenirMoteurs(['/boutiques/chez-awa'])).toBe('ignore');
    expect(appels).toHaveLength(1);
  });

  it('n’annonce que nos propres pages', async () => {
    expect(await prevenirMoteurs(['https://exemple.com/x'])).toBe('ignore');
    expect(appels).toHaveLength(0);

    // Melangees a une des notres, les etrangeres sont ecartees, pas la notre.
    await prevenirMoteurs(['https://exemple.com/y', '/boutiques/chez-awa']);
    expect(appels[0].corps.urlList).toEqual(['https://www.djiguiflow.com/boutiques/chez-awa']);
  });

  it('un refus du moteur se journalise et ne leve pas', async () => {
    statut = 403;
    expect(await prevenirMoteurs(['/boutiques/chez-awa'])).toBe('echec');
    expect(console.error).toHaveBeenCalled();
  });

  it('une panne de reseau ne leve pas non plus', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('reseau coupe');
    });
    await expect(prevenirMoteurs(['/boutiques/chez-awa'])).resolves.toBe('echec');
  });
});

describe('ce qui tient autour', () => {
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');

  it('l’annonce part APRES la reponse, a la creation et a la modification d’un article', () => {
    const route = lire('src/app/api/dashboard/produits/route.ts');
    const annonces = route.match(/after\(\(\) => prevenirMoteurs\(/g) ?? [];
    expect(annonces.length).toBe(2);
    // Une boutique hors annuaire ou hors des moteurs n'est pas annoncee.
    expect(route.match(/if \(m\.actif && m\.indexable !== false\) \{/g)?.length).toBe(2);
  });

  it('le plan du site ne declare plus l’heure de sa propre generation', () => {
    // Une date qui ment fait ignorer toutes les dates du site.
    const plan = lire('src/app/sitemap.ts');
    expect(plan).not.toMatch(/lastModified:\s*maintenant/);
    expect(plan).not.toMatch(/lastModified:\s*new Date\(\)/);
  });

  it('chaque vitrine a son image de partage', () => {
    expect(existsSync('src/app/boutiques/[id]/opengraph-image.tsx')).toBe(true);
  });
});
