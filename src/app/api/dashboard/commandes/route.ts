import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type LigneItem = { nom_produit: string | null; quantite: number | null; prix_unitaire: number | null };
type LigneCommande = {
  reference: string | null;
  client_nom: string | null;
  client_telephone: string | null;
  chat_id: string | null;
  client_adresse: string | null;
  total: number | null;
  created_at: string | null;
  canal: string | null;
  nom_livreur: string | null;
  statut_livraison: string | null;
  heure_prise_en_charge: string | null;
  heure_livraison: string | null;
  commande_items: LigneItem[] | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select(
      'reference, client_nom, client_telephone, chat_id, client_adresse, total, created_at, canal,' +
        ' nom_livreur, statut_livraison, heure_prise_en_charge, heure_livraison,' +
        ' commande_items(nom_produit, quantite, prix_unitaire)',
    )
    .eq('boutique_id', m.boutiqueId)
    // Un panier encore en collecte par l'agent n'est pas une commande :
    // il n'a pas a apparaitre dans la liste du gerant.
    .neq('statut', 'panier')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Commandes — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Commandes temporairement indisponibles' }, { status: 503 });
  }

  const commandes = ((data ?? []) as unknown as LigneCommande[]).map(c => ({
    order_id: c.reference ?? '',
    customer_name: c.client_nom ?? '',
    phone: c.client_telephone || c.chat_id || '',
    address: c.client_adresse ?? '',
    // Le dashboard attend encore la forme JSON heritee de la feuille.
    items: JSON.stringify(
      (c.commande_items ?? []).map(i => ({
        plat: i.nom_produit ?? '',
        quantité: i.quantite ?? 1,
        prix_unitaire: i.prix_unitaire ?? 0,
      })),
    ),
    total_price: Number(c.total ?? 0),
    timestamp: c.created_at ?? '',
    canal: String(c.canal ?? '').toLowerCase(),
    nom_livreur: c.nom_livreur ?? '',
    statut_livraison: c.statut_livraison || 'en attente',
    heure_prise_en_charge: c.heure_prise_en_charge ?? '',
    heure_livraison: c.heure_livraison ?? '',
  }));

  return Response.json({ boutique_id: m.id, commandes });
}
