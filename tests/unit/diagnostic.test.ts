import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urlWebhookTelegram, URL_ROUTEUR_TELEGRAM } from '@/lib/telegramBranchement';

/**
 * Les tests de « Tester ma boutique ».
 *
 * CE QU'ILS PROTEGENT EN PRIORITE. Le repli plateforme de `envoyerMessage`
 * rend `ok: true` avec le jeton de quelqu'un d'autre. Un diagnostic qui
 * l'ignore declare branchee une boutique dont aucun client ne peut ecrire —
 * la panne exacte que ce bouton existe pour tuer. Trois tests ci-dessous ne
 * servent qu'a cela, et ils echouent si l'on retire le controle sur `via`.
 *
 * Le second garde-fou est negatif : AUCUN message ne doit partir vers le
 * groupe des livreurs, jamais.
 */

const SLUG = 'boutique-test';

const etats = vi.hoisted(() => ({
  fiche: null as unknown,
  envoi: null as unknown,
  telegram: null as unknown,
  rafale: { depassee: false, attendreSecondes: 0 },
  plafond: { depasse: false, valeur: 1, indisponible: false } as {
    depasse: boolean;
    valeur: number | null;
    indisponible: boolean;
  },
  envoisFaits: [] as { canal: string; destinataire: string }[],
  appelsTelegram: [] as string[],
}));

vi.mock('@/lib/onboardingBoutique', () => ({
  ficheDuConnecte: async () => etats.fiche,
}));

vi.mock('@/lib/canaux', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/canaux')>();
  return {
    // La normalisation reste la vraie : c'est elle que le controle 1 mesure.
    normaliserTelephoneCI: vrai.normaliserTelephoneCI,
    envoyerMessage: async (p: { canal: string; destinataire: string }) => {
      etats.envoisFaits.push({ canal: p.canal, destinataire: p.destinataire });
      return (etats.envoi as (p: unknown) => unknown)(p);
    },
    interrogerTelegram: async (b: string, methode: string, params?: unknown) => {
      etats.appelsTelegram.push(methode);
      return (etats.telegram as (m: string, p?: unknown) => unknown)(methode, params);
    },
  };
});

vi.mock('@/lib/limiteur', () => ({
  rafaleDepassee: () => etats.rafale,
  plafondJournalierDepasse: async () => etats.plafond,
  secondesAvantMinuitAbidjan: () => 3600,
}));

const { POST } = await import('@/app/api/dashboard/boutique/diagnostic/route');

/** Une boutique dont tout est branche : le point de depart de chaque test. */
const boutiqueComplete = () => ({
  id: 'b-1',
  slug: SLUG,
  telephone: '2250759486701',
  telegram_marchand: '1724402569',
  groupe_livreurs: '-1004461402565',
  telegram_webhook_secret_hash: 'empreinte-telegram',
  webhook_secret_hash: 'empreinte-wasender',
});

/** Un client Supabase qui rend `n` articles disponibles. */
const sbAvecArticles = (n: number) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: async () => ({
            data: Array.from({ length: n }, (_, i) => ({ id: `p-${i}` })),
          }),
        }),
      }),
    }),
  }),
});

const telegramNominal =
  (surcharges: Record<string, unknown> = {}) =>
  (methode: string) => {
    const defauts: Record<string, unknown> = {
      getMe: { ok: true, via: 'marchand', resultat: { id: 42 } },
      getWebhookInfo: { ok: true, via: 'marchand', resultat: { url: urlWebhookTelegram(SLUG) } },
      getChat: { ok: true, via: 'marchand', resultat: { id: -100 } },
      getChatMember: { ok: true, via: 'marchand', resultat: { status: 'administrator' } },
    };
    return surcharges[methode] ?? defauts[methode];
  };

const requete = () => new Request('https://exemple.test/api/dashboard/boutique/diagnostic');

type Controle = { cle: string; etape: number; etat: string; message: string };
type Corps = { pret: boolean; controles: Controle[]; verifie_le: string };

const lancer = async (): Promise<{ statut: number; corps: Corps; entetes: Headers }> => {
  const rep = await POST(requete());
  return { statut: rep.status, corps: (await rep.json()) as Corps, entetes: rep.headers };
};

const par = (c: Corps, cle: string) => c.controles.find((x) => x.cle === cle)!;

