import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le repli plateforme ne porte plus un message AU CLIENT.
 *
 * CE QU'IL PRODUISAIT. `envoyerMessage` retombait sur le jeton de la plateforme
 * quand le marchand n'avait pas le sien, et rendait `ok: true`. Neuf appelants
 * sur dix ne lisaient que `ok`. Mesure le 22 aout 2026 : une des deux boutiques
 * en service a Telegram mais PAS WhatsApp — ses clients recevaient donc leurs
 * mises a jour depuis le numero WhatsApp de DjiguiFlow.
 *
 * Un numero inconnu qui ecrit au sujet de votre commande, c'est la forme exacte
 * d'une arnaque. Et le risque de bannissement se mutualise : une seule session
 * portant les clients de tous les marchands non branches les fait tomber
 * ensemble.
 *
 * LA PLATEFORME GARDE LE DROIT DE PARLER AUX SIENS. Le gerant et les livreurs
 * la connaissent, ils sont venus par elle. Ces deux cas restent ouverts, et
 * c'est ce que la moitie de ces tests protege — fermer trop large priverait un
 * marchand non branche de ses propres alertes de commande.
 */

const etats = vi.hoisted(() => ({
  jetonMarchand: null as string | null,
  fiche: { telegram_marchand: '', groupe_livreurs: '', telephone: '' } as Record<string, string>,
  requetes: [] as string[],
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: etats.fiche, error: null }) }),
      }),
    }),
    rpc: async () => ({ data: etats.jetonMarchand, error: null }),
  }),
}));

const { envoyerMessage } = await import('@/lib/canaux');

beforeEach(() => {
  etats.jetonMarchand = null; // le marchand n'a PAS son jeton : on est en repli
  etats.fiche = {
    telegram_marchand: '-100999',
    groupe_livreurs: '-100888',
    telephone: '0700000001',
  };
  etats.requetes = [];
  process.env.TELEGRAM_BOT_TOKEN = 'JETON-PLATEFORME';
  process.env.WASENDER_API_KEY = 'CLE-PLATEFORME';
  vi.stubGlobal('fetch', async (url: string) => {
    etats.requetes.push(String(url));
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  });
});

afterEach(() => vi.unstubAllGlobals());

const envoyer = (destinataire: string, canal: 'whatsapp' | 'telegram' = 'telegram') =>
  envoyerMessage({ boutique: 'une-boutique', canal, destinataire, message: 'Bonjour' });

describe('quand la boutique n a pas son propre jeton', () => {
  // LE TEST QUI PORTE LA DECISION.
  it('REFUSE un message au client, et n envoie rien', async () => {
    const r = await envoyer('2250700000099');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.statut).toBe(424);
    expect(etats.requetes).toHaveLength(0);
  });

  it('dit pourquoi, en nommant la boutique', async () => {
    const r = await envoyer('2250700000099');
    expect(r.ok === false && r.raison).toContain('une-boutique');
    expect(r.ok === false && r.raison).toContain('client');
  });

  // L'AUTRE MOITIE DE LA DECISION : fermer trop large priverait un marchand non
  // branche de ses propres alertes de commande.
  it('laisse passer un message AU GERANT', async () => {
    const r = await envoyer('-100999');
    expect(r.ok).toBe(true);
    expect(r.ok && r.via).toBe('plateforme');
  });

  it('laisse passer un message AU GROUPE DES LIVREURS', async () => {
    const r = await envoyer('-100888');
    expect(r.ok).toBe(true);
  });

  // Le numero du gerant peut etre note avec ou sans indicatif. Sans cette
  // comparaison sur les chiffres, « 0700000001 » et « 2250700000001 »
  // passeraient pour deux personnes, et le gerant perdrait ses alertes.
  it('reconnait le gerant meme avec un indicatif different', async () => {
    const r = await envoyer('2250700000001', 'whatsapp');
    expect(r.ok).toBe(true);
  });
});

describe('quand la boutique a son propre jeton', () => {
  it('rien ne change : le client est servi', async () => {
    etats.jetonMarchand = 'JETON-DU-MARCHAND';
    const r = await envoyer('2250700000099');
    expect(r.ok).toBe(true);
    expect(r.ok && r.via).toBe('marchand');
    expect(etats.requetes[0]).toContain('JETON-DU-MARCHAND');
  });
});
