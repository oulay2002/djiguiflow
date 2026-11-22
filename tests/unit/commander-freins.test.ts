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
 * CE QUE CES TESTS VERIFIENT EN PLUS DU CODE DE RETOUR : qu'un appel refuse par
 * le frein PAR APPELANT ne coute RIEN. Un frein qui bloquerait apres avoir
 * interroge le catalogue laisserait la porte ouverte a l'epuisement de
 * ressources.
 *
 * ET, DEPUIS L'AUDIT DU 22 NOVEMBRE 2026 : que les deux compteurs PARTAGES de la
 * boutique ne sont consommes que par ce qui va devenir une commande. Ils
 * l'etaient des la premiere ligne, avant meme la lecture du corps : trois cents
 * appels au corps vide fermaient la vitrine d'un marchand jusqu'a minuit, sans
 * une commande en base, donc sans rien qu'il puisse voir. Ces tests affirmaient
 * l'ancien ordre ; ils affirment maintenant le nouveau, et pourquoi.
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
  clesFenetre: [] as string[],
  fenetre: { depassee: false, valeur: 1, indisponible: false } as {
    depassee: boolean;
    valeur: number | null;
    indisponible: boolean;
  },
  catalogueLu: false,
  plafondConsulte: 0,
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
  // Le deuxieme etage vit en base : la doublure enregistre sa cle comme celle
  // de la rafale, pour qu'on puisse verifier qu'il ne porte PAS l'adresse.
  fenetreDepassee: async (cle: string) => {
    etats.clesFenetre.push(cle);
    return etats.fenetre;
  },
  plafondJournalierDepasse: async () => {
    etats.plafondConsulte += 1;
    return etats.plafond;
  },
  secondesAvantMinuitAbidjan: () => 3600,
}));

// Le catalogue ne doit jamais etre lu sur un appel refuse : cette doublure
// leve un drapeau si on la touche.
//
// Il y en avait une seconde, sur `@/lib/googleSheets` : la route lisait le
// menu dans la feuille en repli. Le module a disparu le 28 aout 2026 avec le
// reste de Google Sheets ; Supabase est desormais le seul catalogue, donc le
// seul drapeau a lever.
//
// ELLE REND MAINTENANT UNE BASE, ET PLUS `null`. Les compteurs de boutique ne
// sont atteints qu'apres la lecture du catalogue : sans catalogue, aucun test
// ne pouvait plus les eprouver. La doublure connait un article — « P1 », sans
// stock compte — et REFUSE l'insertion de la commande : ces tests jugent les
// freins, pas l'ecriture, et une requete qui les passe finit donc en 503.
const resultat = (table: string) => {
  if (table === 'boutiques') return { data: { essai: false }, error: null };
  if (table === 'produits') {
    return {
      data: [{ id: 'p-1', nom: 'Plat', prix: 1000, reference: 'P1', stock: null, disponible: true }],
      error: null,
    };
  }
  return { data: null, error: { message: 'ecriture refusee par la doublure' } };
};

const chaine = (table: string): unknown =>
  new Proxy(function () {}, {
    get: (_cible, cle) => {
      if (cle === 'then') {
        return (resoudre: (v: unknown) => unknown) => resoudre(resultat(table));
      }
      return () => chaine(table);
    },
  });

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => {
    etats.catalogueLu = true;
    return { from: (table: string) => chaine(table) };
  },
}));

vi.mock('@/lib/boutiques', () => ({ resoudreBoutiqueUuid: async () => 'b-1' }));

// La boutique est branchee et ouverte : ce n'est pas le sujet de ce fichier.
vi.mock('@/lib/boutiquePrete', () => ({
  boutiquePeutVendre: () => ({ peutVendre: true, manque: [] }),
  CANAL_DES_COMMANDES_VITRINE: 'whatsapp',
}));
vi.mock('@/lib/horaires', () => ({ etatBoutique: () => ({ ouvert: true }) }));

const { POST } = await import('@/app/api/boutiques/[id]/commander/route');

const marchandComplet = () => ({
  id: 'boutique-test',
  sheetId: 'feuille',
  sheetCommandes: 'Commandes',
  sheetMenu: 'Menu',
  boutiqueId: 'b-1',
});

/** Une commande qu'un vrai client enverrait : un article connu, un numero valide. */
const commandeValide = () => ({
  nom: 'Awa',
  tel: '0700000000',
  adresse: 'Cocody',
  panier: [{ id: 'P1', quantite: 1 }],
});

