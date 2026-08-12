import { NextResponse } from 'next/server';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { pushConfigure } from '@/lib/push';

export const dynamic = 'force-dynamic';

type Corps = {
  boutique_id?: string | null;
  abonnement?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

/**
 * Enregistre l'appareil du marchand pour les notifications push.
 *
 * L'abonnement est fabrique par le navigateur, mais c'est ici qu'on decide a
 * quelle boutique il se rattache — et `exigerAccesMarchand` verifie que
 * l'appelant la possede. Sans ce controle, il suffirait de poster l'uuid
 * d'une autre boutique pour recevoir ses commandes en direct.
 */
export async function POST(req: Request) {
  if (!pushConfigure()) {
    return NextResponse.json(
      { error: 'Notifications push non configurees sur ce deploiement.' },
      { status: 503 },
    );
  }

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

  const endpoint = corps.abonnement?.endpoint?.trim();
  const p256dh = corps.abonnement?.keys?.p256dh?.trim();
  const auth = corps.abonnement?.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Abonnement incomplet.' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });

  // `upsert` sur l'endpoint : reabonner un appareil deja connu doit mettre a
  // jour sa ligne. Un insert simple echouerait, et le marchand qui reactive
  // ses notifications verrait une erreur sans comprendre pourquoi.
  const { error } = await sb.from('push_subscriptions').upsert(
    {
      endpoint,
      user_id: acces.userId,
      boutique_id: acces.marchand.boutiqueId,
      p256dh,
      auth_secret: auth,
      user_agent: req.headers.get('user-agent'),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.error('Enregistrement de l abonnement push impossible :', error);
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
