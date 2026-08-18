import { getMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreBoutiqueUuid } from '@/lib/boutiques';
import { etatBoutique } from '@/lib/horaires';

// Expose les infos publiques d'un marchand du registre Sheets.
// C'est le seul moyen pour un écran client de savoir s'il a affaire
// à une boutique du registre (canal Sheets) ou à une boutique Supabase.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  // L'etat d'ouverture voyage avec la fiche : la vitrine doit pouvoir le dire
  // AVANT que le client ne remplisse son panier. Le refuser seulement au moment
  // d'envoyer, apres qu'il a tout saisi, serait la pire des facons de le lui
  // apprendre.
  //
  // Le calcul vient de `etatBoutique`, la meme fonction que celle qui REFUSE la
  // commande cote serveur : l'ecran et le verrou ne peuvent donc pas dire deux
  // choses differentes.
  let ouvert = true;
  let messageHoraire: string | null = null;

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const uuid = await resoudreBoutiqueUuid(sb, m);
      if (uuid) {
        const { data } = await sb
          .from('boutiques')
          .select('horaires')
          .eq('id', uuid)
          .maybeSingle();
        const etat = etatBoutique(data?.horaires);
        ouvert = etat.ouvert;
        messageHoraire = etat.message;
      }
    } catch (e) {
      // Une lecture ratee laisse la boutique OUVERTE : mieux vaut une commande
      // de trop qu'une vitrine qui se ferme sur une panne de base.
      console.error(`Boutique ${m.id} — état d'ouverture illisible :`, e);
    }
  }

  // On ne renvoie que le public : ni sheetId, ni groupeLivreurs, ni whatsapp.
  return Response.json({
    id: m.id,
    nom: m.nom,
    secteur: m.secteur,
    emoji: m.emoji,
    ouvert,
    messageHoraire,
  });
}