const requete = (corps: unknown = commandeValide()) =>
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
  etats.clesFenetre = [];
  etats.fenetre = { depassee: false, valeur: 1, indisponible: false };
  etats.catalogueLu = false;
  etats.plafondConsulte = 0;
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

describe('le frein par boutique — celui qui vit en BASE', () => {
  it('refuse en 429 meme quand l’appelant, lui, est dans les clous', async () => {
    etats.fenetre = { depassee: true, valeur: 21, indisponible: false };
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('600');
  });

  it('borne le degat toutes adresses confondues', async () => {
    etats.fenetre = { depassee: true, valeur: 21, indisponible: false };
    await POST(requete(), ctx);
    // La cle ne porte PAS l'adresse : c'est ce qui la rend efficace contre une
    // attaque repartie, et c'est pour cela qu'elle doit vivre en base — un
    // compteur en memoire ne voit qu'une instance sur plusieurs.
    expect(etats.clesFenetre[0]).toBe('commande:boutique-test');
    expect(etats.clesFenetre[0]).not.toContain('203.0.113.7');
  });

  it('rend 503, et non 429, quand le compteur est injoignable', async () => {
    // Une panne n'est pas un refus de quota : l'appelant doit pouvoir les
    // distinguer, ne serait-ce que pour savoir s'il a le droit de reessayer.
    etats.fenetre = { depassee: true, valeur: null, indisponible: true };
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(503);
  });
});

describe('le plafond du jour', () => {
  it('refuse en 429 quand il est atteint', async () => {
    etats.plafond = { depasse: true, valeur: 300, indisponible: false };
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('3600');
  });

  it('rend 503 quand le compteur est injoignable', async () => {
    etats.plafond = { depasse: true, valeur: null, indisponible: true };
    const rep = await POST(requete(), ctx);
    expect(rep.status).toBe(503);
  });
});

describe('les compteurs PARTAGES ne comptent que des commandes', () => {
  // Chacun de ces appels etait compte comme une commande de la boutique. Trois
  // cents suffisaient a faire repondre « a atteint son nombre de commandes pour
  // aujourd'hui » a tous les vrais clients, jusqu'a minuit.
  const jamaisCompte = async (corps: unknown, statutAttendu: number) => {
    const rep = await POST(requete(corps), ctx);
    expect(rep.status).toBe(statutAttendu);
    expect(etats.clesFenetre, 'le compteur de fenetre a ete consomme').toHaveLength(0);
    expect(etats.plafondConsulte, 'le plafond du jour a ete consomme').toBe(0);
  };

  it('un corps vide ne consomme rien', async () => {
    await jamaisCompte({}, 400);
  });

  it('un panier vide ne consomme rien', async () => {
    await jamaisCompte({ ...commandeValide(), panier: [] }, 400);
  });

  it('un numero qui n’en est pas un ne consomme rien', async () => {
    await jamaisCompte({ ...commandeValide(), tel: '12345' }, 400);
  });

  it('un panier d’articles inconnus du catalogue ne consomme rien', async () => {
    await jamaisCompte({ ...commandeValide(), panier: [{ id: 'INCONNU', quantite: 1 }] }, 400);
  });

  it('une quantite hors borne ne consomme rien', async () => {
    await jamaisCompte({ ...commandeValide(), panier: [{ id: 'P1', quantite: 100000 }] }, 400);
  });

  it('et ces refus-la ne lisent meme pas la base', async () => {
    await POST(requete({}), ctx);
    await POST(requete({ ...commandeValide(), tel: '12345' }), ctx);
    expect(etats.catalogueLu).toBe(false);
  });

  it('une vraie commande, elle, est bien comptee — une fois', async () => {
    await POST(requete(), ctx);
    expect(etats.clesFenetre).toEqual(['commande:boutique-test']);
    expect(etats.plafondConsulte).toBe(1);
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
    expect(etats.clesFenetre).toHaveLength(0);
  });

  it('consulte les trois etages dans l’ordre sur un appel qui passe', async () => {
    await POST(requete(), ctx);
    // Premier etage en memoire, porte par l'adresse. Deuxieme en base, porte
    // par la seule boutique.
    expect(etats.clesRafale).toEqual(['commande:boutique-test:203.0.113.7']);
    expect(etats.clesFenetre).toEqual(['commande:boutique-test']);
  });
});
