import { readSheet } from '@/lib/googleSheets';
import { MARCHANDS } from '@/lib/marchands';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = MARCHANDS[id];
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const rows = await readSheet('Menu!A:I', m.sheetId);
  const produits = rows
    .filter(r => String(r.disponible || '').toUpperCase() === 'TRUE')
    .map(r => ({
      id: r.id,
      nom: r.nom,
      categorie: r.categorie,
      prix: Number(String(r.prix).replace(/\D/g, '')) || 0,
      description: r.description,
    }));
  return Response.json(produits);
}