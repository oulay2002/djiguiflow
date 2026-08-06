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
    .select('reference, id, nom, categorie, prix, description')
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
  }));

  return Response.json(produits);
}
