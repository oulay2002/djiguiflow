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
 * Identifiants Supabase autorises. Liste separee par des virgules dans
 * ADMIN_USER_IDS.
 */
function idsAdmin(): string[] {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * L'appelant est-il un admin de la plateforme ?
 *
 * Sert au garde marchand : un admin pilote toutes les boutiques depuis le
 * selecteur, il ne doit pas etre bloque par le controle de propriete.
 *
 * ── POURQUOI L'IDENTIFIANT, ET PLUS L'ADRESSE ─────────────────────────────
 *
 * UNE ADRESSE SE RECLAME. UN UUID NON. Cette regle comparait le courriel rendu
 * par Supabase a `ADMIN_EMAILS` — non falsifiable par le client, c'est vrai,
 * mais elle designe l'admin par une chose que N'IMPORTE QUI PEUT DEMANDER a
 * posseder : il suffit de s'inscrire avec.
 *
 * Ce qui l'en empechait n'etait pas un verrou. Verifie le 26 aout 2026 sur la
 * production : la confirmation d'e-mail est ETEINTE — `confirmation_sent_at`
 * est nul pour les cinq comptes, et quatre sur cinq sont confirmes dans les
 * deux secondes suivant leur creation. S'inscrire ne prouve donc pas qu'on
 * possede l'adresse. Si l'unique adresse d'`ADMIN_EMAILS` n'etait pas DEJA
 * prise — Supabase refusant un doublon —, n'importe qui serait devenu admin en
 * s'inscrivant. Une porte fermee par l'occupation, pas par une serrure.
 *
 * ── LA TRANSITION, ET POURQUOI ELLE N'EST PAS UN REPLI COMPLAISANT ────────
 *
 * `ADMIN_USER_IDS` est POSEE dans Vercel, pas dans ce depot. Tant qu'elle est
 * absente, la regle retombe sur l'ancienne — sinon ce commit couperait l'acces
 * admin a la seconde ou il se deploie, avant que la variable puisse etre
 * ajoutee. Ce repli est TEMPORAIRE et il le DIT : il journalise a chaque appel.
 *
 * Des que la variable est posee, elle fait AUTORITE et l'adresse n'est plus
 * regardee du tout. Un identifiant absent de la liste est refuse, meme si son
 * courriel y figure : c'est le sens de ce changement.
 */
export function estAdmin(
  email: string | null | undefined,
  userId?: string | null,
): boolean {
  const ids = idsAdmin();

  if (ids.length) {
    // L'appelant qui ne transmet pas l'identifiant est refuse, jamais tolere :
    // le laisser passer sur son courriel rouvrirait exactement la porte qu'on
    // vient de fermer, et le ferait en silence.
    const cible = String(userId ?? '').trim().toLowerCase();
    if (!cible) {
      /*
        CE MESSAGE N'EST VRAI QUE SI SES APPELANTS NE MENTENT PAS PAR OMISSION.

        Le 28 aout 2026 il est paru sur `/api/internal/veille/chaines` en
        accusant « un defaut d'appel » — a tort. `etatQuota` resolvait un
        compte par `getUserById`, n'obtenait rien, et passait ici deux
        `undefined` : l'appel etait correct, c'est la RESOLUTION qui avait
        echoue. Cette fonction ne peut pas faire la difference, elle ne voit
        que l'absence.

        Le correctif est donc chez l'appelant, qui LUI sait ce qu'il cherchait
        — voir `etatQuota` dans billing/quota.ts. La regle a retenir : quand
        une fonction ne peut pas connaitre une cause, elle ne doit pas la
        nommer ; c'est celui qui la connait qui parle.
      */
      console.error(
        'estAdmin — ADMIN_USER_IDS est posee mais l appelant n a pas transmis'
        + " d identifiant : refuse. C'est un defaut d'appel, pas de"
        + ' configuration.',
      );
      return false;
    }
    return ids.includes(cible);
  }

  console.error(
    'estAdmin — ADMIN_USER_IDS absente : on retombe sur ADMIN_EMAILS.'
    + " Une adresse se reclame ; posez la variable pour fermer cette porte.",
  );
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
  // FAIL-CLOSED, ET SUR LA VARIABLE QUI FAIT AUTORITE. Tant que
  // `ADMIN_USER_IDS` est absente c'est `ADMIN_EMAILS` qui decide, donc c'est
  // son absence a elle qui desactive le provisioning. Exiger les deux
  // couperait l'acces admin avant que la nouvelle soit posee.
  if (!idsAdmin().length && !emailsAdmin().length) {
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

  // UNE SEULE REGLE, PARTAGEE. Elle etait recopiee ici — `autorises.includes`
  // — et dans `estAdmin`. Deux copies d'un controle d'acces finissent par
  // diverger, et c'est celle qu'on oublie qui laisse passer.
  if (!estAdmin(email, data.user.id)) {
    return { ok: false, statut: 403, message: 'Reserve a l administration DjiguiFlow.' };
  }

  return { ok: true, userId: data.user.id, email };
}
