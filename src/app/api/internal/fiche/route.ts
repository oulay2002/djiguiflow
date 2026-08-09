import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let data: unknown = null;

  // 1) par ID uuid (si le slug en est un)
  if (UUID_RE.test(slug)) {
    const r = await sb.from('boutiques').select('*').eq('id', slug).maybeSingle();
    data = r.data;
  }

  // 2) par slug exact
  if (!data) {
    const r = await sb.from('boutiques').select('*').eq('slug', slug).maybeSingle();
    data = r.data;
  }

  // 3) par nom (contient)
  if (!data) {
    const r = await sb
      .from('boutiques')
      .select('*')
      .ilike('nom', `%${slug}%`)
      .maybeSingle();
    data = r.data;
  }

  if (!data) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 });
  return NextResponse.json(data);
}