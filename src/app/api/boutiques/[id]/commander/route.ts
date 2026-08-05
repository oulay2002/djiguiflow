import { readSheet, readHeaders, appendRow } from '@/lib/googleSheets';
import { MARCHANDS } from '@/lib/marchands';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = MARCHANDS[id];
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const body = await req.json();
  const { nom, tel, adresse, instructions, panier } = body;

  const menu = await readSheet('Menu!A:I', m.sheetId);
  const items = (panier as { id: string; quantite: number }[])
    .map(l => {
      const p = menu.find(x => x.id === l.id);
      if (!p) return null;
      // La feuille renvoie tout en texte : « 2 500 FCFA » doit redevenir 2500.
      return {
        plat: p.nom,
        quantité: l.quantite,
        prix_unitaire: Number(String(p.prix).replace(/\D/g, '')) || 0,
      };
    })
    .filter(it => it !== null);

  if (!items.length) return Response.json({ error: 'Panier vide' }, { status: 400 });

  const total = items.reduce((s, it) => s + it.quantité * it.prix_unitaire, 0);
  const phone = String(tel || '').replace(/\D/g, '');
  const order_id = `APP-${phone}-${Math.floor(Date.now() / 1000)}`;

  const payload: Record<string, string> = {
    chat_id: phone,
    customer_name: String(nom || 'Client'),
    phone,
    address: String(adresse || ''),
    instructions: String(instructions || ''),
    items: JSON.stringify(items),
    total_price: String(total),
    status: 'validee',
    order_id,
    timestamp: new Date().toISOString(),
    nom_livreur: '',
    heure_prise_en_charge: '',
    statut_livraison: '',
    position_livreur: '',
    heure_livraison: '',
    canal: 'whatsapp',
  };

  const headers = await readHeaders('Commandes_Zahara!A1:Z1');
  await appendRow('Commandes_Zahara!A:Z', headers.map(h => payload[h] ?? ''));

  const n8nUrl = process.env.N8N_COMMANDE_APP_URL;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id,
          customer_name: String(nom || 'Client'),
          phone,
          address: String(adresse || ''),
          items: JSON.stringify(items),
          total_price: String(total),
        }),
      });
    } catch {
      // n8n injoignable : la commande reste en feuille, on ne casse rien
    }
  }

  return Response.json({ ok: true, order_id });
}