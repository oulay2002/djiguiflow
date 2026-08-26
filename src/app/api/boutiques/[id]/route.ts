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

  /**
   * CE QUE LE MARCHAND AVAIT RENSEIGNE, ET QUE PERSONNE NE VOYAIT.
   *
   * La vitrine a DEUX voies de chargement. Celle-ci — le registre — repond pour
   * TOUTE boutique qui possede un slug, c'est-a-dire toutes : la seconde voie,
   * qui lit `vitrine_boutique`, n'est jamais atteinte pour une boutique en
   * service. Or c'est elle seule qui remplissait le delai de livraison, les
   * quartiers livres, les moyens de paiement et la commande minimum.
   *
   * Resultat, constate en production le 26 aout 2026 : Chez Zahara a « 30 » et
   * « Abidjan » en base depuis des semaines, et sa vitrine n'en montrait rien.
   * Le bloc « Ce que le client doit savoir » etait mort pour tout le monde —
   * quatre reglages que le marchand remplit et qui n'atteignaient aucun client.
   *
   * ON RESTE SUR LE PUBLIC : ni classeur, ni groupe de livreurs, ni numero du
   * marchand. Ce sont exactement les colonnes que `vitrine_boutique` rend deja
   * a `anon`, donc rien de neuf n'est expose ici.
   */
  let fiche: {
    zone: string | null;
    delai_livraison: string | null;
    zones_livrees: string | null;
    paiements_acceptes: string[] | null;
    commande_minimum: number | null;
    mode_recuperation: string;
    delai_preparation_min: number | null;
    livraison_offerte_des: number | null;
  } | null = null;

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const uuid = await resoudreBoutiqueUuid(sb, m);
      if (uuid) {
        const { data } = await sb
          .from('boutiques')
          // En UNE seule chaine litterale : concatenee, elle perd son inference.
          .select('horaires, pause_jusqua, zone, delai_livraison, zones_livrees, paiements_acceptes, commande_minimum, mode_recuperation, delai_preparation_min, livraison_offerte_des')
          .eq('id', uuid)
          .maybeSingle();
        const etat = etatBoutique(data?.horaires, new Date(), data?.pause_jusqua);
        ouvert = etat.ouvert;
        messageHoraire = etat.message;

        if (data) {
          fiche = {
            zone: data.zone,
            delai_livraison: data.delai_livraison,
            zones_livrees: data.zones_livrees,
            paiements_acceptes: data.paiements_acceptes,
            // `null` reste `null` : un minimum a zero se lirait comme un vrai
            // minimum de zero franc, ce qui ne veut rien dire.
            commande_minimum:
              typeof data.commande_minimum === 'number' && data.commande_minimum > 0
                ? data.commande_minimum
                : null,
            mode_recuperation: data.mode_recuperation || 'livraison',
            delai_preparation_min: data.delai_preparation_min,
            // ZERO GARDE SA VALEUR. Un `|| null` ferait de « toujours offerte »
            // un « le livreur annonce ses frais » — l'exact contraire.
            livraison_offerte_des: data.livraison_offerte_des,
          };
        }
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
    // Le logo est PUBLIC : c'est la devanture, pas une donnee d'exploitation.
    logo: m.logo,
    ouvert,
    messageHoraire,
    // `null` quand la fiche n'a pas pu etre lue : la page se tait alors, au
    // lieu d'annoncer des valeurs par defaut que le marchand n'a pas choisies.
    fiche,
  });
}
