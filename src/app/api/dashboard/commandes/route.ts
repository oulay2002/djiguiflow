import { readSheet } from '@/lib/googleSheets';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  let rows: Record<string, string>[];
  try {
    rows = await readSheet(`${m.sheetCommandes}!A:Z`, m.sheetId);
  } catch (e) {
    console.error(`Commandes — lecture ${m.sheetCommandes} impossible :`, e);
    return Response.json({ error: 'Commandes temporairement indisponibles' }, { status: 503 });
  }

  const nums = (v: unknown) => Number(String(v ?? '').replace(/\D/g, '')) || 0;

  const commandes = rows
    .filter(r => r.order_id)
    .map(r => ({
      order_id: r.order_id,
      customer_name: r.customer_name || '',
      phone: r.phone || r.chat_id || '',
      address: r.address || '',
      items: r.items || '',
      total_price: nums(r.total_price),
      timestamp: r.timestamp || '',
      canal: String(r.canal || '').toLowerCase(),
      nom_livreur: r.nom_livreur || '',
      statut_livraison: r.statut_livraison || 'en attente',
      heure_prise_en_charge: r.heure_prise_en_charge || '',
      heure_livraison: r.heure_livraison || '',
    }))
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return Response.json({ boutique_id: m.id, commandes });
}
