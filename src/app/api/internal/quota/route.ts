import { NextResponse } from 'next/server';
import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { etatQuota } from '@/lib/billing/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le bot peut-il encore enregistrer une commande pour cette boutique ?
 *
 * Consultee par n8n AVANT d'inscrire la commande, pour que l'assistante
 * decline poliment plutot que de la prendre puis de la voir refusee. Couper le
 * bot en pleine conversation ferait perdre une vente au marchand — il nous en
 * voudrait plus qu'il ne paierait.
 *
 * Meme garde que le reste de /api/internal : le secret partage.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: { boutique?: string };
  try {
    corps = (await req.json()) as { boutique?: string };
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const marchand = await resoudreMarchand(corps.boutique ?? null);
  if (!marchand) {
    return NextResponse.json({ error: 'Marchand introuvable.' }, { status: 404 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    // Panne de notre cote : on laisse passer. Bloquer les ventes d'un marchand
    // parce que notre base tousse serait le pire des arbitrages.
    return NextResponse.json({ autorise: true, indetermine: true });
  }

  const { data: boutique } = await sb
    .from('boutiques')
    .select('user_id')
    .eq('id', marchand.boutiqueId)
    .maybeSingle();

  if (!boutique?.user_id) {
    return NextResponse.json({ autorise: true, indetermine: true });
  }

  const etat = await etatQuota(boutique.user_id);
  if (!etat) {
    return NextResponse.json({ autorise: true, indetermine: true });
  }

  return NextResponse.json({
    autorise: !etat.bloque,
    exempt: etat.exempt,
    plan: etat.plan.key,
    inclus: etat.quota,
    utilise: etat.utilise,
    restant: etat.restant,
    niveau: etat.niveau,
    // Ce que l'assistante peut dire au client, sans jargon d'abonnement : le
    // client n'a pas a savoir que son restaurateur a atteint un plafond.
    messageClient: etat.bloque
      ? 'Je ne peux pas enregistrer votre commande pour le moment. Appelez directement la boutique, elle prendra le relais.'
      : null,
  });
}
