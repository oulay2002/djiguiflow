import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Emails autorises a provisionner un marchand (role « Admin DjiguiFlow »).
 * Format : liste separee par des virgules dans ADMIN_EMAILS.
 */
function emailsAdmin(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * L'email appartient-il a un admin de la plateforme ?
 *
 * Sert au garde marchand : un admin pilote toutes les boutiques depuis le
 * selecteur, il ne doit pas etre bloque par le controle de propriete.
 */
export function estAdmin(email: string | null | undefined): boolean {
  const cible = (email ?? '').toLowerCase();
  return Boolean(cible) && emailsAdmin().includes(cible);
}

export type ResultatAdmin =
  | { ok: true; userId: string; email: string }
  | { ok: false; statut: 401 | 403 | 500; message: string };

/**
 * Verifie que l'appelant est un admin de la plateforme.
 *
 * L'appelant doit joindre son access token Supabase :
 * `Authorization: Bearer <token>`. Le token est valide cote serveur, jamais
 * fait confiance a un champ du corps de la requete.
 *
 * Fail-closed : si ADMIN_EMAILS n'est pas configure, personne n'est admin.
 * Un provisioning ouvert a tous serait pire qu'un provisioning indisponible.
 */
export async function exigerAdmin(req: Request): Promise<ResultatAdmin> {
  const autorises = emailsAdmin();
  if (!autorises.length) {
    return {
      ok: false,
      statut: 500,
      message: 'ADMIN_EMAILS non configuree : provisioning desactive.',
    };
  }

  const entete = req.headers.get('authorization') ?? '';
  const token = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : '';
  if (!token) {
    return { ok: false, statut: 401, message: 'Authentification requise.' };
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return { ok: false, statut: 500, message: 'Configuration Supabase absente.' };
  }

  const { data, error } = await sb.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase() ?? '';
  if (error || !data?.user || !email) {
    return { ok: false, statut: 401, message: 'Session invalide ou expiree.' };
  }

  if (!autorises.includes(email)) {
    return { ok: false, statut: 403, message: 'Reserve a l administration DjiguiFlow.' };
  }

  return { ok: true, userId: data.user.id, email };
}
