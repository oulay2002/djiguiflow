import { estAdmin } from '@/lib/adminAuth';
import { resoudreMarchand, type Marchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type AccesMarchand =
  | { ok: true; marchand: Marchand; userId: string; admin: boolean }
  | { ok: false; statut: 401 | 403 | 404 | 503; message: string };

/**
 * Garde des routes /api/dashboard/*.
 *
 * Ces routes interrogent Supabase avec la cle service_role, qui contourne
 * RLS : sans ce controle, n'importe qui pourrait lire ou modifier les
 * donnees de n'importe quelle boutique en changeant le parametre
 * `boutique_id`. Le cloisonnement multi-tenant repose donc entierement ici.
 *
 * Deux verifications, dans cet ordre :
 *  1. le porteur presente un access token Supabase valide ;
 *  2. il possede la boutique visee — ou il est admin de la plateforme.
 *
 * IL N'Y A PAS DE « MARCHAND PAR DEFAUT », et ce commentaire l'a affirme a
 * tort. `getMarchand(null)` rend `null` : sans `boutique_id`, la reponse est
 * 404, jamais la premiere boutique venue. C'est la bonne conception — un repli
 * mono-marchand est precisement ce qui a fait passer le client de l'un par le
 * bot de l'autre le 20 aout 2026 — mais une consigne fausse se relit et se
 * restaure. Ne pas reintroduire ce repli.
 *
 * EPROUVE PAR `scripts/essai-isolement-dashboard.mjs`, avec deux vrais comptes
 * et deux boutiques : retirer le controle de propriete ci-dessous fait fuiter
 * les produits, commandes, statistiques et clients du voisin, et le banc
 * l'attrape. Verifie le 22 aout 2026.
 *
 * @param slug Valeur brute du parametre `boutique_id`. Vide ou inconnu : 404.
 */
export async function exigerAccesMarchand(
  req: Request,
  slug?: string | null,
): Promise<AccesMarchand> {
  const entete = req.headers.get('authorization') ?? '';
  const token = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : '';
  if (!token) return { ok: false, statut: 401, message: 'Authentification requise.' };

  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, statut: 503, message: 'Base indisponible.' };

  // Les deux lectures partent ensemble : la validation du jeton ne dit rien
  // de la boutique, et la boutique ne dit rien du jeton.
  const [{ data, error }, marchand] = await Promise.all([
    sb.auth.getUser(token),
    resoudreMarchand(slug),
  ]);

  const utilisateur = data?.user;
  if (error || !utilisateur) {
    return { ok: false, statut: 401, message: 'Session invalide ou expiree.' };
  }

  if (!marchand) return { ok: false, statut: 404, message: 'Marchand introuvable.' };

  const admin = estAdmin(utilisateur.email);
  if (admin) {
    // LE PASSE-DROIT LAISSE UNE TRACE.
    //
    // Un administrateur ouvre n'importe quel tableau de bord marchand comme
    // s'il en etait proprietaire — commandes, clients, livreurs. C'est
    // NECESSAIRE : on ne depanne pas un commercant qu'on ne peut pas voir.
    //
    // Mais c'etait jusqu'ici invisible et sans trace. Un acces qu'on ne peut
    // pas relire n'est pas un acces qu'on peut defendre le jour ou un marchand
    // demande qui a consulte ses chiffres.
    console.warn(
      `[acces-admin] ${utilisateur.email} a ouvert la boutique « ${marchand.id} »`,
    );
    return { ok: true, marchand, userId: utilisateur.id, admin: true };
  }

  const { data: possede, error: erreurBoutique } = await sb
    .from('boutiques')
    .select('id')
    .eq('id', marchand.boutiqueId)
    .eq('user_id', utilisateur.id)
    .maybeSingle();

  if (erreurBoutique) {
    console.error('Controle de propriete boutique impossible :', erreurBoutique);
    return { ok: false, statut: 503, message: 'Verification des droits impossible.' };
  }

  if (!possede) {
    // Meme message et meme code qu'une boutique inexistante : repondre 403
    // ici revelerait quelles boutiques existent.
    return { ok: false, statut: 404, message: 'Marchand introuvable.' };
  }

  return { ok: true, marchand, userId: utilisateur.id, admin: false };
}
