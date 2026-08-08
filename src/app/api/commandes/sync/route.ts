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
  } as never;

  const { data } = await sb
    .from('commandes')
    .select('reference')
    .eq('reference', reference)
    .maybeSingle();

  if (data) {
    await sb.from('commandes').update(payload).eq('reference', reference);
  } else {
    await sb.from('commandes').insert({ reference, boutique_id, client_nom: (payload as any).client_nom, client_telephone: (payload as any).client_telephone, chat_id: (payload as any).chat_id, client_adresse: (payload as any).client_adresse, total: (payload as any).total, canal: (payload as any).canal, statut: (payload as any).statut } as never);
  }

  return Response.json({ ok: true });
}