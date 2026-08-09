import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('boutiques')
    .select('*')
    .or(`slug.eq.${slug},id.eq.${slug},nom.ilike.${slug}`)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 });

  return NextResponse.json(data);
}