import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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