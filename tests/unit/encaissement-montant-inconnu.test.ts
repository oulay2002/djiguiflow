import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Un montant inconnu n'est pas un montant conforme.
 *
 * ── CE QUE CE FICHIER PROTÈGE ──────────────────────────────────────────────
 *
 * `honorerPaiement` confronte la somme réellement encaissée à celle qu'on a
 * demandée. Sans ce contrôle, une transaction de 200 F ouvrirait les droits
 * d'un plan à 25 000 : il suffirait de savoir forger une référence et de payer
 * une pièce.
 *
 * Mais ce contrôle ne s'appliquait que **si le montant était connu** :
 *
 *     if (verdict.montant !== null && verdict.montant !== attendu) { refuser }
 *
 * Un montant absent le faisait donc SAUTER, et l'accès s'ouvrait sans qu'aucune
 * somme n'ait été comparée. Or ce montant est lu d'un champ du prestataire —
 * `data.amount`. Le jour où GeniusPay le renomme, ou l'omet pour un moyen de
 * paiement, le garde le plus cher du système cesserait de protéger **sans rien
 * dire**.
 *
 * ── POURQUOI « INDÉTERMINÉ » ET NON « REFUSÉ » ─────────────────────────────
 *
 * L'argent a pu être prélevé. Classer ce cas en échec enterrerait un paiement
 * encaissé — c'est la doctrine posée ici depuis le 14 août : un paiement
 * indéterminé n'est pas un paiement refusé. Il reste en attente, le prestataire
 * rejoue, et l'alerte part.
 */

const etats = vi.hoisted(() => ({
  paiement: null as Record<string, unknown> | null,
  marques: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: etats.paiement, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        etats.marques.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

// La prolongation ne doit jamais être atteinte dans ces cas : si elle l'était,
// le test le dirait en échouant sur l'état rendu.
vi.mock('@/lib/billing/acces', () => ({
  prolongerAcces: async () => ({ ok: true, finPeriode: '2027-01-01' }),
}));

const { honorerPaiement } = await import('@/lib/billing/encaissement');

const ATTENDU = 25_000;

function verdict(partiel: Record<string, unknown>) {
  return {
    accepte: true,
    indetermine: false,
    montant: null,
    operateur: 'wave',
    statutBrut: 'success',
    frais: null,
    sandbox: false,
    ...partiel,
  } as never;
}

beforeEach(() => {
  etats.marques = [];
  etats.paiement = {
    reference: 'REF-1',
    user_id: 'u1',
    plan_key: 'pro',
    mois: 1,
    montant_fcfa: ATTENDU,
    statut: 'en_attente',
    jeton_prestataire: 'JETON',
  };
});

describe('le montant est confronté, ou le paiement reste en attente', () => {
  /**
   * LE CAS QUI A MOTIVÉ CE FICHIER.
   *
   * Verdict accepté, montant absent. Avant, l'accès s'ouvrait.
   */
  it('un montant absent laisse le paiement EN ATTENTE, jamais honoré', async () => {
    const issue = await honorerPaiement({
      reference: 'REF-1',
      refPrestataire: 'JETON',
      verdictConnu: verdict({ montant: null }),
    });

    expect(issue.etat, 'un montant inconnu a ouvert l’accès').toBe('indetermine');
    expect(etats.marques, 'le paiement a été marqué alors qu’on ne sait pas').toEqual([]);
  });

  it('un montant qui ne correspond pas est REFUSÉ', async () => {
    const issue = await honorerPaiement({
      reference: 'REF-1',
      refPrestataire: 'JETON',
      verdictConnu: verdict({ montant: 200 }),
    });

    expect(issue.etat).toBe('refuse');
    if (issue.etat === 'refuse') expect(issue.motif).toBe('montant');
  });

  it('le bon montant passe le contrôle', async () => {
    const issue = await honorerPaiement({
      reference: 'REF-1',
      refPrestataire: 'JETON',
      verdictConnu: verdict({ montant: ATTENDU }),
    });

    expect(issue.etat, `état inattendu : ${issue.etat}`).not.toBe('refuse');
    expect(issue.etat).not.toBe('indetermine');
  });

  // Un paiement déjà honoré ne se rejoue pas, quel que soit le montant :
  // le prestataire rejoue ses notifications et le rattrapage repasse.
  it('un paiement déjà payé reste idempotent', async () => {
    etats.paiement = { ...(etats.paiement as object), statut: 'paye' };
    const issue = await honorerPaiement({
      reference: 'REF-1',
      refPrestataire: 'JETON',
      verdictConnu: verdict({ montant: ATTENDU }),
    });
    expect(issue.etat).toBe('deja');
  });
});