beforeEach(() => {
  etats.fiche = { sb: sbAvecArticles(3), boutique: boutiqueComplete(), admin: false };
  etats.envoi = () => ({ ok: true, canal: 'whatsapp', via: 'marchand' });
  etats.telegram = telegramNominal();
  etats.rafale = { depassee: false, attendreSecondes: 0 };
  etats.plafond = { depasse: false, valeur: 1, indisponible: false };
  etats.envoisFaits = [];
  etats.appelsTelegram = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('le cas nominal', () => {
  it('rend pret et sept controles au vert', async () => {
    const { statut, corps } = await lancer();
    expect(statut).toBe(200);
    expect(corps.pret).toBe(true);
    expect(corps.controles).toHaveLength(7);
    expect(corps.controles.every((c) => c.etat === 'ok')).toBe(true);
  });

  it('rend les sept controles dans un ordre stable', async () => {
    const { corps } = await lancer();
    expect(corps.controles.map((c) => c.cle)).toEqual([
      'numero',
      'whatsapp',
      'telegram_bot',
      'telegram_gerant',
      'groupe',
      'webhook_whatsapp',
      'catalogue',
    ]);
  });

  it('n’envoie jamais de message au groupe des livreurs', async () => {
    await lancer();
    const groupe = boutiqueComplete().groupe_livreurs;
    expect(etats.envoisFaits.some((e) => e.destinataire === groupe)).toBe(false);
    expect(etats.envoisFaits).toHaveLength(2);
    expect(etats.appelsTelegram).toContain('getChat');
    expect(etats.appelsTelegram).toContain('getChatMember');
  });

  it('horodate la verification', async () => {
    const { corps } = await lancer();
    expect(Number.isNaN(Date.parse(corps.verifie_le))).toBe(false);
  });
});

describe('le piege central : un envoi qui reussit par le jeton de la plateforme', () => {
  it('fait ECHOUER whatsapp, et le dit', async () => {
    etats.envoi = () => ({ ok: true, canal: 'whatsapp', via: 'plateforme' });
    const { corps } = await lancer();
    expect(corps.pret).toBe(false);
    expect(par(corps, 'whatsapp').etat).toBe('echec');
    expect(par(corps, 'whatsapp').message).toContain('numéro de la plateforme');
    expect(par(corps, 'whatsapp').etape).toBe(2);
  });

  it('fait ECHOUER l’alerte du gerant', async () => {
    etats.envoi = (p: { canal: string }) =>
      p.canal === 'telegram'
        ? { ok: true, canal: 'telegram', via: 'plateforme' }
        : { ok: true, canal: 'whatsapp', via: 'marchand' };
    const { corps } = await lancer();
    expect(corps.pret).toBe(false);
    expect(par(corps, 'telegram_gerant').etat).toBe('echec');
  });

  it('fait ECHOUER le bot quand c’est celui de la plateforme qui repond', async () => {
    etats.telegram = telegramNominal({
      getMe: { ok: true, via: 'plateforme', resultat: { id: 1 } },
    });
    const { corps } = await lancer();
    expect(par(corps, 'telegram_bot').etat).toBe('echec');
    expect(par(corps, 'telegram_bot').message).toContain('plateforme');
    // Sans jeton du marchand, ni le gerant ni le groupe ne peuvent etre juges :
    // ils renvoient a l'etape 2, pas aux leurs.
    expect(par(corps, 'telegram_gerant').etape).toBe(2);
    expect(par(corps, 'groupe').etape).toBe(2);
  });
});

describe('le numero', () => {
  it('echoue et n’envoie RIEN quand il manque', async () => {
    etats.fiche = {
      sb: sbAvecArticles(3),
      boutique: { ...boutiqueComplete(), telephone: null },
      admin: false,
    };
    const { corps } = await lancer();
    expect(par(corps, 'numero').etat).toBe('echec');
    expect(par(corps, 'numero').etape).toBe(1);
    expect(etats.envoisFaits.some((e) => e.canal === 'whatsapp')).toBe(false);
    expect(par(corps, 'whatsapp').etape).toBe(1);
  });

  it('echoue sur un numero trop court', async () => {
    etats.fiche = {
      sb: sbAvecArticles(3),
      boutique: { ...boutiqueComplete(), telephone: '0759' },
      admin: false,
    };
    const { corps } = await lancer();
    expect(par(corps, 'numero').etat).toBe('echec');
  });
});

describe('whatsapp', () => {
  it('echoue quand l’envoi est refuse', async () => {
    etats.envoi = () => ({ ok: false, canal: 'whatsapp', raison: 'session morte', statut: 502 });
    const { corps } = await lancer();
    expect(par(corps, 'whatsapp').etat).toBe('echec');
    expect(corps.pret).toBe(false);
  });
});

describe('le webhook du bot', () => {
  it('demande la REVOCATION quand il vise un hote etranger', async () => {
    etats.telegram = telegramNominal({
      getWebhookInfo: {
        ok: true,
        via: 'marchand',
        resultat: { url: 'https://serveur-tiers.example/webhook/telegram/boutique-test' },
      },
    });
    const { corps } = await lancer();
    const c = par(corps, 'telegram_bot');
    expect(c.etat).toBe('echec');
    expect(c.message).toContain('BotFather');
    expect(c.message).toContain('révoquez');
    // Ce cas est un incident, pas une panne : il doit atteindre le journal.
    expect(console.error).toHaveBeenCalled();
  });

  it('parle d’ancienne adresse quand l’hote est le bon mais le chemin non', async () => {
    etats.telegram = telegramNominal({
      getWebhookInfo: {
        ok: true,
        via: 'marchand',
        resultat: { url: `${URL_ROUTEUR_TELEGRAM}/une-autre-boutique` },
      },
    });
    const { corps } = await lancer();
    const c = par(corps, 'telegram_bot');
    expect(c.etat).toBe('echec');
    expect(c.message).toContain('ancienne adresse');
    expect(c.message).not.toContain('BotFather');
  });

  it('echoue quand aucun webhook n’est pose', async () => {
    etats.telegram = telegramNominal({
      getWebhookInfo: { ok: true, via: 'marchand', resultat: { url: '' } },
    });
    const { corps } = await lancer();
    expect(par(corps, 'telegram_bot').etat).toBe('echec');
  });

  it('echoue sur une erreur Telegram de moins d’une heure', async () => {
    etats.telegram = telegramNominal({
      getWebhookInfo: {
        ok: true,
        via: 'marchand',
        resultat: {
          url: urlWebhookTelegram(SLUG),
          last_error_message: 'Connection timed out',
          last_error_date: Math.floor(Date.now() / 1000) - 300,
        },
      },
    });
    const { corps } = await lancer();
    expect(par(corps, 'telegram_bot').etat).toBe('echec');
    expect(par(corps, 'telegram_bot').message).toContain("moins d'une heure");
  });

  it('IGNORE une erreur Telegram vieille de trois jours', async () => {
    // La sonde qui crie au loup sur une panne deja reglee cesse d'etre lue.
    etats.telegram = telegramNominal({
      getWebhookInfo: {
        ok: true,
        via: 'marchand',
        resultat: {
          url: urlWebhookTelegram(SLUG),
          last_error_message: 'Connection timed out',
          last_error_date: Math.floor(Date.now() / 1000) - 3 * 24 * 3600,
        },
      },
    });
    const { corps } = await lancer();
    expect(par(corps, 'telegram_bot').etat).toBe('ok');
    expect(corps.pret).toBe(true);
  });

  it('echoue quand la liaison n’est pas signee', async () => {
    etats.fiche = {
      sb: sbAvecArticles(3),
      boutique: { ...boutiqueComplete(), telegram_webhook_secret_hash: null },
      admin: false,
    };
    const { corps } = await lancer();
    expect(par(corps, 'telegram_bot').etat).toBe('echec');
    expect(par(corps, 'telegram_bot').message).toContain('signée');
  });

  it('echoue quand le bot ne repond plus du tout', async () => {
    etats.telegram = telegramNominal({
      getMe: { ok: false, raison: 'Unauthorized', statut: 401 },
    });
    const { corps } = await lancer();
    expect(par(corps, 'telegram_bot').etat).toBe('echec');
    expect(par(corps, 'telegram_bot').message).toContain('BotFather');
  });
});

describe('le groupe des livreurs', () => {
  it('echoue quand le bot n’y est pas administrateur', async () => {
    etats.telegram = telegramNominal({
      getChatMember: { ok: true, via: 'marchand', resultat: { status: 'member' } },
    });
    const { corps } = await lancer();
    expect(par(corps, 'groupe').etat).toBe('echec');
    expect(par(corps, 'groupe').message).toContain('administrateur');
    expect(par(corps, 'groupe').etape).toBe(4);
  });

  it('accepte le createur du groupe comme administrateur', async () => {
    etats.telegram = telegramNominal({
      getChatMember: { ok: true, via: 'marchand', resultat: { status: 'creator' } },
    });
    const { corps } = await lancer();
    expect(par(corps, 'groupe').etat).toBe('ok');
  });

  it('echoue quand le groupe est introuvable', async () => {
    etats.telegram = telegramNominal({
      getChat: { ok: false, raison: 'chat not found', statut: 400 },
    });
    const { corps } = await lancer();
    expect(par(corps, 'groupe').etat).toBe('echec');
  });

  it('echoue quand le bot a ete sorti du groupe', async () => {
    etats.telegram = telegramNominal({
      getChatMember: { ok: true, via: 'marchand', resultat: { status: 'left' } },
    });
    const { corps } = await lancer();
    expect(par(corps, 'groupe').etat).toBe('echec');
  });
});

describe('les avertissements ne bloquent jamais', () => {
  it('un catalogue vide laisse la boutique PRETE', async () => {
    etats.fiche = { sb: sbAvecArticles(0), boutique: boutiqueComplete(), admin: false };
    const { corps } = await lancer();
    expect(corps.pret).toBe(true);
    expect(par(corps, 'catalogue').etat).toBe('avertissement');
  });

  it('une liaison WhatsApp non signee laisse la boutique PRETE', async () => {
    etats.fiche = {
      sb: sbAvecArticles(3),
      boutique: { ...boutiqueComplete(), webhook_secret_hash: null },
      admin: false,
    };
    const { corps } = await lancer();
    expect(corps.pret).toBe(true);
    expect(par(corps, 'webhook_whatsapp').etat).toBe('avertissement');
    expect(par(corps, 'webhook_whatsapp').message).toContain('écrivez-nous');
    expect(console.error).toHaveBeenCalled();
  });

  it('les deux ensemble laissent la boutique PRETE', async () => {
    etats.fiche = {
      sb: sbAvecArticles(0),
      boutique: { ...boutiqueComplete(), webhook_secret_hash: null },
      admin: false,
    };
    const { corps } = await lancer();
    expect(corps.pret).toBe(true);
  });

  it('aucun controle bloquant ne rend jamais « avertissement »', async () => {
    etats.envoi = () => ({ ok: false, canal: 'whatsapp', raison: 'ko', statut: 502 });
    etats.telegram = telegramNominal({ getMe: { ok: false, raison: 'ko', statut: 401 } });
    const { corps } = await lancer();
    const bloquants = ['numero', 'whatsapp', 'telegram_bot', 'telegram_gerant', 'groupe'];
    for (const cle of bloquants) {
      expect(par(corps, cle).etat).not.toBe('avertissement');
    }
  });

  it('aucun controle non bloquant ne rend jamais « echec »', async () => {
    etats.fiche = {
      sb: sbAvecArticles(0),
      boutique: { ...boutiqueComplete(), webhook_secret_hash: null },
      admin: false,
    };
    const { corps } = await lancer();
    expect(par(corps, 'webhook_whatsapp').etat).not.toBe('echec');
    expect(par(corps, 'catalogue').etat).not.toBe('echec');
  });
});

describe('les plafonds', () => {
  it('refuse en 429 avec Retry-After quand la rafale est depassee', async () => {
    etats.rafale = { depassee: true, attendreSecondes: 420 };
    const rep = await POST(requete());
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('420');
    // Rien ne part : le frein precede les controles.
    expect(etats.envoisFaits).toHaveLength(0);
  });

  it('refuse en 429 quand le plafond du jour est atteint', async () => {
    etats.plafond = { depasse: true, valeur: 20, indisponible: false };
    const rep = await POST(requete());
    expect(rep.status).toBe(429);
    expect(etats.envoisFaits).toHaveLength(0);
  });

  it('refuse en 503 quand le compteur est injoignable', async () => {
    etats.plafond = { depasse: true, valeur: null, indisponible: true };
    const rep = await POST(requete());
    expect(rep.status).toBe(503);
  });
});

describe('le garde d’acces', () => {
  it('relaie le 409 multi-boutique tel quel', async () => {
    // La regression du 19 aout : un compte a deux boutiques doit choisir.
    etats.fiche = { sb: null, erreur: 'Vous avez plusieurs boutiques', statut: 409 };
    const rep = await POST(requete());
    expect(rep.status).toBe(409);
    expect(etats.envoisFaits).toHaveLength(0);
  });

  it('relaie le 403 d’une boutique qui n’appartient pas au compte', async () => {
    etats.fiche = { sb: null, erreur: 'Acces refuse', statut: 403 };
    const rep = await POST(requete());
    expect(rep.status).toBe(403);
  });

  it('relaie le 401 d’une session absente', async () => {
    etats.fiche = { sb: null, erreur: 'Authentification requise.', statut: 401 };
    const rep = await POST(requete());
    expect(rep.status).toBe(401);
  });
});

describe('ce qui ne doit JAMAIS sortir', () => {
  it('ne laisse fuir ni jeton, ni empreinte, ni erreur brute de Telegram', async () => {
    etats.telegram = telegramNominal({
      getWebhookInfo: {
        ok: true,
        via: 'marchand',
        resultat: {
          url: urlWebhookTelegram(SLUG),
          last_error_message: 'https://interne.invalide/secret-de-la-plateforme',
          last_error_date: Math.floor(Date.now() / 1000) - 60,
        },
      },
    });
    const rep = await POST(requete());
    const brut = await rep.text();
    expect(brut).not.toContain('empreinte-telegram');
    expect(brut).not.toContain('empreinte-wasender');
    expect(brut).not.toContain('interne.invalide');
    expect(brut).not.toContain('last_error_message');
  });

  it('ne renvoie que des etapes qui existent dans le guide', async () => {
    const { corps } = await lancer();
    for (const c of corps.controles) {
      expect(c.etape).toBeGreaterThanOrEqual(0);
      expect(c.etape).toBeLessThanOrEqual(7);
    }
  });
});
