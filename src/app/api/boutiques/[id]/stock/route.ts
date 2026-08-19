import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Le stock d'une boutique, pour l'assistante — et pour elle seule.
 *
 * CETTE ROUTE ETAIT PUBLIQUE. N'importe qui pouvait lire les quantites exactes
 * de n'importe quel marchand, et surtout les INTERROGER DANS LE TEMPS : deux
 * appels a une heure d'intervalle donnent le nombre d'articles vendus. Un
 * concurrent y lisait le rythme des ventes sans jamais mettre les pieds dans la
 * boutique.
 *
 * La vitrine n'en a pas besoin : elle recoit deja le stock par `/menu`, et n'en
 * montre que « Épuisé ». Le seul appelant legitime est le Cerveau, qui parle
 * avec le secret partage — sa credential a ete posee AVANT ce verrou, pour ne
 * pas priver l'assistante du stock entre deux deploiements.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const m = await resoudreMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('produits')
    .select('nom, stock, disponible')
    .eq('boutique_id', m.boutiqueId);
  if (error) return Response.json({ error: 'Indisponible' }, { status: 503 });

  return Response.json({
    stock: (data ?? []).map(p => ({
      nom: String(p.nom ?? ''),
      stock: p.stock ?? null,
      disponible: p.disponible !== false,
    })),
  });
}