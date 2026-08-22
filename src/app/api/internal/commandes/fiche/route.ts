import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Une commande, par sa reference — pour les workflows de livraison.
 *
 * POURQUOI ELLE EXISTE. « Acceptation Livraison » retrouvait la commande dans
 * l'onglet Google Sheets du marchand. Des que la prise de commande a cesse
 * d'ecrire dans cet onglet, la recherche est revenue vide : le livreur
 * appuyait sur « J'accepte » et PLUS RIEN ne se passait — ni itineraire, ni
 * frais, ni notification au client. Constate le 21 aout 2026, au premier essai
 * reel du decouplage.
 *
 * ELLE REND LES NOMS DE LA FEUILLE, PAS CEUX DE LA BASE. `order_id` et non
 * `reference`, `customer_name` et non `client_nom`. Ce n'est pas de la
 * negligence : une quinzaine d'expressions n8n lisent ces noms-la. Les traduire
 * ici, en un seul endroit, evite de reecrire — et de casser — quinze
 * expressions dans cinq workflows.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const reference = String(corps.order_id ?? corps.reference ?? '').trim();
  if (!reference) return Response.json({ error: 'order_id requis' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select('id, reference, jeton_suivi, client_nom, client_telephone, client_adresse, instructions, total, canal, chat_id, statut, statut_livraison, nom_livreur, frais_livraison, created_at')
    .eq('reference', reference)
    .maybeSingle();

  if (error) {
    console.error(`Fiche commande — lecture impossible (${reference}) :`, error.message);
    return Response.json({ error: 'Lecture impossible' }, { status: 503 });
  }

  // Rien trouve : on rend un tableau vide, exactement comme le faisait la
  // lecture de la feuille. Les branches qui suivent savent deja ne rien faire
  // d'un resultat vide ; un 404 les ferait lever pour une commande simplement
  // inconnue.
  if (!data) return Response.json([]);

  const { data: articles } = await sb
    .from('commande_items')
    .select('nom_produit, quantite, prix_unitaire')
    .eq('commande_id', data.id);

  return Response.json([
    {
      order_id: data.reference,
      customer_name: data.client_nom ?? '',
      phone: data.client_telephone ?? '',
      address: data.client_adresse ?? '',
      instructions: data.instructions ?? '',
      total_price: Number(data.total ?? 0),
      canal: data.canal ?? '',
      chat_id: data.chat_id ?? '',
      status: data.statut ?? '',
      statut_livraison: data.statut_livraison ?? '',
      nom_livreur: data.nom_livreur ?? '',
      frais_livraison: data.frais_livraison ?? null,
      items: JSON.stringify(
        (articles ?? []).map((a) => ({
          plat: a.nom_produit,
          quantité: a.quantite,
          prix_unitaire: a.prix_unitaire,
        })),
      ),
    },
  ]);
}
