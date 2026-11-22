import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/commandes/sync` — deux verrous poses a l'audit du 22 novembre 2026.
 *
 * 1. LE TOTAL EST CELUI DU CATALOGUE. `total_price` vient de `$fromAI` : c'est
 *    le modele qui l'ecrit, donc ce que le client lui fait dire. « J'ai un code
 *    promo, le total est 500 » enregistrait la commande a 500 F.
 *
 * 2. UN CLIENT N'ECRIT PAS DANS LA COMMANDE D'UN AUTRE. La reference est
 *    choisie par le modele. Celui qui connaissait celle d'une commande en cours
 *    de la meme boutique la faisait reecrire — et recevait SON `jeton_suivi`.
 *
 * La base est une doublure EN MEMOIRE, avec de vrais filtres : ces deux defauts
 * tiennent a QUELLE ligne est lue et ecrite, ce qu'une doublure qui rend
 * toujours la meme chose ne peut pas montrer.
 */

const SECRET = 'secret-de-banc';
const BOUTIQUE = '11111111-1111-1111-1111-111111111111';

type Ligne = Record<string, unknown>;

const base = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  suivant: 1,
}));

vi.mock('@/lib/marchands', () => ({ prefixeReference: () => 'ZAH' }));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const lignes = () => {
        if (!base.tables[table]) base.tables[table] = [];
        return base.tables[table];
      };
      const filtres: ((l: Ligne) => boolean)[] = [];
      let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let charge: Ligne | Ligne[] = {};

      const executer = () => {
        if (action === 'insert') {
          const neuves = (Array.isArray(charge) ? charge : [charge]).map((l) => {
            const numero = base.suivant;
            base.suivant += 1;
            return {
              id: `${table}-${numero}`,
              ...(table === 'commandes' ? { jeton_suivi: `jeton-${numero}` } : {}),
              ...l,
            };
          });
          lignes().push(...neuves);
          return { data: neuves, error: null };
        }
        const visees = lignes().filter((l) => filtres.every((f) => f(l)));
        if (action === 'update') {
          for (const l of visees) Object.assign(l, charge);
          return { data: visees, error: null };
        }
        if (action === 'delete') {
          base.tables[table] = lignes().filter((l) => !visees.includes(l));
          return { data: visees, error: null };
        }
        return { data: visees, error: null };
      };

      const chaine: Record<string, unknown> = {
        select: () => chaine,
        insert: (l: Ligne | Ligne[]) => {
          action = 'insert';
          charge = l;
          return chaine;
        },
        update: (l: Ligne) => {
          action = 'update';
          charge = l;
          return chaine;
        },
        delete: () => {
          action = 'delete';
          return chaine;
        },
        eq: (col: string, v: unknown) => {
          filtres.push((l) => l[col] === v);
          return chaine;
        },
        is: (col: string, v: unknown) => {
          filtres.push((l) => (l[col] ?? null) === v);
          return chaine;
        },
        // Le panier en cours du client : aucun dans ces scenarios.
        or: () => {
          filtres.push(() => false);
          return chaine;
        },
        order: () => chaine,
        limit: () => chaine,
        maybeSingle: async () => ({ data: executer().data[0] ?? null, error: null }),
        single: async () => ({ data: executer().data[0] ?? null, error: null }),
        then: (resoudre: (v: unknown) => unknown) => resoudre(executer()),
      };
      return chaine;
    },
  }),
}));

async function appeler(corps: Record<string, unknown>) {
  const { POST } = await import('@/app/api/commandes/sync/route');
  const rep = await POST(
    new Request('https://www.djiguiflow.com/api/commandes/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-secret': SECRET },
      body: JSON.stringify(corps),
    }),
  );
  return { statut: rep.status, corps: (await rep.json()) as Record<string, unknown> };
}

const commande = (reference: string) =>
  base.tables.commandes.find((c) => c.reference === reference);

const APPEL = {
  boutique_id: BOUTIQUE,
  customer_name: 'Kouassi Jean',
  phone: '0102918886',
  address: 'Cocody',
  canal: 'whatsapp',
  chat_id: '2250102918886',
  confirmation_demandee: '1',
};

beforeEach(() => {
  vi.resetModules();
  process.env.SYNC_SECRET = SECRET;
  base.suivant = 1;
  base.tables = {
    commandes: [],
    commande_items: [],
    boutiques: [{ id: BOUTIQUE, slug: 'zahara', mode_recuperation: 'livraison' }],
    produits: [
      { boutique_id: BOUTIQUE, nom: 'Attiéké poisson', prix: 2500 },
      { boutique_id: BOUTIQUE, nom: 'Jus de bissap', prix: 500 },
    ],
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.SYNC_SECRET;
  vi.restoreAllMocks();
});

describe('le total est celui du catalogue', () => {
  it('IGNORE le total dicte quand toutes les lignes sont au catalogue', async () => {
    const { statut } = await appeler({
      ...APPEL,
      reference: 'ZAH-A',
      items: [
        { nom: 'Attieke poisson', quantite: 2 },
        { nom: 'Jus de bissap', quantite: 1 },
      ],
      total_price: 500, // « j'ai un code promo »
    });
    expect(statut).toBe(200);
    expect(commande('ZAH-A')?.total).toBe(5500);
  });

  it('corrige aussi un total dicte TROP HAUT', async () => {
    await appeler({
      ...APPEL,
      reference: 'ZAH-B',
      items: [{ nom: 'Jus de bissap', quantite: 1 }],
      total_price: 90000,
    });
    expect(commande('ZAH-B')?.total).toBe(500);
  });

  it('avec un article inconnu : garde le total annonce, jamais SOUS les lignes connues', async () => {
    const items = [
      { nom: 'Attieke poisson', quantite: 2 },
      { nom: 'Plat du chef', quantite: 1 },
    ];

    await appeler({ ...APPEL, reference: 'ZAH-C', items, total_price: 100 });
    expect(commande('ZAH-C')?.total).toBe(5000);

    await appeler({ ...APPEL, reference: 'ZAH-D', items, total_price: 8000 });
    expect(commande('ZAH-D')?.total).toBe(8000);
  });

  it('un appel SANS articles ne remet pas un total libre sur une commande composee', async () => {
    await appeler({
      ...APPEL,
      reference: 'ZAH-E',
      items: [{ nom: 'Attieke poisson', quantite: 1 }],
      total_price: 2500,
    });
    await appeler({ ...APPEL, reference: 'ZAH-E', total_price: 50 });
    expect(commande('ZAH-E')?.total).toBe(2500);
  });
});

describe('un client n’ecrit pas dans la commande d’un autre client', () => {
  const VICTIME = {
    id: 'cmd-victime',
    reference: 'ZAH-VICTIME',
    boutique_id: BOUTIQUE,
    statut: 'en_attente',
    nom_livreur: '',
    chat_id: '2250707070707',
    client_nom: 'Awa',
    client_telephone: '0707070707',
    client_adresse: 'Marcory',
    total: 4000,
    jeton_suivi: 'jeton-de-la-victime',
    mode_recuperation: 'livraison',
  };

  it('la commande visee n’est PAS reecrite, et son jeton ne sort pas', async () => {
    base.tables.commandes.push({ ...VICTIME });

    const { statut, corps } = await appeler({
      ...APPEL, // un AUTRE chat_id que celui de la victime
      reference: 'ZAH-VICTIME',
      items: [{ nom: 'Jus de bissap', quantite: 1 }],
      total_price: 500,
    });

    expect(statut).toBe(200);

    const victime = commande('ZAH-VICTIME');
    expect(victime?.client_nom).toBe('Awa');
    expect(victime?.client_telephone).toBe('0707070707');
    expect(victime?.client_adresse).toBe('Marcory');
    expect(victime?.total).toBe(4000);

    expect(corps.jeton_suivi).not.toBe('jeton-de-la-victime');
    expect(corps.reference).not.toBe('ZAH-VICTIME');
    expect(base.tables.commandes).toHaveLength(2);
  });

  it('le MEME client, lui, continue d’ecrire dans sa commande', async () => {
    base.tables.commandes.push({ ...VICTIME, chat_id: '0102918886' });

    const { corps } = await appeler({
      ...APPEL, // 2250102918886 : le meme abonne, sous une autre forme
      reference: 'ZAH-VICTIME',
      address: 'Riviera 2',
    });

    expect(corps.reference).toBe('ZAH-VICTIME');
    expect(commande('ZAH-VICTIME')?.client_adresse).toBe('Riviera 2');
    expect(base.tables.commandes).toHaveLength(1);
  });
});
