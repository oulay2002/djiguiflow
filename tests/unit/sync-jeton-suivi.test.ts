import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/commandes/sync` doit rendre le jeton de suivi, sur CHAQUE succes.
 *
 * CE QUI ETAIT CASSE, mesure le 24 aout 2026 sur une vraie commande.
 * « Confirmation Client » compose le lien envoye au client :
 *
 *     …/api/confirmation?ref={{ … }}{{ $json.jeton_suivi ? '&t=' + … : '' }}
 *
 * Or la commande N'EXISTE PAS ENCORE quand ce lien est compose : c'est cette
 * route-ci qui l'insere, et le jeton nait de la valeur par defaut de la
 * colonne, a l'insertion. L'assistante ne pouvait donc pas le connaitre.
 * Le ternaire rendait la chaine vide EN SILENCE, et depuis la bascule en
 * phase 4 la route de confirmation refuse un lien sans jeton : le client
 * recevait « Commande introuvable — Vérifiez le lien reçu ».
 *
 * Personne ne pouvait plus confirmer sur tout le chemin de l'assistante,
 * WhatsApp comme Telegram — le chemin principal.
 *
 * POURQUOI LE TEST PORTE SUR *TOUTES* LES SORTIES 200. Un champ present sur
 * une sortie et absent sur une autre reproduit exactement le defaut : le
 * consommateur ne sait pas laquelle il a recue, et se rabat en silence sur la
 * chaine vide. C'est le motif de `defaut-silencieux`.
 */

const JETON = '265df28afab84cfe8e688919419d11f6';
const SECRET = 'secret-de-banc';

const etats = vi.hoisted(() => ({
  // La commande existe-t-elle deja ? Faux => chemin INSERT.
  existeDeja: false,
  inserees: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/marchands', () => ({ prefixeReference: () => 'ZAH' }));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'commandes') {
        // `commande_items`, `produits`, `boutiques` : rien a prouver ici.
        const muet: Record<string, unknown> = {};
        const chaine = {
          select: () => chaine,
          delete: () => chaine,
          insert: async () => ({ error: null }),
          eq: () => chaine,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (r: (v: unknown) => void) => r({ data: [], error: null }),
        };
        Object.assign(muet, chaine);
        return chaine;
      }

      let colonnes = '';
      const chaine = {
        select: (c?: string) => { colonnes = String(c ?? ''); return chaine; },
        insert: async (ligne: Record<string, unknown>) => {
          etats.inserees.push(ligne);
          return { error: null };
        },
        update: () => chaine,
        eq: () => chaine,
        is: () => chaine,
        maybeSingle: async () => {
          // La relecture qui suit l'ecriture : c'est elle qui porte le jeton.
          if (colonnes.includes('jeton_suivi')) {
            return { data: { id: 'cmd-1', jeton_suivi: JETON }, error: null };
          }
          // Les deux sondes d'existence, en tete de route.
          if (!etats.existeDeja) return { data: null, error: null };
          return { data: { reference: 'ZAH-1', statut: 'en_attente', nom_livreur: '' }, error: null };
        },
        then: (r: (v: unknown) => void) => r({ error: null }),
      };
      return chaine;
    },
  }),
}));

async function appeler(corps: Record<string, unknown>) {
  const { POST } = await import('@/app/api/commandes/sync/route');
  const req = new Request('https://www.djiguiflow.com/api/commandes/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-secret': SECRET },
    body: JSON.stringify(corps),
  });
  const rep = await POST(req);
  return { statut: rep.status, corps: await rep.json() };
}

const COMMANDE = {
  reference: 'ZAH-1787573151243-934',
  boutique_id: '11111111-1111-1111-1111-111111111111',
  customer_name: 'Kouassi jean claude',
  phone: '0102918886',
  address: 'Cocody',
  total_price: 3000,
  canal: 'whatsapp',
  items: 'Attieke poisson',
  confirmation_demandee: '1',
};

beforeEach(() => {
  vi.resetModules();
  process.env.SYNC_SECRET = SECRET;
  etats.existeDeja = false;
  etats.inserees = [];
});

afterEach(() => {
  delete process.env.SYNC_SECRET;
});

describe('le jeton de suivi rendu par /api/commandes/sync', () => {
  it('1. le rend a la CREATION — le cas du lien de confirmation', async () => {
    const { statut, corps } = await appeler(COMMANDE);
    expect(statut).toBe(200);
    expect(corps.ok).toBe(true);
    expect(corps.jeton_suivi).toBe(JETON);
  });

  it('2. le rend AUSSI quand il n\'y a rien a mettre a jour', async () => {
    // Sortie anticipee : sans le jeton, elle rouvrirait le defaut pour
    // l'appelant qui tombe dessus.
    etats.existeDeja = true;
    const { statut, corps } = await appeler({
      reference: COMMANDE.reference,
      boutique_id: COMMANDE.boutique_id,
    });
    expect(statut).toBe(200);
    expect(corps.jeton_suivi).toBe(JETON);
  });

  it('3. ne le rend a personne sans le secret', async () => {
    const { POST } = await import('@/app/api/commandes/sync/route');
    const req = new Request('https://www.djiguiflow.com/api/commandes/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(COMMANDE),
    });
    const rep = await POST(req);
    expect(rep.status).toBe(401);
    expect(JSON.stringify(await rep.json())).not.toContain(JETON);
  });
});
