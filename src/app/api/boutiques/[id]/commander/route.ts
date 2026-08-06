import { readSheet, readHeaders, appendRow } from '@/lib/googleSheets';
import { getMarchand } from '@/lib/marchands';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const body = await req.json();
  const { nom, tel, adresse, instructions, panier } = body;

  // 1. Lire le menu DU MARCHAND
  const menu = await readSheet(`${m.sheetMenu}!A:I`, m.sheetId);
  const items = (panier as { id: string; quantite: number }[])
    .map(l => {
      const p = menu.find(x => x.id === l.id);
      if (!p) return null;
      return {
        plat: p.nom,
        quantité: l.quantite,
        prix_unitaire: Number(String(p.prix).replace(/\D/g, '')) || 0,
      };
    })
    .filter(it => it !== null);

  if (!items.length) return Response.json({ error: 'Panier vide' }, { status: 400 });

  const total = items.reduce((s, it) => s + it.quantité * it.prix_unitaire, 0);
  let phone = String(tel || '').replace(/\D/g, '');
  if (!phone.startsWith('225')) phone = '225' + phone;
  const order_id = `APP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const payload: Record<string, string> = {
    chat_id: phone,
    customer_name: String(nom || 'Client'),
    phone,
    address: String(adresse || ''),
    // La colonne de la feuille s'appelle « instructions » (pluriel) :
    // au singulier, payload[h] ne matchait pas et les consignes de
    // livraison étaient écrites vides.
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
    canal: 'app',
  };

  // 2. Écrire dans la feuille DU MARCHAND
  const headers = await readHeaders(`${m.sheetCommandes}!A1:Z1`, m.sheetId);
  await appendRow(`${m.sheetCommandes}!A:Z`, headers.map(h => payload[h] ?? ''), m.sheetId);

  // 3. Webhook générique (envoie boutique_id pour qu'il sache quel marchand)
  const n8nUrl = process.env.N8N_COMMANDE_APP_URL;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Authentifie l'appel aupres du webhook n8n. Meme secret que
          // celui du Vault Supabase (triggers) et de la credential n8n.
          'x-djiguiflow-secret': process.env.N8N_WEBHOOK_SECRET ?? '',
        },
        body: JSON.stringify({
          boutique_id: m.id,
          boutique_nom: m.nom,
          order_id,
          customer_name: String(nom || 'Client'),
          phone,
          address: String(adresse || ''),
          items: JSON.stringify(items),
          total_price: String(total),
          // Config du marchand : c'est elle qui rend le workflow n8n
          // générique (une seule chaîne de nodes pour tous les tenants).
          sheetCommandes: m.sheetCommandes,
          groupeLivreurs: m.groupeLivreurs,
        }),
      });
    } catch {
      // n8n injoignable : la commande reste en feuille, on ne casse rien
    }
  }

  return Response.json({ ok: true, order_id });
}