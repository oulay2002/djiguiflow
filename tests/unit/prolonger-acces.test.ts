import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `prolongerAcces()` — la derniere marche, celle qui ouvre les droits.
 *
 * POURQUOI CES TESTS EXISTENT. Le 24 aout 2026, on a mesure que cette
 * fonction n'avait JAMAIS tourne apres un encaissement authentique, et
 * qu'aucun test ne la nommait. C'est le seul endroit de la chaine de paiement
 * qui n'avait jamais ete parcouru — et son echec a la pire des formes :
 * **argent encaisse, acces non ouvert**.
 *
 * CE QUE CES TESTS COUVRENT, ET CE QU'ILS NE COUVRENT PAS. Ici, l'ENVELOPPE :
 * la facon dont elle traite chaque verdict de la base. Le comportement de la
 * RPC elle-meme — idempotence par reference, report depuis la fin de periode,
 * refus d'un mois nul — a ete eprouve EN VRAI le 24 aout sur un utilisateur
 * jetable, 16 controles, et ne peut pas l'etre depuis un test unitaire.
 *
 * LE CAS QUI COMPTE LE PLUS est le 4 : la RPC repond sans erreur mais sans
 * date. Repondre « c'est fait » a une route qui en conclurait un succes
 * laisserait le marchand paye et sans acces, en silence. Voir
 * [[defaut-silencieux]].
 */

const etats = vi.hoisted(() => ({
  client: 'ok' as 'ok' | 'absent',
  reponse: { data: null as unknown, error: null as { message: string } | null },
  leve: false,
  appels: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () =>
    etats.client === 'absent'
      ? null
      : {
          rpc: (nom: string, params: Record<string, unknown>) => {
            etats.appels.push({ nom, ...params });
            // `sb.rpc()` n'est pas une promesse au sens strict : une panne de
            // transport LEVE au lieu de rendre `{ error }`.
            if (etats.leve) throw new Error('socket hang up');
            return Promise.resolve(etats.reponse);
          },
        },
}));

const PARAMS = {
  userId: '11111111-1111-1111-1111-111111111111',
  planKey: 'pro',
  mois: 1,
  reference: 'GP-2026-0824-001',
};

async function appeler(params = PARAMS) {
  const { prolongerAcces } = await import('@/lib/billing/periode');
  return prolongerAcces(params);
}

beforeEach(() => {
  vi.resetModules();
  etats.client = 'ok';
  etats.leve = false;
  etats.reponse = { data: null, error: null };
  etats.appels = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prolongerAcces — les verdicts de la base', () => {
  it('1. rend la date quand la base prolonge', async () => {
    etats.reponse = { data: '2026-09-23T12:00:00+00:00', error: null };
    const r = await appeler();
    expect(r.ok).toBe(true);
    expect(r.finPeriode).toBe(new Date('2026-09-23T12:00:00+00:00').toISOString());
    expect(r.erreur).toBeUndefined();
  });

  it('2. passe a la RPC les quatre parametres attendus', async () => {
    // Un nom de parametre qui derive fait echouer la RPC en production sans
    // qu'aucun type ne l'attrape : la signature vit en base.
    etats.reponse = { data: '2026-09-23T12:00:00+00:00', error: null };
    await appeler();
    expect(etats.appels[0]).toEqual({
      nom: 'prolonger_acces',
      p_user_id: PARAMS.userId,
      p_plan_key: PARAMS.planKey,
      p_mois: PARAMS.mois,
      p_reference: PARAMS.reference,
    });
  });

  it('3. n echoue pas en silence quand la base refuse', async () => {
    etats.reponse = { data: null, error: { message: 'prolonger_acces : nombre de mois invalide (0)' } };
    const r = await appeler();
    expect(r.ok).toBe(false);
    expect(r.finPeriode).toBeUndefined();
  });

  it('4. refuse une prolongation SANS DATE — le cas le plus grave', async () => {
    // Pas d erreur, mais pas de date : on ne sait pas si l acces est ouvert.
    // Repondre « c est fait » laisserait le marchand paye et sans acces.
    etats.reponse = { data: null, error: null };
    const r = await appeler();
    expect(r.ok).toBe(false);
    expect(r.erreur).toBe('Prolongation sans date.');
  });

  it('5. traite une chaine vide comme une absence de date', async () => {
    etats.reponse = { data: '', error: null };
    const r = await appeler();
    expect(r.ok).toBe(false);
  });

  it('6. attrape la levee de transport au lieu de la laisser remonter', async () => {
    // `sb.rpc()` n a pas de `.catch` : sans le try, la route repondrait 500 au
    // lieu de laisser le prestataire rejouer sa notification.
    etats.leve = true;
    const r = await appeler();
    expect(r.ok).toBe(false);
    expect(r.erreur).toBe('Appel impossible.');
  });

  it('7. dit non quand la base est injoignable, sans lever', async () => {
    etats.client = 'absent';
    const r = await appeler();
    expect(r.ok).toBe(false);
    expect(r.erreur).toBe('Base indisponible.');
  });

  it('8. aucun refus ne rend jamais ok:true', async () => {
    // Le filet, en une phrase : quelle que soit la panne, l appelant ne doit
    // jamais croire que l acces est ouvert.
    const pannes: Array<() => void> = [
      () => { etats.reponse = { data: null, error: { message: 'x' } }; },
      () => { etats.reponse = { data: null, error: null }; },
      () => { etats.reponse = { data: '', error: null }; },
      () => { etats.leve = true; },
      () => { etats.client = 'absent'; },
    ];
    for (const panne of pannes) {
      vi.resetModules();
      etats.client = 'ok';
      etats.leve = false;
      etats.reponse = { data: null, error: null };
      panne();
      expect((await appeler()).ok).toBe(false);
    }
  });
});
