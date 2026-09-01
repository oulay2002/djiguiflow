import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventaireSessions } from '@/lib/wasenderSessions';

/**
 * « Qu'est-ce que je paie chez wasender, et est-ce que ça répond ? »
 *
 * ── CE QU'ELLE VOIT QUE L'AUTRE SONDE NE VOIT PAS ──────────────────────────
 *
 * `santeSessionWhatsApp` interroge la session d'un marchand avec SON jeton :
 * elle dit si ses messages partent. Elle ne sait rien du compte — ni de
 * l'abonnement, ni des places facturées. Une session abandonnée, rattachée à
 * aucune boutique, lui est invisible et se paie tous les mois.
 *
 * ── LE PIÈGE QUE CES TESTS FERMENT ─────────────────────────────────────────
 *
 * Ce point d'entrée n'a jamais pu être appelé depuis un poste de
 * développement : le jeton de compte est marqué « Sensitive » chez Vercel,
 * donc illisible. **La forme de la réponse était inconnue à l'écriture.**
 *
 * D'où la règle que ces tests tiennent : une réponse illisible rend
 * `total: null`, JAMAIS `0`. Un zéro inventé se lirait « rien à payer » alors
 * que la vérité serait « je n'ai pas su lire » — le défaut silencieux, dans sa
 * forme la plus coûteuse puisqu'elle rassure.
 */

const reponse = (corps: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  }) as unknown as Response;

let original: string | undefined;

beforeEach(() => {
  original = process.env.WASENDER_ACCOUNT_TOKEN;
  process.env.WASENDER_ACCOUNT_TOKEN = 'compte_test';
});

afterEach(() => {
  if (original === undefined) delete process.env.WASENDER_ACCOUNT_TOKEN;
  else process.env.WASENDER_ACCOUNT_TOKEN = original;
  vi.unstubAllGlobals();
});

describe('ce que le compte declare', () => {
  it('compte les sessions et repere celles qui ne repondent pas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({
      data: [
        { id: 1, phone_number: '2250102030405', status: 'connected' },
        { id: 2, phone_number: '2250708091011', status: 'disconnected' },
      ],
    })));

    const r = await inventaireSessions();
    expect(r).toMatchObject({ ok: true, total: 2 });
    if (r.ok) {
      expect(r.deconnectees).toHaveLength(1);
      expect(r.deconnectees[0]).toContain('2250708091011');
    }
  });

  it('une liste toute connectee ne signale rien', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ data: [{ id: 1, status: 'CONNECTED' }] })));
    const r = await inventaireSessions();
    expect(r).toEqual({ ok: true, total: 1, deconnectees: [] });
  });
});

describe('quand la reponse est illisible', () => {
  it('UNE FORME INATTENDUE REND total: null, JAMAIS 0', async () => {
    // Le corps est un objet valide mais ne contient aucune liste : c'est le
    // cas le plus probable si l'API change de forme sans prevenir.
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ data: { autre: 'chose' } })));

    const r = await inventaireSessions();
    expect(r).toMatchObject({ ok: true, total: null });
    // Le coeur du fichier : zero voudrait dire « rien a payer », null dit
    // « je n ai pas su lire ». Les confondre rassure a tort.
    if (r.ok) expect(r.total).not.toBe(0);
  });
});

describe('les verdicts graves, qui ne dependent pas du corps', () => {
  it('un refus d authentification remonte comme `refus`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse('Unauthorized', 401)));
    expect(await inventaireSessions()).toEqual({ ok: false, motif: 'refus' });
  });

  it('une limite ou un abonnement en cause remonte comme `plafond`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse('subscription expired', 403)));
    expect(await inventaireSessions()).toEqual({ ok: false, motif: 'plafond' });
  });

  it('UN RESEAU TOMBE N EST PAS UN COMPTE MORT', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNRESET');
    }));
    // `injoignable` : la veille se tait dessus, deliberement.
    expect(await inventaireSessions()).toEqual({ ok: false, motif: 'injoignable' });
  });

  it('sans jeton de compte, on ne conclut rien', async () => {
    delete process.env.WASENDER_ACCOUNT_TOKEN;
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ data: [] })));
    expect(await inventaireSessions()).toEqual({ ok: false, motif: 'sans_jeton' });
  });
});
