import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getBillingPlan, type PlanKey } from '@/lib/billing/plans';
import { isMockBillingMode } from '@/lib/billing/mode';

export const runtime = 'nodejs';

type CheckoutRequestBody = {
  plan?: string;
};

const PRICE_ENV_BY_PLAN: Record<PlanKey, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  pro: 'STRIPE_PRICE_PRO',
  premium: 'STRIPE_PRICE_PREMIUM',
};

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

function getAppBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  const origin = request.headers.get('origin')?.trim();
  if (origin) {
    return origin.replace(/\/$/, '');
  }

  const host = request.headers.get('host')?.trim();
  if (!host) {
    return 'http://localhost:3000';
  }

  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
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

  let body: CheckoutRequestBody;
  try {
    body = (await request.json()) as CheckoutRequestBody;
  } catch {
    return NextResponse.json({ error: 'Corps de requete invalide.' }, { status: 400 });
  }

  const selectedPlan = getBillingPlan(body.plan ?? '');
  if (!selectedPlan) {
    return NextResponse.json({ error: 'Plan non reconnu.' }, { status: 400 });
  }

  const appBaseUrl = getAppBaseUrl(request);
  if (isMockBillingMode()) {
    const mockSessionId = `mock_${selectedPlan.key}_${Date.now()}`;
    return NextResponse.json({
      url: `${appBaseUrl}/dashboard/paiements?success=1&session_id=${mockSessionId}&mock=1`,
    });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Configuration Stripe manquante.' }, { status: 500 });
  }

  const priceEnv = PRICE_ENV_BY_PLAN[selectedPlan.key];
  const stripePriceId = process.env[priceEnv];

  if (!stripePriceId) {
    return NextResponse.json(
      { error: `Prix Stripe manquant pour le plan ${selectedPlan.name}.` },
      { status: 500 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ],
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    metadata: {
      user_id: user.id,
      plan_key: selectedPlan.key,
      plan_name: selectedPlan.name,
    },
    success_url: `${appBaseUrl}/dashboard/paiements?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl}/dashboard/paiements?canceled=1`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Impossible de lancer le checkout Stripe.' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
