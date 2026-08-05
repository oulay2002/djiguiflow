import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { isMockBillingMode } from '@/lib/billing/mode';
import { getBillingPlan } from '@/lib/billing/plans';

export const runtime = 'nodejs';

type ConfirmRequestBody = {
  sessionId?: string;
};

type StripeSubscriptionWithPeriod = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

type SubscriptionRecord = {
  user_id: string;
  plan_key: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  last_checkout_session_id: string;
  updated_at: string;
};

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

function buildSupabaseClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function buildSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toIso(timestampInSeconds: number | null | undefined): string | null {
  if (!timestampInSeconds) {
    return null;
  }
  return new Date(timestampInSeconds * 1000).toISOString();
}

function buildMockSubscriptionRecord(userId: string, sessionId: string): SubscriptionRecord {
  const mockSessionPart = sessionId.replace(/^mock_/, '');
  const planCandidate = mockSessionPart.split('_')[0] ?? 'starter';
  const resolvedPlan = getBillingPlan(planCandidate)?.key ?? 'starter';
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    user_id: userId,
    plan_key: resolvedPlan,
    status: 'active',
    stripe_customer_id: `mock_customer_${userId.slice(0, 8)}`,
    stripe_subscription_id: `mock_subscription_${sessionId}`,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    last_checkout_session_id: sessionId,
    updated_at: now.toISOString(),
  };
}

export async function POST(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const supabase = buildSupabaseClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Configuration Supabase manquante.' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  let body: ConfirmRequestBody;
  try {
    body = (await request.json()) as ConfirmRequestBody;
  } catch {
    return NextResponse.json({ error: 'Corps de requete invalide.' }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ error: 'sessionId est obligatoire.' }, { status: 400 });
  }

  if (isMockBillingMode() && body.sessionId.startsWith('mock_')) {
    const mockRecord = buildMockSubscriptionRecord(user.id, body.sessionId);
    const admin = buildSupabaseAdminClient();
    const tableName = process.env.SUPABASE_SUBSCRIPTIONS_TABLE ?? 'subscriptions';

    if (!admin) {
      return NextResponse.json(
        {
          persisted: false,
          warning:
            'Mode mock actif: abonnement simule. Ajoutez SUPABASE_SERVICE_ROLE_KEY pour persister.',
          subscription: mockRecord,
        },
        { status: 200 },
      );
    }

    const { error: upsertError } = await admin.from(tableName).upsert(mockRecord, {
      onConflict: 'user_id',
    });

    if (upsertError) {
      return NextResponse.json(
        {
          persisted: false,
          warning: `Mode mock actif mais sauvegarde impossible dans ${tableName}.`,
          details: upsertError.message,
          subscription: mockRecord,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      persisted: true,
      subscription: mockRecord,
      warning: 'Mode mock actif: aucun debit reel Stripe.',
    });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Configuration Stripe manquante.' }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
    expand: ['subscription'],
  });

  const ownerFromSession = session.client_reference_id ?? session.metadata?.user_id ?? null;
  if (ownerFromSession !== user.id) {
    return NextResponse.json({ error: 'Session de paiement non autorisee.' }, { status: 403 });
  }

  const stripeSubscription: StripeSubscriptionWithPeriod | null =
    typeof session.subscription === 'string' || !session.subscription
      ? null
      : (session.subscription as StripeSubscriptionWithPeriod);

  const normalizedStatus = stripeSubscription?.status ?? 'incomplete';
  const subscriptionRecord: SubscriptionRecord = {
    user_id: user.id,
    plan_key: session.metadata?.plan_key ?? 'starter',
    status: normalizedStatus,
    stripe_customer_id:
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id ?? null,
    stripe_subscription_id: stripeSubscription?.id ?? null,
    current_period_start: toIso(stripeSubscription?.current_period_start),
    current_period_end: toIso(stripeSubscription?.current_period_end),
    last_checkout_session_id: session.id,
    updated_at: new Date().toISOString(),
  };

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        persisted: false,
        warning:
          'Paiement confirme mais impossible de sauvegarder l abonnement: configurez SUPABASE_SERVICE_ROLE_KEY.',
        subscription: subscriptionRecord,
      },
      { status: 200 },
    );
  }

  const tableName = process.env.SUPABASE_SUBSCRIPTIONS_TABLE ?? 'subscriptions';

  const { error: upsertError } = await admin.from(tableName).upsert(subscriptionRecord, {
    onConflict: 'user_id',
  });

  if (upsertError) {
    return NextResponse.json(
      {
        persisted: false,
        warning: `Paiement confirme mais sauvegarde impossible dans ${tableName}.`,
        details: upsertError.message,
        subscription: subscriptionRecord,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ persisted: true, subscription: subscriptionRecord });
}
