import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le jeton, applique par les deux routes publiques.
 *
 * CE QUE CES TESTS TIENNENT. Les tests de `jetonSuivi` verifient la regle ;
 * ceux-ci verifient qu'elle est bien BRANCHEE — c'est la moitie qui se perd
 * silencieusement. Une route qui oublie d'appeler la regle continue de
 * fonctionner, ne leve rien, et redevient devinable.
 *
 * Le cas le plus grave est le POST de confirmation : il ANNULE une commande.
 * Un test verifie qu'aucune ecriture n'a lieu quand le jeton est faux.
 */

const JETON = '14c4a9537efc462187eea030ea990e67';
const AUTRE = 'ffffffffffffffffffffffffffffffff';

const etats = vi.hoisted(() => ({
  commande: null as Record<string, unknown> | null,
  ecritures: 0,
}));

vi.mock('@/lib/limiteur', () => ({
  adresseAppelante: () => '198.51.100.9',
  rafaleDepassee: () => ({ depassee: false, attendreSecondes: 0 }),
  plafondJournalierDepasse: async () => ({ depasse: false, valeur: 1, indisponible: false }),
  secondesAvantMinuitAbidjan: () => 3600,
}));

vi.mock('@/lib/marchands', () => ({ resoudreMarchand: async () => null }));
vi.mock('@/lib/secretN8n', () => ({ secretWebhookN8n: async () => 'secret' }));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'boutiques') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'b', nom: 'B' } }) }) }),
        };
      }
      return {
        select: () => ({
          ilike: () => ({ maybeSingle: async () => ({ data: etats.commande, error: null }) }),
        }),
        update: () => {
          etats.ecritures += 1;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  }),
}));

const { GET: suivi } = await import('@/app/api/suivi/route');
const { POST: confirmer } = await import('@/app/api/confirmation/route');

const commande = (surcharges: Record<string, unknown> = {}) => ({
  reference: 'ATT-1000000006',
  jeton_suivi: JETON,
  created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  confirmation_statut: 'demandee',
  boutique_id: 'b-1',
  client_nom: 'Awa',
  client_telephone: '2250700000000',
  chat_id: '2250700000000',
  client_adresse: 'Cocody, rue des jardins',
  total: 12500,
  canal: 'whatsapp',
  nom_livreur: null,
  statut_livraison: null,
  frais_livraison: null,
  heure_prise_en_charge: null,
  heure_livraison: null,
  commande_items: [],
  ...surcharges,
});

const urlSuivi = (t?: string) =>
  new Request(
    `https://exemple.test/api/suivi?ref=ATT-1000000006${t === undefined ? '' : `&t=${t}`}`,
  );

const postConfirmation = (t?: string) =>
  new Request('https://exemple.test/api/confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'ATT-1000000006', r: 'non', ...(t === undefined ? {} : { t }) }),
  });

beforeEach(() => {
  etats.commande = commande();
  etats.ecritures = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/api/suivi', () => {
  it('sert la commande avec le bon jeton', async () => {
    const rep = await suivi(urlSuivi(JETON));
    expect(rep.status).toBe(200);
    const corps = await rep.json();
    expect(corps.order_id).toBe('ATT-1000000006');
  });

  it('REFUSE un jeton faux, et ne dit pas que la reference existe', async () => {
    const rep = await suivi(urlSuivi(AUTRE));
    expect(rep.status).toBe(404);
    const corps = await rep.json();
    // Le meme message qu'une commande inconnue : distinguer les deux
    // confirmerait a un enumerateur qu'il a trouve une vraie reference.
    expect(corps.error).toBe('Commande introuvable');
    expect(JSON.stringify(corps)).not.toContain('Cocody');
    expect(JSON.stringify(corps)).not.toContain('Awa');
  });

  it('tolere l’absence de jeton en phase 3, mais la COMPTE', async () => {
    const rep = await suivi(urlSuivi());
    expect(rep.status).toBe(200);
    expect(console.warn).toHaveBeenCalled();
    const ligne = String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(ligne).toContain('ACCES_SANS_JETON');
    expect(ligne).toContain('route=suivi');
    expect(ligne).toContain('age_heures=2');
  });

  it('ne renvoie JAMAIS le jeton au navigateur', async () => {
    const rep = await suivi(urlSuivi(JETON));
    const brut = await rep.text();
    expect(brut).not.toContain(JETON);
    expect(brut).not.toContain('jeton_suivi');
  });
});

describe('/api/confirmation — le verbe qui annule', () => {
  it('REFUSE un jeton faux SANS ecrire', async () => {
    const rep = await confirmer(postConfirmation(AUTRE));
    expect(rep.status).toBe(404);
    // Le point entier de ce test : le controle passe AVANT l'ecriture.
    expect(etats.ecritures).toBe(0);
  });

  it('refuse aussi quand la commande n’a pas de jeton et qu’on en presente un', async () => {
    etats.commande = commande({ jeton_suivi: null });
    const rep = await confirmer(postConfirmation(AUTRE));
    expect(rep.status).toBe(404);
    expect(etats.ecritures).toBe(0);
  });

  it('tolere l’absence de jeton en phase 3, et ecrit', async () => {
    const rep = await confirmer(postConfirmation());
    expect(rep.status).toBe(200);
    expect(etats.ecritures).toBeGreaterThan(0);
    expect(console.warn).toHaveBeenCalled();
    const ligne = String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(ligne).toContain('route=confirmation:reponse');
  });

  it('ecrit avec le bon jeton', async () => {
    const rep = await confirmer(postConfirmation(JETON));
    expect(rep.status).toBe(200);
    expect(etats.ecritures).toBeGreaterThan(0);
  });
});
