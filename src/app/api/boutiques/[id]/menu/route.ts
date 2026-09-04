import { getMarchand } from '@/lib/marchands';
import { chargerMenuBoutique } from '@/lib/vitrine/donnees';

/**
 * Le catalogue publie d'une boutique.
 *
 * LE CORPS DE CETTE ROUTE A DEMENAGE dans `lib/vitrine/donnees.ts` le
 * 4 septembre 2026 : la vitrine charge desormais son menu cote serveur, sans
 * repasser par HTTP. La route reste — l'assistante n8n la lit depuis le
 * 19 aout, et la vitrine s'en sert pour son repli.
 *
 * LES TROIS REPONSES SONT CONSERVEES TELLES QUELLES. `getMarchand` est rappele
 * ici pour distinguer le 404 du 503 : le registre est en cache 30 secondes,
 * l'appel ne coute rien, et confondre « cette boutique n'existe pas » avec
 * « la base n'a pas repondu » ferait dire a l'assistante qu'un commercant a
 * ferme alors que Supabase toussait.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const produits = await chargerMenuBoutique(id);
  if (!produits) return Response.json({ error: 'Menu indisponible' }, { status: 503 });

  return Response.json(produits);
}
