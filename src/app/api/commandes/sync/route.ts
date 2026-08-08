import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const b = await req.json();
  const reference = String(b.reference || b.order_id || '').trim();
  const boutique_id = String(b.boutique_id || '').trim();
  if (!reference || !boutique_id) {
    return Response.json({ error: 'reference et boutique_id requis' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Indisponible' }, { status: 503 });

  const payload = {
    client_nom: String(b.customer_name || b.nom || 'Client'),
    client_telephone: String(b.phone || ''),
    chat_id: String(b.chat_id || b.phone || ''),
    client_adresse: String(b.address || ''),
    total: Number(b.total_price ?? b.total ?? 0) || 0,
    canal: String(b.canal || 'whatsapp'),
    statut: 'validee',
  };

  const { data } = await sb
    .from('commandes')
    .select('reference')
    .eq('reference', reference)
    .maybeSingle();

  if (data) {
    const { error } = await sb
      .from('commandes')
      .update(payload as never)
      .eq('reference', reference);
    if (error) return Response.json({ error: 'UPDATE: ' + error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from('commandes')
      .insert({ ...payload, reference, boutique_id } as never);
    if (error) return Response.json({ error: 'INSERT: ' + error.message }, { status: 500 });
  }

  return Response.json({ ok: true, reference });
}