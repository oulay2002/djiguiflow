import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const runtime = 'nodejs';

type StripeSubscriptionWithPeriod = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

type SubscriptionRow = {
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

function toIso(timestampInSeconds: number | null | undefined): string | null {
  if (!timestampInSeconds) {
    return null;
  }
  return new Date(timestampInSeconds * 1000).toISOString();
}

function getPlanFromPriceId(priceId: string | null): string | null {
  if (!priceId) {
    return null;
  }

  if (priceId === process.env.STRIPE_PRICE_PRO) {
    return 'pro';
  }

  if (priceId === process.env.STRIPE_PRICE_PREMIUM) {
    return 'premium';
  }

  return null;
}

function getSubscriptionTableName(): string {
  return process.env.SUPABASE_SUBSCRIPTIONS_TABLE ?? 'subscriptions';
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function upsertByUserId(params: {
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  tableName: string;
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  planKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  lastCheckoutSessionId: string;
}) {
  const payload: SubscriptionRow = {
    user_id: params.userId,
    plan_key: params.planKey,
    status: params.status,
    stripe_customer_id: params.customerId,
    stripe_subscription_id: params.subscriptionId,
    current_period_start: params.periodStart,
    current_period_end: params.periodEnd,
    last_checkout_session_id: params.lastCheckoutSessionId,
    updated_at: new Date().toISOString(),
  };

  await params.admin
    .from(params.tableName)
    .upsert(payload, { onConflict: 'user_id' });
}

async function handleCheckoutCompleted(args: {
  event: Stripe.Event;
  stripe: Stripe;
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  tableName: string;
}) {
  const session = args.event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'subscription') {
    return;
  }

  const userId = session.client_reference_id ?? session.metadata?.user_id;
  if (!userId) {
    return;
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  let subscription: StripeSubscriptionWithPeriod | null = null;
  if (typeof session.subscription === 'string') {
    subscription = (await args.stripe.subscriptions.retrieve(
      session.subscription,
    )) as StripeSubscriptionWithPeriod;
  } else if (session.subscription) {
    subscription = session.subscription as StripeSubscriptionWithPeriod;
  }

  const priceId =
    subscription?.items?.data?.[0]?.price?.id ?? null;
  const planFromPrice = getPlanFromPriceId(priceId);

  const planKey = session.metadata?.plan_key ?? planFromPrice ?? 'essai';
  const status = subscription?.status ?? 'incomplete';

  await upsertByUserId({
    admin: args.admin,
    tableName: args.tableName,
    userId,
    customerId,
    subscriptionId: subscription?.id ?? (typeof session.subscription === 'string' ? session.subscription : null),
    status,
    planKey,
    periodStart: toIso(subscription?.current_period_start),
    periodEnd: toIso(subscription?.current_period_end),
    lastCheckoutSessionId: session.id,
  });
}

async function handleSubscriptionChanged(args: {
  event: Stripe.Event;
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  tableName: string;
}) {
  const subscription = args.event.data.object as StripeSubscriptionWithPeriod;
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null;

  if (!customerId) {
    return;
  }

  const { data: existing } = await args.admin
    .from(args.tableName)
    .select('user_id,plan_key,last_checkout_session_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  const userId = existing?.user_id ?? null;
  if (!userId) {
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const planFromPrice = getPlanFromPriceId(priceId);

  await upsertByUserId({
    admin: args.admin,
    tableName: args.tableName,
    userId,
    customerId,
    subscriptionId: subscription.id,
    status: subscription.status,
    planKey: planFromPrice ?? existing?.plan_key ?? 'essai',
    periodStart: toIso(subscription.current_period_start),
    periodEnd: toIso(subscription.current_period_end),
    lastCheckoutSessionId: existing?.last_checkout_session_id ?? `webhook:${args.event.id}`,
  });
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Configuration Stripe webhook manquante.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Signature Stripe manquante.' }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = new Stripe(stripeSecretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Signature webhook invalide.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Configuration Supabase service manquante.' }, { status: 500 });
  }

  const tableName = getSubscriptionTableName();

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted({ event, stripe, admin, tableName });
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChanged({ event, admin, tableName });
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
