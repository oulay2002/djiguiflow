import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/internal/commandes/fiche` doit rendre le jeton de suivi.
 *
 * POURQUOI CE TEST PLUTOT QU'UNE LEVEE DANS n8n. « Acceptation Livraison »
 * envoie au client « votre commande est en route » avec un lien de suivi. Le
 * jeton de ce lien vient d'ici, et de nulle part ailleurs.
 *
 * Sur le lien de CONFIRMATION, l'absence de jeton fait lever le workflow : la
 * message N'EST que le lien, donc pas de message vaut mieux qu'un lien mort.
 * ICI le compromis s'inverse. Le message annonce au client que sa commande
 * part ; le lien n'en est qu'une ligne. Lever priverait le client de
 * l'annonce — et bloquerait `Marquer client prevenu` — pour un defaut qui ne
 * concerne qu'une ligne de suivi. Le remede serait pire que le mal.
 *
 * La ligne de suivi DISPARAIT donc quand le jeton manque, plutot que de
 * partir cassee, et c'est ce test-ci qui garantit qu'elle ne disparaitra pas.
 * Le contrat est tenu en CI, pas au runtime chez le client.
 *
 * ⚠ Si l'on retire `jeton_suivi` du `select` ou de la sortie de cette route,
 * ce test tombe. C'est exactement son objet : le lien de suivi devient muet
 * sans que rien d'autre ne le dise.
 */

const SECRET = 'secret-de-banc';

// `vi.hoisted` remonte AVANT les const du module : le jeton doit naitre
// dedans, sinon la fixture le lit avant qu'il existe.
const hoiste = vi.hoisted(() => ({
  JETON: '265df28afab84cfe8e688919419d11f6',
  colonnes: '' as string,
  commande: {
    id: 'cmd-1',
    reference: 'ZAH-1787573151243-934',
    jeton_suivi: '265df28afab84cfe8e688919419d11f6',
    client_nom: 'Kouassi jean claude',
    client_telephone: '0102918886',
    client_adresse: 'Cocody',
    instructions: '',
    total: 3000,
    canal: 'whatsapp',
    chat_id: '2250102918886',
    statut: 'livree',
    statut_livraison: 'livre',
    nom_livreur: 'Jean Paul',
    frais_livraison: 1500,
    created_at: '2026-08-24T12:05:51Z',
  } as Record<string, unknown> | null,
}));

const etats = hoiste;
const JETON = hoiste.JETON;

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'commande_items') {
        const chaine = {
          select: () => chaine,
          eq: async () => ({ data: [], error: null }),
        };
        return chaine;
      }
      const chaine = {
        select: (c?: string) => { etats.colonnes = String(c ?? ''); return chaine; },
        eq: () => chaine,
        maybeSingle: async () => ({ data: etats.commande, error: null }),
      };
      return chaine;
    },
  }),
}));

async function appeler(corps: Record<string, unknown>, avecSecret = true) {
  const { POST } = await import('@/app/api/internal/commandes/fiche/route');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (avecSecret) headers['x-sync-secret'] = SECRET;
  const rep = await POST(
    new Request('https://www.djiguiflow.com/api/internal/commandes/fiche', {
      method: 'POST',
      headers,
      body: JSON.stringify(corps),
    }),
  );
  return { statut: rep.status, corps: await rep.json() };
}

beforeEach(() => {
  vi.resetModules();
  process.env.SYNC_SECRET = SECRET;
  etats.colonnes = '';
});

afterEach(() => {
  delete process.env.SYNC_SECRET;
});

describe('le jeton rendu par /api/internal/commandes/fiche', () => {
  it('1. le rend, et non vide — c\'est la seule source du lien de suivi', async () => {
    const { statut, corps } = await appeler({ order_id: 'ZAH-1787573151243-934' });
    expect(statut).toBe(200);
    expect(Array.isArray(corps)).toBe(true);
    expect(corps[0].jeton_suivi).toBe(JETON);
    expect(String(corps[0].jeton_suivi).length).toBeGreaterThan(0);
  });

  it('2. le demande explicitement a la base', async () => {
    // Le retirer du `select` rendrait la sortie vide sans casser la route :
    // le lien de suivi deviendrait muet, et rien d'autre ne le dirait.
    await appeler({ order_id: 'ZAH-1787573151243-934' });
    expect(etats.colonnes).toContain('jeton_suivi');
  });

  it('3. ne le rend a personne sans le secret', async () => {
    const { statut, corps } = await appeler({ order_id: 'ZAH-1' }, false);
    expect(statut).toBe(401);
    expect(JSON.stringify(corps)).not.toContain(JETON);
  });

  it('4. sur une commande inconnue, ne rend rien du tout', async () => {
    etats.commande = null;
    const { statut, corps } = await appeler({ order_id: 'INEXISTANTE' });
    expect(statut).toBe(200);
    expect(corps).toEqual([]);
  });
});
