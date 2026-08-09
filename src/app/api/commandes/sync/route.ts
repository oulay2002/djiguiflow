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
    statut: 'en_attente',
  };

  const { data } = await sb
    .from('commandes')
    .select('reference')
    .eq('reference', reference)
    .maybeSingle();

  if (data) {
    const { error } = await sb
      .from('commandes')
      .update({ ...payload, confirmation_statut: null } as never)
      .eq('reference', reference);
    if (error) return Response.json({ error: 'UPDATE: ' + error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from('commandes')
      .insert({ ...payload, reference, boutique_id } as never);
    if (error) return Response.json({ error: 'INSERT: ' + error.message }, { status: 500 });
  }

  // ---- id de la commande (pour les articles)
  const { data: cmd } = await sb
    .from('commandes')
    .select('id')
    .eq('reference', reference)
    .maybeSingle();
  if (!cmd) return Response.json({ error: 'commande introuvable après upsert' }, { status: 500 });

  // ---- articles : tableau ou texte "2 x Soupe, Pizza"
  const raw = b.items;
  const list: string[] = Array.isArray(raw)
    ? raw.map((x: unknown) => String(x).trim()).filter(Boolean)
    : String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);

  const parsed = list
    .map((s) => {
      const m = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
      return { qte: m ? Math.max(1, parseInt(m[1], 10)) : 1, nom: (m ? m[2] : s).trim() };
    })
    .filter((p) => p.nom);

  if (parsed.length) {
    // prix connus si possible (jamais bloquant)
    let priceMap = new Map<string, number>();
    try {
      const { data: prods } = await sb.from('produits').select('*').eq('boutique_id', boutique_id);
      priceMap = new Map(
        (prods || []).map((p: any) => [
          String(p.nom || '').toLowerCase(),
          Number(p.prix ?? p.prix_unitaire ?? 0) || 0,
        ])
      );
    } catch { /* prix inconnus → 0 */ }

    // idempotence : on remplace les anciens articles
    await sb.from('commande_items').delete().eq('commande_id', cmd.id);

    const rows = parsed.map((p) => ({
      commande_id: cmd.id,
      nom_produit: p.nom,
      quantite: p.qte,
      prix_unitaire: priceMap.get(p.nom.toLowerCase()) ?? 0,
    }));

    const { error: errItems } = await sb.from('commande_items').insert(rows as never);
    if (errItems) return Response.json({ error: 'ITEMS: ' + errItems.message }, { status: 500 });
  }

  return Response.json({ ok: true, reference, articles: parsed.length });
}