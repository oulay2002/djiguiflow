import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { estAdmin } from '@/lib/adminAuth';
import { accesOuvert } from '@/lib/billing/acces';

export const runtime = 'nodejs';

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

/**
 * LA REGLE A QUITTE CE FICHIER, ET C'ETAIT TOUT LE PROBLEME.
 *
 * Elle etait juste, mais son unique consommateur etait le NAVIGATEUR. Les
 * decisions serveur — quota, garde de l'assistante, limite multi-boutiques —
 * ne lisaient que `plan_key` et accordaient donc les droits d'un forfait
 * expire, indefiniment. Voir `@/lib/billing/acces`.
 */

export async function GET(request: Request) {
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

  // L'equipe DjiguiFlow n'est pas soumise a son propre paywall. Cette
  // exception vivait auparavant dans le layout client, sous forme d'une liste
  // d'emails en dur : elle partait donc dans le bundle JavaScript public.
  // Ici, la liste reste sur le serveur (ADMIN_EMAILS) et le navigateur ne
  // recoit qu'un statut.
  if (estAdmin(user.email, user.id)) {
    return NextResponse.json({
      subscription: { user_id: user.id, plan_key: 'interne', status: 'active' },
      actif: true,
    });
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ subscription: null, warning: 'SUPABASE_SERVICE_ROLE_KEY manquante.' });
  }

  const tableName = process.env.SUPABASE_SUBSCRIPTIONS_TABLE ?? 'subscriptions';

  const { data, error } = await admin
    .from(tableName)
    .select(
      'user_id,plan_key,status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,last_checkout_session_id,updated_at',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        subscription: null,
        actif: false,
        warning: `Lecture impossible depuis ${tableName}.`,
        details: error.message,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ subscription: data ?? null, actif: accesOuvert(data) });
}
