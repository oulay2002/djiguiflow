import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierPaiement } from '@/lib/billing/cinetpay';
import { prolongerAcces } from '@/lib/billing/periode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notification de paiement du prestataire.
 *
 * PRINCIPE : le corps de cette requete ne prouve RIEN. Il est public, forgeable
 * par n'importe qui, et lui accorder foi reviendrait a offrir un abonnement a
 * qui sait construire un POST. On n'en retient qu'une chose — la reference de
 * transaction — puis on demande au prestataire, par un appel sortant
 * authentifie, ce qu'il en est reellement.
 *
 * On repond 200 des que la notification a ete comprise, meme si le paiement
 * est refuse : un code d'erreur declencherait des reessais en boucle pour une
 * transaction qui, elle, ne changera plus d'avis.
 */

/** Le prestataire poste en formulaire ; on accepte le JSON par tolerance. */
async function lireReference(req: Request): Promise<string | null> {
  const type = req.headers.get('content-type') ?? '';

  try {
    if (type.includes('application/json')) {
      const corps = (await req.json()) as Record<string, unknown>;
      const brut = corps.cpm_trans_id ?? corps.transaction_id;
      return brut ? String(brut).trim() : null;
    }

    const form = await req.formData();
    const brut = form.get('cpm_trans_id') ?? form.get('transaction_id');
    return brut ? String(brut).trim() : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const reference = await lireReference(req);
  if (!reference) {
    return NextResponse.json({ error: 'Référence de transaction absente.' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    // 503 volontaire : ici le reessai a du sens, la panne est de notre cote.
    return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });
  }

  const { data: paiement, error } = await sb
    .from('paiements')
    .select('reference, user_id, plan_key, mois, montant_fcfa, statut')
    .eq('reference', reference)
    .maybeSingle();

  if (error) {
    console.error('Notification — lecture du paiement impossible :', error);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 503 });
  }

  // Reference inconnue : soit un appel forge, soit une transaction d'un autre
  // site. On ne cree rien a partir d'une notification.
  if (!paiement) {
    console.error(`Notification — référence inconnue : ${reference}`);
    return NextResponse.json({ ok: true, ignore: 'référence inconnue' });
  }

  // Idempotence : le prestataire rejoue ses notifications. Sans cette sortie,
  // deux appels prolongeraient l'acces deux fois pour un seul paiement.
  if (paiement.statut === 'paye') {
    return NextResponse.json({ ok: true, deja: true });
  }

  const verdict = await verifierPaiement(reference);

  if (!verdict.accepte) {
    await sb
      .from('paiements')
      .update({ statut: 'echoue', operateur: verdict.operateur } as never)
      .eq('reference', reference);

    console.error(`Paiement ${reference} refusé par le prestataire : ${verdict.statutBrut ?? 'inconnu'}`);
    return NextResponse.json({ ok: true, accepte: false });
  }

  // Le montant encaisse doit etre celui qu'on a demande. Sans ce controle, une
  // transaction de 100 FCFA ouvrirait les droits d'un plan a 25 000 : il suffit
  // de savoir forger une reference et de payer une piece.
  if (verdict.montant !== null && verdict.montant !== paiement.montant_fcfa) {
    await sb
      .from('paiements')
      .update({ statut: 'echoue', operateur: verdict.operateur } as never)
      .eq('reference', reference);

    console.error(
      `Paiement ${reference} — montant inattendu : encaissé ${verdict.montant}, attendu ${paiement.montant_fcfa}.`,
    );
    return NextResponse.json({ ok: true, accepte: false, motif: 'montant' });
  }

  const prolongation = await prolongerAcces({
    userId: paiement.user_id,
    planKey: paiement.plan_key,
    mois: paiement.mois,
    reference,
  });

  if (!prolongation.ok) {
    // Le paiement est encaisse mais l'acces n'est pas ouvert : c'est le seul
    // cas ou l'on veut que le prestataire reessaie, et qu'une alerte parte.
    console.error(`Paiement ${reference} encaissé mais accès non ouvert : ${prolongation.erreur}`);
    return NextResponse.json({ error: 'Prolongation impossible.' }, { status: 503 });
  }

  await sb
    .from('paiements')
    .update({
      statut: 'paye',
      operateur: verdict.operateur,
      paye_le: new Date().toISOString(),
    } as never)
    .eq('reference', reference);

  return NextResponse.json({ ok: true, accepte: true, finPeriode: prolongation.finPeriode });
}
