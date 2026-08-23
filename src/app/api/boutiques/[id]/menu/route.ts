import { getMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Menu indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('produits')
    // photo_url et menu_du_jour manquaient : les photos televersees par le
    // marchand n'atteignaient jamais la vitrine, et le menu du jour qu'il
    // compose restait invisible.
    .select('reference, id, nom, categorie, prix, description, photo_url, menu_du_jour, stock, groupe, couleur')
    .eq('boutique_id', m.boutiqueId)
    .eq('disponible', true)
    .order('categorie', { ascending: true })
    .order('nom', { ascending: true });

  if (error) {
    console.error(`Menu — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Menu indisponible' }, { status: 503 });
  }

  const produits = (data ?? []).map(p => ({
    // La reference de la feuille reste l'identifiant public : c'est elle que
    // le panier renvoie a /commander, et que n8n connait encore.
    id: String(p.reference ?? p.id),
    nom: String(p.nom ?? ''),
    categorie: String(p.categorie ?? ''),
    prix: Number(p.prix ?? 0),
    description: String(p.description ?? ''),
    image: String(p.photo_url ?? ''),
    duJour: Boolean(p.menu_du_jour),
    // LE STOCK ETAIT LU MAIS PAS RENDU — c'est tout ce qui manquait.
    //
    // Le tableau de bord affichait « Rupture », la vitrine proposait le plat
    // sans rien dire, et le client ne l'apprenait qu'au dernier clic, une fois
    // son panier compose et son adresse saisie. La pire facon de l'apprendre.
    //
    // `null` veut dire « le marchand ne compte pas ce produit », jamais zero :
    // confondre les deux epuiserait d'un coup tout le catalogue de ceux qui ne
    // tiennent pas de stock.
    stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
    // LA DECLINAISON. Deux articles partageant `groupe` dans une meme boutique
    // sont le meme article en plusieurs coloris : la vitrine n'en fait qu'une
    // carte. Vide, l'article s'affiche seul, exactement comme avant.
    groupe: String(p.groupe ?? '').trim(),
    couleur: String(p.couleur ?? '').trim(),
  }));

  return Response.json(produits);
}
