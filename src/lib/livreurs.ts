import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { DELAI_MESSAGE, delai } from '@/lib/reseau';

/**
 * Rattachement d'un livreur a son compte Telegram.
 *
 * Le marchand saisit ses livreurs dans le tableau de bord — nom, telephone,
 * vehicule. Mais rien de tout cela ne dit a la plateforme QUI, dans le groupe
 * Telegram, vient d'appuyer sur « J'accepte » : Telegram n'expose qu'un
 * identifiant interne, et ne communique jamais le numero de telephone de ses
 * utilisateurs.
 *
 * Le lien se noue donc par un code d'invitation. Le marchand envoie a son
 * livreur un lien `t.me/<bot>?start=<code>` ; le livreur l'ouvre une fois, le
 * bot recoit le code, et la fiche est rattachee. Le marchand n'a plus rien a
 * faire, et aucune ambiguite n'est possible : le code designe une fiche et une
 * seule.
 *
 * L'annuaire a vecu quelques heures dans un onglet Google Sheets rempli a la
 * main. C'etait une erreur : cette feuille est la tuyauterie de n8n, pas
 * l'espace de travail du marchand. On y casse la production sans s'en
 * apercevoir, et Google y range « 0102918886 » comme un nombre, avalant le zero
 * de tete — le client recevait alors un numero qui n'appelle personne, sans que
 * rien n'echoue.
 */

/**
 * 32 caracteres d'URL tires au hasard.
 *
 * Le code voyage dans un lien que le marchand transmet par WhatsApp ou SMS :
 * il doit etre indevinable, car le presenter suffit a se declarer livreur de
 * cette boutique.
 */
export function genererCodeInvitation(): string {
  return randomBytes(24).toString('base64url');
}

export function lienInvitation(bot: string, code: string): string {
  return `https://t.me/${bot}?start=${encodeURIComponent(code)}`;
}

/**
 * Nom d'utilisateur du bot du marchand, necessaire pour composer le lien.
 *
 * Demande une seule fois a Telegram (`getMe`), puis conserve en base. Le jeton,
 * lui, ne sort jamais du coffre : c'est le serveur qui interroge Telegram,
 * jamais le navigateur — meme regle que pour l'envoi des messages.
 *
 * Rend `null` plutot que de lever : un lien d'invitation indisponible est une
 * gene, pas une panne, et l'ecran doit pouvoir le dire au marchand.
 */
export async function nomBotTelegram(slug: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data: boutique } = await sb
    .from('boutiques')
    .select('telegram_bot_username')
    .eq('slug', slug)
    .maybeSingle();

  const connu = String(boutique?.telegram_bot_username ?? '').trim();
  if (connu) return connu;

  const lecture = await sb.rpc('jeton_canal', { p_boutique: slug, p_canal: 'telegram' });
  if (lecture.error) {
    console.error(`Livreurs — jeton Telegram illisible (${slug}) :`, lecture.error.message);
    return null;
  }

  const jeton = String(lecture.data ?? '').trim();
  if (!jeton) return null;

  let username = '';
  try {
    const res = await fetch(`https://api.telegram.org/bot${jeton}/getMe`, {
      signal: delai(DELAI_MESSAGE),
    });
    const rep = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    username = String(rep?.result?.username ?? '').trim();
  } catch (e) {
    console.error(`Livreurs — getMe injoignable (${slug}) :`, e);
    return null;
  }

  if (!username) return null;

  // Une mise en cache ratee n'est pas fatale : on rend quand meme le nom, quitte
  // a le redemander au prochain appel.
  const { error } = await sb
    .from('boutiques')
    .update({ telegram_bot_username: username })
    .eq('slug', slug);

  if (error) {
    console.error(`Livreurs — nom du bot non conserve (${slug}) :`, error.message);
  }

  return username;
}
