import { getMarchand } from '@/lib/marchands';

// Expose les infos publiques d'un marchand du registre Sheets.
// C'est le seul moyen pour un écran client de savoir s'il a affaire
// à une boutique du registre (canal Sheets) ou à une boutique Supabase.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  // On ne renvoie que le public : ni sheetId, ni groupeLivreurs, ni whatsapp.
  return Response.json({
    id: m.id,
    nom: m.nom,
    secteur: m.secteur,
    emoji: m.emoji,
  });
}
