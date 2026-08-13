import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Prolongation de l'acces apres un paiement encaisse.
 *
 * En prepaye, c'est ici que le temps s'achete : il n'y a plus d'abonnement qui
 * se reconduit, seulement une date de fin qu'on repousse.
 */

const JOURS_PAR_MOIS = 30;

/**
 * Repousse la fin de periode de `mois` mois.
 *
 * Le point de depart est le PLUS TARDIF entre maintenant et la fin actuelle :
 * un marchand qui renouvelle trois jours avant l'echeance ne doit pas perdre
 * ces trois jours. Partir systematiquement de `now()` aurait puni ceux qui
 * paient en avance — exactement ceux qu'on veut encourager.
 */
export async function prolongerAcces(params: {
  userId: string;
  planKey: string;
  mois: number;
  /** Reference du paiement qui ouvre ces droits, conservee pour la tracer. */
  reference: string;
}): Promise<{ ok: boolean; finPeriode?: string; erreur?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, erreur: 'Base indisponible.' };

  const { data: existant, error: erreurLecture } = await sb
    .from('subscriptions')
    .select('current_period_end')
    .eq('user_id', params.userId)
    .maybeSingle();

  if (erreurLecture) {
    console.error('Prolongation — lecture de l abonnement impossible :', erreurLecture);
    return { ok: false, erreur: 'Lecture impossible.' };
  }

  const maintenant = Date.now();
  const finActuelle = existant?.current_period_end
    ? Date.parse(existant.current_period_end)
    : Number.NaN;

  const depart = Number.isFinite(finActuelle) && finActuelle > maintenant ? finActuelle : maintenant;
  const fin = new Date(depart + params.mois * JOURS_PAR_MOIS * 24 * 60 * 60 * 1000);

  const { error } = await sb.from('subscriptions').upsert(
    {
      user_id: params.userId,
      plan_key: params.planKey,
      status: 'active',
      current_period_start: new Date(maintenant).toISOString(),
      current_period_end: fin.toISOString(),
      // Colonne heritee de Stripe, declaree NOT NULL : on y met la reference
      // du paiement, qui joue desormais le meme role de piece justificative.
      last_checkout_session_id: params.reference,
      updated_at: new Date(maintenant).toISOString(),
    } as never,
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('Prolongation — ecriture de l abonnement impossible :', error);
    return { ok: false, erreur: 'Écriture impossible.' };
  }

  return { ok: true, finPeriode: fin.toISOString() };
}
