import { readSheet } from '@/lib/googleSheets';
import { getMarchand } from '@/lib/marchands';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  try {
    // Chaque marchand a SA feuille menu (cf. registre Marchands).
    const rows = await readSheet(`${m.sheetMenu}!A:I`, m.sheetId);
    // Tolérant aux valeurs héritées (« oui », « 1 »…) : un filtre strict
    // sur 'TRUE' masquait tous les produits saisis avant l'uniformisation.
    const indisponible = new Set(['non', 'no', 'false', '0', 'épuisé', 'epuise', '']);
    const produits = rows
      .filter(r => !indisponible.has(String(r.disponible ?? '').trim().toLowerCase()))
      .map(r => ({
        id: r.id,
        nom: r.nom,
        categorie: r.categorie,
        prix: Number(String(r.prix).replace(/\D/g, '')) || 0,
        description: r.description,
      }));
    return Response.json(produits);
  } catch (e) {
    console.error(`Lecture menu ${m.id} (${m.sheetMenu}) :`, e);
    return Response.json({ error: 'Menu indisponible' }, { status: 502 });
  }
}
