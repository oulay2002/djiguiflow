import { NextResponse } from 'next/server';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type Corps = {
  boutique_id?: string | null;
  endpoint?: string;
};

/**
 * Retire l'appareil de la liste des destinataires.
 *
 * La suppression est filtree sur `user_id` en plus de l'endpoint : un
 * endpoint est une URL longue et opaque, mais il n'est pas secret, et sans ce
 * filtre celui qui en connait un pourrait couper les notifications d'un autre
 * marchand.
 */
export async function POST(req: Request) {
  let corps: Corps;
  try {
    corps = (await req.json()) as Corps;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const acces = await exigerAccesMarchand(req, corps.boutique_id ?? null);
  if (!acces.ok) {
    return NextResponse.json({ error: acces.message }, { status: acces.statut });
  }

  const endpoint = corps.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: 'Endpoint requis.' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });

  const { error } = await sb
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', acces.userId);

  if (error) {
    console.error('Suppression de l abonnement push impossible :', error);
    return NextResponse.json({ error: 'Suppression impossible.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
