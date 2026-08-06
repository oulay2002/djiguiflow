import { readSheet } from '@/lib/googleSheets';
import { resoudreMarchand } from '@/lib/marchands';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get('ref') || '').trim();
  if (!ref) return Response.json({ error: 'Référence requise' }, { status: 400 });

  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  let rows: Record<string, string>[];
  try {
    rows = await readSheet(`${m.sheetCommandes}!A:Z`, m.sheetId);
  } catch (e) {
    // Google Sheets sature régulièrement (429). On ne renvoie jamais
    // une 500 brute à un client qui suit sa commande.
    console.error(`Suivi — lecture ${m.sheetCommandes} impossible :`, e);
    return Response.json({ error: 'Suivi temporairement indisponible' }, { status: 503 });
  }

  const row = rows.find(r => String(r.order_id || '').trim().toLowerCase() === ref.toLowerCase());
  if (!row) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

  return Response.json({
    boutique_id: m.id,
    order_id: row.order_id,
    customer_name: row.customer_name,
    address: row.address,
    total_price: row.total_price,
    items: row.items,
    timestamp: row.timestamp,
    nom_livreur: row.nom_livreur || '',
    statut_livraison: row.statut_livraison || '',
    heure_prise_en_charge: row.heure_prise_en_charge || '',
    heure_livraison: row.heure_livraison || '',
  });
}
