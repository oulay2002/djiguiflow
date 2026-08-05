import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { isMockBillingMode } from '@/lib/billing/mode';

export const runtime = 'nodejs';

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

  const appBaseUrl = getAppBaseUrl(request);
  if (isMockBillingMode()) {
    return NextResponse.json({
      url: `${appBaseUrl}/dashboard/paiements?portal=1&mock=1`,
    });
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante.' }, { status: 500 });
  }

  const tableName = process.env.SUPABASE_SUBSCRIPTIONS_TABLE ?? 'subscriptions';
  const { data, error } = await admin
    .from(tableName)
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Lecture impossible depuis ${tableName}.` }, { status: 500 });
  }

  const customerId = data?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: 'Aucun client Stripe trouve. Activez un abonnement avant de gerer la facturation.' },
      { status: 400 },
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Configuration Stripe manquante.' }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appBaseUrl}/dashboard/paiements`,
  });

  return NextResponse.json({ url: portalSession.url });
}
