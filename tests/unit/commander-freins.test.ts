import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Les freins de la prise de commande publique.
 *
 * CE QU'ILS EMPECHENT. Ce point d'entree est public et il ECRIT : il insere
 * dans `commandes`, dans `commande_items`, et il decompte le stock.
 * L'identifiant de boutique et les references produits sont publics, puisque
 * c'est la vitrine. Sans frein, une boucle depuis un seul poste vide le stock
 * de n'importe quel marchand — et comme le stock bloque la commande, sa
 * vitrine refuse ensuite ses vrais clients.
 *
 * CE QUE CES TESTS VERIFIENT EN PLUS DU CODE DE RETOUR : qu'un appel refuse ne
 * coute RIEN. Un frein qui bloquerait apres avoir interroge le catalogue
 * laisserait la porte ouverte a l'epuisement de ressources.
 */

const etats = vi.hoisted(() => ({
  marchand: null as unknown,
  rafales: [] as { depassee: boolean; attendreSecondes: number }[],
  plafond: { depasse: false, valeur: 1, indisponible: false } as {
    depasse: boolean;
    valeur: number | null;
    indisponible: boolean;
  },
  clesRafale: [] as string[],
  catalogueLu: false,
}));

vi.mock('@/lib/marchands', () => ({
  getMarchand: async () => etats.marchand,
  prefixeReference: () => 'CMD',
  resoudreMarchand: async () => etats.marchand,
}));

vi.mock('@/lib/limiteur', () => ({
  adresseAppelante: () => '203.0.113.7',
  rafaleDepassee: (cle: string) => {
    etats.clesRafale.push(cle);
    return etats.rafales.shift() ?? { depassee: false, attendreSecondes: 0 };
  },
  plafondJournalierDepasse: async () => etats.plafond,
  secondesAvantMinuitAbidjan: () => 3600,
}));

// Le catalogue ne doit jamais etre lu sur un appel refuse : ces doublures
// levent un drapeau si on les touche.
vi.mock('@/lib/googleSheets', () => ({
  readSheet: async () => {
    etats.catalogueLu = true;
    return [];
  },
  readHeaders: async () => {
    etats.catalogueLu = true;
    return [];
  },
  appendRow: async () => {
    etats.catalogueLu = true;
  },
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => {
    etats.catalogueLu = true;
    return null;
  },
}));

const { POST } = await import('@/app/api/boutiques/[id]/commander/route');

const marchandComplet = () => ({
  id: 'boutique-test',
  sheetId: 'feuille',
  sheetCommandes: 'Commandes',
  sheetMenu: 'Menu',
  boutiqueId: 'b-1',
});

const requete = (corps: unknown = { panier: [] }) =>
  new Request('https://exemple.test/api/boutiques/boutique-test/commander', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });

const ctx = { params: Promise.resolve({ id: 'boutique-test' }) };

beforeEach(() => {
  etats.marchand = marchandComplet();
  etats.rafales = [];
  etats.plafond = { depasse: false, valeur: 1, indisponible: false };
  etats.clesRafale = [];
  etats.catalogueLu = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('le frein par appelant', () => {
  it('refuse en 429 avec Retry-After', async () => {
    etats.rafales = [{ depassee: true, attendreSecondes: 240 }];
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('240');
  });

  it('ne lit RIEN quand il refuse', async () => {
    etats.rafales = [{ depassee: true, attendreSecondes: 240 }];
    await POST(requete(), ctx);
    expect(etats.catalogueLu).toBe(false);
  });

  it('journalise le refus, pour qu’une attaque soit visible', async () => {
    etats.rafales = [{ depassee: true, attendreSecondes: 240 }];
    await POST(requete(), ctx);
    expect(console.error).toHaveBeenCalled();
  });

  it('porte une cle qui distingue la boutique ET l’appelant', async () => {
    etats.rafales = [{ depassee: true, attendreSecondes: 1 }];
    await POST(requete(), ctx);
    expect(etats.clesRafale[0]).toBe('commande:boutique-test:203.0.113.7');
  });
});

describe('le frein par boutique', () => {
  it('refuse en 429 meme quand l’appelant, lui, est dans les clous', async () => {
    // Premiere rafale : l'appelant passe. Deuxieme : la boutique sature.
    etats.rafales = [
      { depassee: false, attendreSecondes: 0 },
      { depassee: true, attendreSecondes: 300 },
    ];
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('300');
    expect(etats.catalogueLu).toBe(false);
  });

  it('borne le degat toutes adresses confondues', async () => {
    etats.rafales = [
      { depassee: false, attendreSecondes: 0 },
      { depassee: true, attendreSecondes: 300 },
    ];
    await POST(requete(), ctx);
    // La seconde cle ne porte PAS l'adresse : c'est ce qui la rend efficace
    // contre une attaque repartie.
    expect(etats.clesRafale[1]).toBe('commande:boutique-test');
    expect(etats.clesRafale[1]).not.toContain('203.0.113.7');
  });
});

describe('le plafond du jour', () => {
  it('refuse en 429 quand il est atteint', async () => {
    etats.plafond = { depasse: true, valeur: 300, indisponible: false };
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('3600');
    expect(etats.catalogueLu).toBe(false);
  });

  it('rend 503 quand le compteur est injoignable', async () => {
    etats.plafond = { depasse: true, valeur: null, indisponible: true };
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(503);
  });
});

describe('ce que les freins ne doivent PAS casser', () => {
  it('laisse passer une commande ordinaire jusqu’au traitement', async () => {
    // Aucun frein ne se declenche : la requete va plus loin, et echoue pour
    // une raison METIER (corps illisible), pas pour un refus de frein. C'est
    // la preuve que les freins ne bloquent pas un vrai client.
    const rep = await POST(
      new Request('https://exemple.test/api/boutiques/boutique-test/commander', {
        method: 'POST',
        body: 'pas du json',
      }),
      ctx,
    );
    expect(rep.status).toBe(400);
    expect(rep.status).not.toBe(429);
  });

  it('rend 404 sur une boutique inconnue, sans consommer de frein', async () => {
    etats.marchand = null;
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(404);
    expect(etats.clesRafale).toHaveLength(0);
  });

  it('consulte les trois etages dans l’ordre sur un appel qui passe', async () => {
    await POST(requete(), ctx);
    expect(etats.clesRafale).toEqual(['commande:boutique-test:203.0.113.7', 'commande:boutique-test']);
  });
});
