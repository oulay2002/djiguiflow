import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Sur QUELLE boutique on travaille — et jamais une devinette.
 *
 * CE QUE CETTE FONCTION FAISAIT, ET CE QUE CA A COUTE. Elle cherchait la
 * boutique du compte avec `.maybeSingle()` sur `user_id`. Des qu'un compte en
 * possede DEUX, cette requete echoue et rend `null` — silencieusement. On
 * retombait alors sur « la premiere boutique du registre ».
 *
 * Le 19 aout 2026, un marchand a branche sa deuxieme boutique : jeton Telegram,
 * groupe de livreurs, identifiant du gerant. TOUT est parti chez la premiere.
 * Le groupe de livreurs de la boutique en service a ete ecrase par celui de la
 * nouvelle — ses vrais livreurs ne recevaient plus rien — et le nouveau bot
 * repondait aux clients avec le catalogue et le nom de l'autre enseigne.
 *
 * DEUX CHANGEMENTS. La boutique visee arrive desormais en parametre, comme sur
 * toutes les routes du tableau de bord, et le controle de propriete est celui
 * de `exigerAccesMarchand` — le meme pour tout le monde.
 *
 * Et quand le compte possede plusieurs boutiques sans qu'on precise laquelle,
 * ON REFUSE. Choisir a la place du marchand, c'est ce qui a ecrit ses reglages
 * chez sa voisine.
 *
 * ELLE VIT ICI PLUTOT QUE DANS LA ROUTE ONBOARDING, et c'est le point de cette
 * extraction : le diagnostic de branchement a besoin exactement du meme garde.
 * Recopie, ce garde aurait diverge — et il n'existe que parce qu'il a deja
 * coute une boutique ecrasee.
 */
export async function ficheDuConnecte(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return { sb: null as never, erreur: 'Base indisponible', statut: 503 };

  const slug = new URL(req.url).searchParams.get('boutique_id');

  const acces = await exigerAccesMarchand(req, slug);
  if (!acces.ok) return { sb, erreur: acces.message, statut: acces.statut };

  // Sans boutique nommee, on verifie qu'il n'y a pas d'ambiguite AVANT
  // d'ecrire quoi que ce soit.
  if (!String(slug ?? '').trim()) {
    const { data: siennes } = await sb
      .from('boutiques')
      .select('slug, nom')
      .eq('user_id', acces.userId);

    if ((siennes?.length ?? 0) > 1) {
      return {
        sb,
        erreur:
          'Vous avez plusieurs boutiques : choisissez laquelle brancher dans le sélecteur en haut de page.',
        statut: 409,
      };
    }
  }

  const { data: boutique } = await sb
    .from('boutiques')
    .select('*')
    .eq('id', acces.marchand.boutiqueId)
    .maybeSingle();

  if (!boutique) return { sb, erreur: 'Aucune boutique liee a ce compte.', statut: 404 };

  return { sb, boutique, admin: acces.admin };
}
