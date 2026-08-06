import { readHeaders, appendRow } from '@/lib/googleSheets';
import { getMarchand } from '@/lib/marchands';
import { normaliserTelephone } from '@/lib/telephone';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const body = await req.json();
  const { nom, tel, adresse, instructions, panier } = body;

  // 1. Le catalogue vient desormais de Supabase : c'est la lecture la plus
  // frequente du parcours client, et celle qui pesait le plus sur le quota
  // Google. Les prix restent lus cote serveur, jamais recus du navigateur.
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Commande impossible pour le moment' }, { status: 503 });

  const lignesPanier = (panier ?? []) as { id: string; quantite: number }[];
  const { data: catalogue, error: erreurMenu } = await sb
    .from('produits')
    .select('reference, nom, prix')
    .eq('boutique_id', m.boutiqueId)
    .eq('disponible', true);

  if (erreurMenu) {
    console.error(`Commander — lecture catalogue impossible (${m.id}) :`, erreurMenu);
    return Response.json({ error: 'Commande impossible pour le moment' }, { status: 503 });
  }

  const items = lignesPanier
    .map(l => {
      const p = (catalogue ?? []).find(x => String(x.reference) === String(l.id));
      if (!p) return null;
      return {
        plat: String(p.nom ?? ''),
        quantité: Number(l.quantite) || 1,
        prix_unitaire: Number(p.prix) || 0,
      };
    })
    .filter(it => it !== null);

  if (!items.length) return Response.json({ error: 'Panier vide' }, { status: 400 });

  const total = items.reduce((s, it) => s + it.quantité * it.prix_unitaire, 0);

  // Meme regle que le formulaire, mais appliquee ici aussi : l'API est
  // appelable directement, et l'ancienne normalisation acceptait n'importe
  // quelle longueur — un numero trop court partait vers un tiers.
  const numero = normaliserTelephone(tel);
  if (!numero.ok) return Response.json({ error: numero.erreur }, { status: 400 });
  const phone = numero.international;

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

  // 2. Écrire dans la feuille DU MARCHAND.
  // Google Sheets reste la source de vérité tant que n8n y écrit : un échec
  // ici doit faire échouer la commande, sinon le bot ne la verrait jamais.
  try {
    const headers = await readHeaders(`${m.sheetCommandes}!A1:Z1`, m.sheetId);
    await appendRow(`${m.sheetCommandes}!A:Z`, headers.map(h => payload[h] ?? ''), m.sheetId);
  } catch (e) {
    console.error(`Commander — écriture Sheets impossible (${m.id}) :`, e);
    return Response.json({ error: 'Commande impossible pour le moment, réessayez' }, { status: 503 });
  }

  // 2 bis. Copie Supabase, non bloquante : la feuille fait foi, et une copie
  // manquante se rattrape par un rejeu. Casser une commande client pour un
  // miroir serait disproportionné.
  try {
    const { data: cmd, error: eCmd } = await sb
      .from('commandes')
      .upsert(
        {
          boutique_id: m.boutiqueId,
          reference: order_id,
          chat_id: phone,
          canal: 'app',
          client_nom: String(nom || 'Client'),
          client_telephone: phone,
          client_adresse: String(adresse || ''),
          instructions: String(instructions || ''),
          total,
          statut: 'en_attente',
        },
        { onConflict: 'boutique_id,reference' },
      )
      .select('id')
      .single();
    if (eCmd) throw eCmd;

    if (cmd?.id) {
      await sb.from('commande_items').delete().eq('commande_id', cmd.id);
      const { error: eItems } = await sb.from('commande_items').insert(
        items.map(it => ({
          commande_id: cmd.id,
          nom_produit: it.plat,
          quantite: it.quantité,
          prix_unitaire: it.prix_unitaire,
        })),
      );
      if (eItems) throw eItems;
    }
  } catch (e) {
    console.error(`Commander — copie Supabase échouée (${order_id}) :`, e);
  }

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