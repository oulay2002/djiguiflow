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
  plafondPreuves: false,
}));

vi.mock('@/lib/limiteur', () => ({
  adresseAppelante: () => '198.51.100.9',
  rafaleDepassee: () => ({ depassee: false, attendreSecondes: 0 }),
  plafondJournalierDepasse: async () => ({
    depasse: etats.plafondPreuves,
    valeur: 10,
    indisponible: false,
  }),
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
  etats.plafondPreuves = false;
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

  // PHASE 4, basculee le 22 aout 2026. L'absence n'est plus toleree — mais elle
  // reste COMPTEE : le journal dit qui frappe encore sans jeton, et c'est la
  // seule facon de savoir si la bascule a casse quelqu'un.
  it('REFUSE l’absence de jeton, et la compte quand meme', async () => {
    const rep = await suivi(urlSuivi());
    expect(rep.status).toBe(404);
    expect(console.warn).toHaveBeenCalled();
    const ligne = String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(ligne).toContain('ACCES_SANS_JETON');
    expect(ligne).toContain('route=suivi');
    expect(ligne).toContain('age_heures=2');
  });

  // Le refus ne doit pas apprendre que la reference existe : meme code, meme
  // corps qu'une reference inventee. Sinon la bascule rendrait l'enumeration
  // PLUS facile qu'avant.
  it('ne dit pas que la reference existe', async () => {
    const sansJeton = await suivi(urlSuivi());
    const inventee = await suivi(
      new Request('https://exemple.test/api/suivi?ref=CETTE-REFERENCE-N-EXISTE-PAS'),
    );
    // Meme code ET meme corps : c'est la seule facon de ne rien apprendre a un
    // enumerateur. Un 404 « commande introuvable » face a un 403 « jeton
    // manquant » lui confirmerait la moitie de ce qu'il cherche.
    expect(sansJeton.status).toBe(inventee.status);
    expect(await sansJeton.text()).toBe(await inventee.text());
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

  // LE TEST QUI COMPTE LE PLUS SUR CETTE ROUTE. C'est le verbe qui ANNULE une
  // commande : en phase 3, deviner une reference suffisait a annuler celle d'un
  // inconnu. Depuis la bascule, l'absence de jeton refuse — et surtout N'ECRIT
  // PAS.
  it('REFUSE l’absence de jeton, et n’ecrit RIEN', async () => {
    const rep = await confirmer(postConfirmation());
    expect(rep.status).toBe(404);
    expect(etats.ecritures).toBe(0);
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

describe('/api/suivi — la seconde preuve, pour qui a perdu son lien', () => {
  const urlPreuve = (tel4: string) =>
    new Request(`https://exemple.test/api/suivi?ref=ATT-1000000006&tel4=${tel4}`);

  it('laisse passer les quatre bons chiffres, sans aucun jeton', async () => {
    const rep = await suivi(urlPreuve('0000'));
    expect(rep.status).toBe(200);
    const corps = await rep.json();
    expect(corps.order_id).toBe('ATT-1000000006');
  });

  it('REFUSE quatre mauvais chiffres', async () => {
    const rep = await suivi(urlPreuve('1111'));
    expect(rep.status).toBe(404);
  });

  it('refuse une fois le plafond de la commande atteint, MEME avec les bons chiffres', async () => {
    // Le plafond porte la COMMANDE et non l'appelant : une attaque repartie
    // sur cent adresses ne gagne rien. Il s'applique donc aussi a un essai
    // juste, sinon il ne bornerait rien.
    etats.plafondPreuves = true;
    const rep = await suivi(urlPreuve('0000'));
    expect(rep.status).toBe(404);
  });

  it('ne dit pas « trop d’essais » — cela confirmerait la commande', async () => {
    etats.plafondPreuves = true;
    const rep = await suivi(urlPreuve('0000'));
    const corps = await rep.json();
    expect(corps.error).toBe('Commande introuvable');
  });
});
