import { chargerFicheBoutique } from '@/lib/vitrine/donnees';

/**
 * Expose les infos publiques d'un marchand du registre.
 *
 * LE CORPS DE CETTE ROUTE A DEMENAGE dans `lib/vitrine/donnees.ts` le
 * 4 septembre 2026, parce que la vitrine le charge desormais cote serveur et
 * qu'une regle recopiee finit par diverger. La route reste : la page s'en sert
 * encore pour son repli, et un ecran client doit pouvoir savoir s'il a affaire
 * a une boutique du registre.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const fiche = await chargerFicheBoutique(id);
  if (!fiche) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });
  return Response.json(fiche);
}
