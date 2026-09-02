import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le garde du branchement WhatsApp — les deux cotes.
 *
 * ── CE QU'IL PROTEGE ───────────────────────────────────────────────────────
 *
 * Chaque session occupe une place d'un forfait PLAFONNE et se paie tous les
 * mois. Un second branchement sur une boutique deja branchee consomme une
 * place de plus, laisse la premiere orpheline, et ne se decouvre que sur la
 * facture — ou le jour ou il manque une place devant un marchand qui attend.
 *
 * ── LA COLONNE N'EST PAS LE FAIT ───────────────────────────────────────────
 *
 * `wasender_session_id` dit COMMENT une boutique a ete branchee, pas SI elle
 * l'est. Zahara porte un jeton au coffre et aucune colonne : elle a ete
 * branchee a la main, avant que le libre-service n'existe. Un garde qui lit la
 * colonne ne la voit pas.
 *
 * Ce cas etait tenu dans le POST depuis le 1er septembre 2026, et pas dans le
 * GET — qui alimente pourtant l'ecran ou le marchand attend. L'ecran disait
 * « non branche » et l'action refusait de brancher. Ce banc tient les deux, et
 * il n'existait pas : le correctif du POST etait parti sans aucun test.
 */

const etat = vi.hoisted(() => ({
  boutique: null as Record<string, unknown> | null,
  jeton: '',
  erreurCoffre: null as { message: string } | null,
  creations: 0,
}));

vi.mock('@/lib/dashboardAuth', () => ({
  exigerAccesMarchand: async () => ({ ok: true, marchand: { boutiqueId: 'b-1' } }),
}));

vi.mock('@/lib/alerteExploitant', () => ({ prevenirExploitant: async () => {} }));

vi.mock('@/lib/wasenderSessions', () => ({
  creerSession: async () => {
    etat.creations += 1;
    return { ok: true, session: { id: 'sess-neuve', apiKey: 'cle', webhookSecret: 'secret' } };
  },
  etatSession: async () => ({ ok: true, etat: 'connectee', brut: 'connected' }),
  qrDeSession: async () => ({ ok: true, qr: 'data:image/png;base64,zzz' }),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chaine: Record<string, unknown> = {
        select: () => chaine,
        update: () => chaine,
        eq: () => chaine,
        maybeSingle: async () => ({ data: etat.boutique, error: null }),
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(ok),
      };
      return chaine;
    },
    rpc: async (nom: string) =>
      nom === 'jeton_canal'
        ? { data: etat.jeton, error: etat.erreurCoffre }
        : { data: null, error: null },
  }),
}));

const URL_BASE = 'https://www.djiguiflow.com/api/dashboard/canaux/whatsapp?boutique_id=b-1';

async function appeler(methode: 'GET' | 'POST') {
  const mod = await import('@/app/api/dashboard/canaux/whatsapp/route');
  const rep = await (methode === 'GET' ? mod.GET : mod.POST)(
    new Request(URL_BASE, { method: methode }),
  );
  return { statut: rep.status, corps: await rep.json() };
}

beforeEach(() => {
  vi.resetModules();
  etat.boutique = {
    id: 'b-1',
    slug: 'zahara',
    nom: 'Zahara',
    telephone: '0102918886',
    wasender_secret_id: null,
    wasender_session_id: null,
  };
  etat.jeton = '';
  etat.erreurCoffre = null;
  etat.creations = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('l ecran — GET', () => {
  it('LE CAS ZAHARA : un jeton au coffre, aucune colonne, et l ecran dit CONNECTEE', () => {
    etat.jeton = 'cle-de-session';
    return appeler('GET').then(({ corps }) => {
      expect(corps.etat).toBe('connectee');
    });
  });

  it('temoin : sans jeton ni colonne, il dit bien ABSENTE', async () => {
    // Sans ce cas, une route cassee qui repondrait toujours « connectee »
    // passerait le test precedent sans rien prouver.
    const { corps } = await appeler('GET');
    expect(corps.etat).toBe('absente');
  });

  it('une colonne remplie passe par l etat de la session, comme avant', async () => {
    etat.boutique = { ...etat.boutique, wasender_session_id: 'sess-42' };
    const { corps } = await appeler('GET');
    expect(corps.etat).toBe('connectee');
  });

  it('un coffre en panne ne fait pas dire « connectee » a tort', async () => {
    // On rend « absente » : le pire cas redevient l'ancien comportement, et
    // l'idempotence du POST reste le vrai garde-fou contre la seconde place.
    etat.erreurCoffre = { message: 'coffre indisponible' };
    const { corps } = await appeler('GET');
    expect(corps.etat).toBe('absente');
  });
});

describe('l action — POST, et c est une question d argent', () => {
  it('n ouvre PAS de seconde ligne a une boutique branchee a la main', async () => {
    etat.jeton = 'cle-de-session';
    const { corps } = await appeler('POST');
    expect(corps.etat).toBe('connectee');
    // Le coeur du test : une place de plus, facturee tous les mois, et la
    // premiere devenue orpheline.
    expect(etat.creations).toBe(0);
  });

  it('temoin : une boutique reellement non branchee obtient bien sa ligne', async () => {
    // Sans lui, « ne cree pas » serait vrai d'une route qui ne cree jamais.
    const { corps } = await appeler('POST');
    expect(etat.creations).toBe(1);
    expect(corps.etat).toBe('connectee');
  });

  it('n ouvre pas non plus de seconde ligne quand la colonne est remplie', async () => {
    etat.boutique = { ...etat.boutique, wasender_session_id: 'sess-42' };
    const { corps } = await appeler('POST');
    expect(etat.creations).toBe(0);
    expect(corps.etat).toBe('connectee');
  });
});
