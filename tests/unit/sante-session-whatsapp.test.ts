import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { santeSessionWhatsApp } from '@/lib/wasenderSessions';

/**
 * « Le canal que le produit vend répond-il encore ? »
 *
 * ── CE QUE CES TESTS FERMENT ───────────────────────────────────────────────
 *
 * Aucune boutique ne porte de session WhatsApp à elle : tout passe par le
 * numéro de la plateforme. Ce canal n'avait AUCUN contrôle de santé — une
 * session tombée ne se serait vue que par un client resté sans réponse.
 *
 * ── LES DEUX SENS, ET LE SECOND COMPTE AUTANT ──────────────────────────────
 *
 * Trop laxiste, une session morte passe inaperçue et la plateforme se tait
 * pendant que des clients écrivent dans le vide.
 *
 * Trop bavard, on réveille l'exploitant pour un `fetch` manqué — et c'est
 * arrivé : la sonde de veille a annoncé « n8n injoignable » alors qu'il
 * tournait. Une alerte fausse coûte deux fois, le dérangement puis la
 * défiance envers toutes les suivantes.
 *
 * D'où le test le plus important du fichier : **un réseau qui tombe rend
 * `indetermine`, jamais `deconnectee`.**
 */

const CLE = 'wasender_test_key';

/** Une réponse HTTP de synthèse, pour n'éprouver que notre lecture. */
const reponse = (corps: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corps,
  }) as unknown as Response;

let original: string | undefined;

beforeEach(() => {
  original = process.env.WASENDER_API_KEY;
  process.env.WASENDER_API_KEY = CLE;
});

afterEach(() => {
  if (original === undefined) delete process.env.WASENDER_API_KEY;
  else process.env.WASENDER_API_KEY = original;
  vi.unstubAllGlobals();
});

describe('quand la session repond', () => {
  it('« connected » vaut connectee', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ status: 'connected' })));
    expect(await santeSessionWhatsApp(CLE)).toEqual({ etat: 'connectee' });
  });

  it('la reponse peut etre enveloppee dans `data`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ data: { status: 'CONNECTED' } })));
    expect(await santeSessionWhatsApp(CLE)).toEqual({ etat: 'connectee' });
  });

  it('tout autre statut est une deconnexion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ status: 'disconnected' })));
    expect(await santeSessionWhatsApp(CLE)).toMatchObject({ etat: 'deconnectee' });
  });
});

describe('quand la cle ne vaut plus rien', () => {
  it('UN 401 EST UNE PANNE, PAS UN DOUTE — c est l abonnement echu', async () => {
    const appel = vi.fn(async () => reponse({}, 401));
    vi.stubGlobal('fetch', appel);

    expect(await santeSessionWhatsApp(CLE)).toMatchObject({ etat: 'deconnectee' });
    // Et on ne reessaie pas : un refus d authentification ne devient pas un
    // accord au second essai.
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('un jeton vide se dit, au lieu de passer pour une session saine', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse({ status: 'connected' })));
    expect(await santeSessionWhatsApp('  ')).toEqual({ etat: 'sans_jeton' });
  });
});

describe('quand le reseau tombe', () => {
  it(
    'UN RESEAU INJOIGNABLE REND `indetermine`, JAMAIS `deconnectee`',
    async () => {
      const appel = vi.fn(async () => {
        throw new Error('ECONNRESET');
      });
      vi.stubGlobal('fetch', appel);

      const r = await santeSessionWhatsApp(CLE);

      // Le coeur du fichier : on ne transforme pas un doute en certitude.
      expect(r.etat).toBe('indetermine');
      expect(r.etat).not.toBe('deconnectee');
      expect(appel).toHaveBeenCalledTimes(2);
    },
    10_000,
  );

  it(
    'un hoquet passager ne reveille personne : le second essai tranche',
    async () => {
      let n = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          n += 1;
          if (n === 1) throw new Error('ETIMEDOUT');
          return reponse({ status: 'connected' });
        }),
      );

      expect(await santeSessionWhatsApp(CLE)).toEqual({ etat: 'connectee' });
      expect(n).toBe(2);
    },
    10_000,
  );
});
