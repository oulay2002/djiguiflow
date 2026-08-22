import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Les freins contre l'enumeration des references de commande.
 *
 * POURQUOI ILS EXISTENT. Ni `/api/suivi` ni `/api/confirmation` n'exigent
 * d'autre preuve que la reference. Or les references de production ne sont pas
 * imprevisibles : on trouve en base des compteurs sequentiels
 * (`ATT-1000000006`, `ATT-1000000007`) et des formes derivables comme
 * `APP-<telephone>-<horodatage unix en secondes>` — connaitre le numero d'un
 * client ramene alors une journee entiere a 86 400 essais.
 *
 * CE QUE CELA OUVRE. `/api/suivi` rend le nom et l'ADRESSE DE DOMICILE du
 * client. `/api/confirmation` affiche l'adresse et, par son POST, CONFIRME OU
 * ANNULE la commande : deviner une reference permet donc de detruire la
 * commande d'un inconnu.
 *
 * CES FREINS NE CORRIGENT PAS LA CAUSE. La correction de fond est un jeton
 * imprevisible par commande. Tant qu'il n'existe pas, ces tests sont ce qui
 * empeche de retirer le seul obstacle en place.
 */

const etats = vi.hoisted(() => ({
  rafale: { depassee: false, attendreSecondes: 0 },
  cles: [] as string[],
  baseTouchee: false,
}));

vi.mock('@/lib/limiteur', () => ({
  adresseAppelante: () => '198.51.100.9',
  rafaleDepassee: (cle: string) => {
    etats.cles.push(cle);
    return etats.rafale;
  },
  plafondJournalierDepasse: async () => ({ depasse: false, valeur: 1, indisponible: false }),
  secondesAvantMinuitAbidjan: () => 3600,
}));

// Un refus ne doit RIEN couter : si la base est touchee, le frein arrive trop
// tard et l'enumeration reste payante pour l'attaquant.
vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => {
    etats.baseTouchee = true;
    return null;
  },
}));

vi.mock('@/lib/marchands', () => ({
  resoudreMarchand: async () => null,
  getMarchand: async () => null,
  prefixeReference: () => 'X',
}));

vi.mock('@/lib/secretN8n', () => ({ secretWebhookN8n: async () => 'secret' }));

const { GET: suivi } = await import('@/app/api/suivi/route');
const { GET: confirmationGet, POST: confirmationPost } = await import(
  '@/app/api/confirmation/route'
);

const url = (chemin: string) => `https://exemple.test${chemin}`;

beforeEach(() => {
  etats.rafale = { depassee: false, attendreSecondes: 0 };
  etats.cles = [];
  etats.baseTouchee = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/api/suivi', () => {
  it('refuse en 429 avec Retry-After quand l’appelant enumere', async () => {
    etats.rafale = { depassee: true, attendreSecondes: 180 };
    const rep = await suivi(new Request(url('/api/suivi?ref=ATT-1000000006')));
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('180');
  });

  it('ne touche pas la base quand il refuse', async () => {
    etats.rafale = { depassee: true, attendreSecondes: 180 };
    await suivi(new Request(url('/api/suivi?ref=ATT-1000000006')));
    expect(etats.baseTouchee).toBe(false);
  });

  it('journalise le refus, pour qu’une enumeration soit visible', async () => {
    etats.rafale = { depassee: true, attendreSecondes: 180 };
    await suivi(new Request(url('/api/suivi?ref=ATT-1000000006')));
    expect(console.error).toHaveBeenCalled();
  });

  it('laisse passer une consultation ordinaire', async () => {
    const rep = await suivi(new Request(url('/api/suivi?ref=ATT-1000000006')));
    expect(rep.status).not.toBe(429);
    expect(etats.cles[0]).toBe('suivi:198.51.100.9');
  });
});

describe('/api/confirmation', () => {
  it('refuse la LECTURE en 429', async () => {
    etats.rafale = { depassee: true, attendreSecondes: 240 };
    const rep = await confirmationGet(new Request(url('/api/confirmation?ref=ATT-1000000006')));
    expect(rep.status).toBe(429);
    expect(rep.headers.get('Retry-After')).toBe('240');
    expect(etats.baseTouchee).toBe(false);
  });

  it('refuse l’ECRITURE en 429 — c’est elle qui annule une commande', async () => {
    etats.rafale = { depassee: true, attendreSecondes: 240 };
    const rep = await confirmationPost(
      new Request(url('/api/confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'ref=ATT-1000000006&r=non',
      }),
    );
    expect(rep.status).toBe(429);
    expect(etats.baseTouchee).toBe(false);
  });

  it('compte la lecture et l’ecriture separement', async () => {
    // Deux compteurs distincts : un client ouvre son lien plusieurs fois, mais
    // il ne repond qu'une seule. Les confondre punirait le geste innocent.
    await confirmationGet(new Request(url('/api/confirmation?ref=X')));
    const apresLecture = [...etats.cles];
    etats.cles = [];
    await confirmationPost(
      new Request(url('/api/confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'ref=X&r=oui',
      }),
    );
    expect(apresLecture[0]).toBe('confirmation:lecture:198.51.100.9');
    expect(etats.cles[0]).toBe('confirmation:reponse:198.51.100.9');
    expect(apresLecture[0]).not.toBe(etats.cles[0]);
  });

  it('rend du HTML, pas du JSON, meme sur un refus', async () => {
    // Cette page est ouverte par un client dans WhatsApp : un JSON brut serait
    // illisible pour lui.
    etats.rafale = { depassee: true, attendreSecondes: 60 };
    const rep = await confirmationGet(new Request(url('/api/confirmation?ref=X')));
    expect(rep.headers.get('Content-Type')).toContain('text/html');
  });
});
