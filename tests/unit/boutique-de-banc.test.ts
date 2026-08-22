import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le detournement de la boutique de banc.
 *
 * CE QU'IL PROTEGE. `essai = true` coupe la chaine avant n8n : c'est ce qui
 * rend le banc multi-marchand supportable, et c'est aussi pourquoi la moitie du
 * parcours qui atteint le client et le livreur n'etait exercee par rien. La
 * boutique de banc laisse la chaine s'executer en entier et ne change que le
 * dernier metre.
 *
 * Le test le plus important est NEGATIF : une boutique de banc ne doit JAMAIS
 * pouvoir ecrire a un vrai destinataire. Si `TELEGRAM_ALERTE_TOKEN` manque,
 * l'envoi doit ECHOUER — retomber sur le chemin normal enverrait le message a
 * la vraie personne, ce qui est exactement ce que ce dispositif existe pour
 * empecher.
 */

const etats = vi.hoisted(() => ({
  salon: null as string | null,
  jetonMarchand: 'JETON-DU-MARCHAND',
  appelsRpc: [] as string[],
  requetes: [] as { url: string; corps: Record<string, unknown> }[],
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { banc_telegram_id: etats.salon }, error: null }),
        }),
      }),
    }),
    rpc: async (nom: string) => {
      etats.appelsRpc.push(nom);
      return { data: etats.jetonMarchand, error: null };
    },
  }),
}));

const { envoyerMessage, messageDeBanc } = await import('@/lib/canaux');

beforeEach(() => {
  etats.salon = null;
  etats.appelsRpc = [];
  etats.requetes = [];
  process.env.TELEGRAM_ALERTE_TOKEN = 'JETON-DE-VEILLE';

  vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
    etats.requetes.push({ url: String(url), corps: JSON.parse(init?.body ?? '{}') });
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_ALERTE_TOKEN;
});

const envoi = () =>
  envoyerMessage({
    boutique: 'banc-chaine',
    canal: 'whatsapp',
    destinataire: '0700000000',
    message: 'Votre commande est acceptee.',
  });

describe("l'en-tete du message de banc", () => {
  it('nomme le canal et le destinataire reels', () => {
    const m = messageDeBanc('whatsapp', '0700000000', 'Bonjour');
    expect(m).toContain('whatsapp');
    expect(m).toContain('0700000000');
    expect(m).toContain('Bonjour');
  });

  // Sans destinataire on lirait un message sans savoir qu'il n'allait nulle
  // part — un envoi vide se lit alors comme un envoi reussi.
  it('le dit quand le destinataire est vide', () => {
    expect(messageDeBanc('telegram', '', 'Bonjour')).toContain('(destinataire vide)');
  });
});

describe('une boutique de banc', () => {
  beforeEach(() => {
    etats.salon = '-1009999999999';
  });

  it('detourne vers le salon, jamais vers le destinataire', async () => {
    const r = await envoi();
    expect(r.ok).toBe(true);
    expect(etats.requetes).toHaveLength(1);
    expect(etats.requetes[0].corps.chat_id).toBe('-1009999999999');
    expect(String(etats.requetes[0].corps.text)).toContain('0700000000');
  });

  it('part par le bot de veille, pas par le jeton du marchand', async () => {
    await envoi();
    expect(etats.requetes[0].url).toContain('JETON-DE-VEILLE');
    expect(etats.requetes[0].url).not.toContain('JETON-DU-MARCHAND');
  });

  // Une boutique de banc n'a aucun canal branche, et c'est voulu : aucune
  // erreur de configuration ne doit pouvoir la faire ecrire a quelqu'un.
  it('ne cherche meme pas le jeton du marchand', async () => {
    await envoi();
    expect(etats.appelsRpc).toHaveLength(0);
  });

  it("dit 'plateforme' dans `via`, parce que c'est le bot de veille qui a servi", async () => {
    const r = await envoi();
    expect(r.ok && r.via).toBe('plateforme');
  });

  // LE TEST QUI COMPTE LE PLUS. Sans jeton de veille, il ne doit RIEN partir.
  it('echoue plutot que de retomber sur le chemin normal', async () => {
    delete process.env.TELEGRAM_ALERTE_TOKEN;
    const r = await envoi();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.statut).toBe(424);
    expect(etats.requetes).toHaveLength(0);
    expect(etats.appelsRpc).toHaveLength(0);
  });
});

describe('une boutique reelle', () => {
  // Le jeton wasender voyage en EN-TETE, pas dans l'URL — contrairement a
  // Telegram. On verifie donc le fournisseur atteint, qui est la vraie
  // question : un envoi WhatsApp ne doit pas finir chez Telegram.
  it("n'est pas detournee et part chez son fournisseur", async () => {
    etats.salon = null;
    const r = await envoi();
    expect(r.ok).toBe(true);
    expect(etats.appelsRpc).toContain('jeton_canal');
    expect(etats.requetes[0].url).toContain('wasenderapi.com');
    expect(etats.requetes[0].url).not.toContain('api.telegram.org');
  });

  // Une colonne vide ou faite d'espaces n'est pas une destination.
  it("n'est pas detournee par une valeur vide", async () => {
    etats.salon = '   ';
    await envoi();
    expect(etats.appelsRpc).toContain('jeton_canal');
  });
});
