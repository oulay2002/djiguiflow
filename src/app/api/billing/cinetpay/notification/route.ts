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
 *
 * SUR LA SIGNATURE (`CINETPAY_SECRET_KEY`) : le prestataire signe sa
 * notification, et cette signature n'est PAS verifiee ici. C'est assume, et ce
 * n'est pas un trou : la verification par signature prouverait l'origine du
 * message, or on ne croit deja pas le message. On lui demande sa reference,
 * puis on interroge le prestataire nous-memes — ce qui prouve davantage, et
 * qui tient meme si la signature venait a etre compromise.
 *
 * La brancher reste souhaitable, comme second verrou : elle permettrait
 * d'ecarter le bruit avant l'appel sortant. Elle ne l'est pas encore parce
 * qu'il faut connaitre la chaine exacte a signer — l'ordre des champs
 * concatenes — et que la documentation de CinetPay est restee injoignable. La
 * deviner produirait un rejet des notifications LEGITIMES, c'est-a-dire des
 * paiements encaisses sans acces ouvert : precisement le sens de panne qu'on
 * refuse.
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

  // On NE SAIT PAS. Route de vérification absente, prestataire injoignable,
  // contrat different : l'argent peut avoir ete preleve. Classer ce cas en
  // « echoue » enterrerait un paiement encaisse, et le marchand n'aurait ni
  // son acces ni trace de sa demande. On laisse donc la reference EN ATTENTE
  // et on repond 503 : le prestataire rejouera sa notification, et la panne
  // remonte au canal d'alerte au lieu de se ranger dans les refus.
  if (verdict.indetermine) {
    console.error(
      `Paiement ${reference} — vérification impossible (${verdict.statutBrut}).`
      + ' Laissé en attente : ne pas le compter comme refusé.',
    );
    return NextResponse.json({ error: 'Vérification impossible.' }, { status: 503 });
  }

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
