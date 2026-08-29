import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creerSession, etatSession } from '@/lib/wasenderSessions';

/**
 * L'ouverture d'une ligne WhatsApp — et ce qu'elle coûte quand elle rate mal.
 *
 * ── CE QUE CE FICHIER PROTÈGE ──────────────────────────────────────────────
 *
 * Chaque session occupe une place d'un forfait plafonné et se paie tous les
 * mois. Les échecs ne se valent donc pas :
 *
 *   - le PLAFOND atteint n'est pas une panne. Le marchand n'y peut rien, et
 *     c'est l'exploitant qui doit décider d'ouvrir un second forfait. Le lui
 *     annoncer comme une erreur technique le ferait cliquer en boucle.
 *   - une RÉPONSE INCOMPLÈTE est le pire cas : la session existe déjà chez le
 *     fournisseur — la place est consommée — mais sans ses deux clés elle
 *     n'envoie rien et ne reçoit rien. La taire laisserait un marchand
 *     persuadé d'être branché, et une place perdue que personne ne saurait
 *     retrouver.
 *
 * ── CE QU'ON NE MONTRE JAMAIS ──────────────────────────────────────────────
 *
 * Aucun corps d'erreur du fournisseur ne remonte à l'écran. Le marchand lit
 * une phrase qui lui dit quoi faire ; le détail part au journal.
 */

const appels: { url: string; init: RequestInit }[] = [];

function repondre(statut: number, corps: unknown) {
  return Promise.resolve({
    ok: statut >= 200 && statut < 300,
    status: statut,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  } as Response);
}

const CREATION = {
  nom: 'Boutique du test',
  telephone: '2250700000000',
  webhookUrl: 'https://n8n.example/webhook/abc/whatsapp/boutique-du-test',
};

beforeEach(() => {
  appels.length = 0;
  process.env.WASENDER_ACCOUNT_TOKEN = 'jeton-de-compte';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WASENDER_ACCOUNT_TOKEN;
});

function simuler(reponse: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    appels.push({ url: String(url), init });
    return reponse(String(url));
  });
}

describe('sans jeton de compte, on n’appelle personne', () => {
  /**
   * Le jeton vit dans les variables d'environnement. S'il manque — nouvelle
   * instance, variable oubliée après un déploiement — il ne faut NI appeler,
   * NI laisser croire à une panne du fournisseur.
   */
  it('refuse avant tout appel réseau', async () => {
    delete process.env.WASENDER_ACCOUNT_TOKEN;
    simuler(() => repondre(200, {}));

    const r = await creerSession(CREATION);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toBe('sans_jeton');
    expect(appels, 'un appel est parti sans jeton').toEqual([]);
  });
});

describe('le plafond du forfait n’est pas une panne', () => {
  it.each([
    ['un 402', 402, 'Payment required'],
    ['un message de limite', 400, { message: 'Session limit reached for your plan' }],
    ['un message d’abonnement', 403, { error: 'subscription does not allow more sessions' }],
  ])('%s se dit au marchand comme une attente', async (_cas, statut, corps) => {
    simuler(() => repondre(statut, corps));

    const r = await creerSession(CREATION);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motif).toBe('plafond');
      // Il doit lire qu'on le rappelle, pas un code d'erreur.
      expect(r.message).toMatch(/rappel/i);
      expect(r.message).not.toMatch(/error|limit|subscription|40\d/i);
    }
  });

  it('un refus ordinaire reste un refus, pas un plafond', async () => {
    simuler(() => repondre(500, { error: 'internal' }));

    const r = await creerSession(CREATION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toBe('refus');
  });
});

describe('une session créée mais inutilisable est un échec', () => {
  /**
   * LE CAS QUI COÛTE LE PLUS CHER.
   *
   * Le fournisseur a créé la session — la place est prise — mais sa réponse
   * n'apporte pas les deux clés. Rendre « ok » ici laisserait un marchand
   * persuadé d'être branché, et une place payée tous les mois pour rien.
   */
  it.each([
    ['sans clé d’envoi', { id: 12, webhook_secret: 's3cr3t' }],
    ['sans secret d’entrée', { id: 12, api_key: 'k3y' }],
    ['sans identifiant', { api_key: 'k3y', webhook_secret: 's3cr3t' }],
  ])('%s', async (_cas, data) => {
    simuler(() => repondre(200, { success: true, data }));

    const r = await creerSession(CREATION);
    expect(r.ok, 'une session inutilisable a été acceptée').toBe(false);
    if (!r.ok) expect(r.motif).toBe('reponse_illisible');
  });
});

describe('le cas nominal', () => {
  it('rend les trois valeurs, et déclare le webhook À LA CRÉATION', async () => {
    simuler(() => repondre(200, {
      success: true,
      data: { id: 42, api_key: 'cle-envoi', webhook_secret: 'secret-entree', status: 'need_scan' },
    }));

    const r = await creerSession(CREATION);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session).toEqual({
        id: '42',
        apiKey: 'cle-envoi',
        webhookSecret: 'secret-entree',
      });
    }

    /**
     * LE WEBHOOK PART DANS LA MÊME REQUÊTE, ET C'EST DÉLIBÉRÉ.
     *
     * Le déclarer après coup laisserait une fenêtre pendant laquelle la
     * session existe et n'écoute rien : le marchand scannerait son QR,
     * croirait avoir fini, et ne recevrait aucun message.
     */
    const corps = JSON.parse(String(appels[0].init.body));
    expect(corps.webhook_url).toBe(CREATION.webhookUrl);
    expect(corps.webhook_enabled).toBe(true);
    expect(corps.webhook_events).toContain('messages.upsert');

    // On ne fait pas tourner le routeur pour des accusés d'envoi : chaque
    // exécution se paie.
    expect(corps.webhook_events).toHaveLength(1);
  });
});

describe('l’état parle la langue du marchand', () => {
  it.each([
    ['connected', 'connectee'],
    ['CONNECTED', 'connectee'],
    ['need_scan', 'a_scanner'],
    ['disconnected', 'a_scanner'],
    ['', 'inconnu'],
  ])('« %s » devient « %s »', async (brut, attendu) => {
    simuler(() => repondre(200, { data: { id: 42, status: brut } }));

    const r = await etatSession('42');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.etat).toBe(attendu);
  });

  /**
   * UNE LECTURE RATÉE N'EST PAS UN BRANCHEMENT RATÉ.
   *
   * Si le fournisseur ne répond pas, on ne doit pas afficher « pas connecté » :
   * le marchand recommencerait une manœuvre déjà faite, et pourrait consommer
   * une seconde place.
   */
  it('un fournisseur injoignable ne dit pas « pas connecté »', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('socket hang up')));

    const r = await etatSession('42');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toBe('injoignable');
  });
});
