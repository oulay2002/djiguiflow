import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Prolongation de l'acces apres un paiement encaisse.
 *
 * En prepaye, c'est ici que le temps s'achete : il n'y a plus d'abonnement qui
 * se reconduit, seulement une date de fin qu'on repousse.
 */

/**
 * Repousse la fin de periode de `mois` mois.
 *
 * Le point de depart est le PLUS TARDIF entre maintenant et la fin actuelle :
 * un marchand qui renouvelle trois jours avant l'echeance ne doit pas perdre
 * ces trois jours. Partir systematiquement de `now()` aurait puni ceux qui
 * paient en avance — exactement ceux qu'on veut encourager.
 *
 * TOUT SE PASSE EN BASE, et ce n'est pas un detail de style. Le calcul vivait
 * ici, en deux instructions : lire `current_period_end`, puis ecrire la
 * nouvelle. Le prestataire rejoue ses notifications, et la route qui appelle
 * cette fonction interroge CinetPay entre les deux — plusieurs centaines de
 * millisecondes pendant lesquelles un second rejeu lisait la MEME date de
 * depart. Les deux prolongeaient, et un seul paiement ouvrait deux fois la
 * duree achetee. Aucune garde applicative ne pouvait fermer cette fenetre :
 * il fallait que lecture et ecriture soient une seule instruction, sous le
 * verrou de ligne du ON CONFLICT.
 *
 * La fonction `prolonger_acces` est en outre idempotente par reference : le
 * meme paiement applique deux fois ne deplace la date qu'une fois.
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

  // `prolonger_acces` est posterieure aux types generes.
  const rpc = sb.rpc as unknown as (
    nom: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;

  let data: unknown;
  let error: unknown;
  try {
    // `sb.rpc()` n'est pas une promesse au sens strict : il n'a pas de
    // `.catch`. Une panne de transport doit donc etre attrapee ici, sinon elle
    // remonte non geree et la route repond 500 au lieu de laisser le
    // prestataire rejouer.
    ({ data, error } = await rpc('prolonger_acces', {
      p_user_id: params.userId,
      p_plan_key: params.planKey,
      p_mois: params.mois,
      p_reference: params.reference,
    }));
  } catch (e) {
    console.error('Prolongation — appel impossible :', e);
    return { ok: false, erreur: 'Appel impossible.' };
  }

  if (error) {
    console.error('Prolongation — ecriture de l abonnement impossible :', error);
    return { ok: false, erreur: 'Écriture impossible.' };
  }

  const finPeriode = data == null ? '' : String(data);
  if (!finPeriode) {
    // Sans date rendue, on ne sait pas si l'acces est ouvert. Le dire, plutot
    // que de repondre « c'est fait » a une route qui en conclurait un succes.
    console.error(`Prolongation — aucune date rendue pour ${params.reference}.`);
    return { ok: false, erreur: 'Prolongation sans date.' };
  }

  return { ok: true, finPeriode: new Date(finPeriode).toISOString() };
}
