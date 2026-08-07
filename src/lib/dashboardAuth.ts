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
 * @param slug Valeur brute du parametre `boutique_id` (slug, ou vide pour
 *             le marchand par defaut).
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

  const { data, error } = await sb.auth.getUser(token);
  const utilisateur = data?.user;
  if (error || !utilisateur) {
    return { ok: false, statut: 401, message: 'Session invalide ou expiree.' };
  }

  const marchand = await resoudreMarchand(slug);
  if (!marchand) return { ok: false, statut: 404, message: 'Marchand introuvable.' };

  const admin = estAdmin(utilisateur.email);
  if (admin) {
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
