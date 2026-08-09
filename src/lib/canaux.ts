import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Envoi de messages aux clients et aux livreurs.
 *
 * Point unique de sortie du produit. Jusqu'ici, six workflows n8n portaient
 * chacun leur propre implementation : meme normalisation de numero reecrite
 * six fois, six occasions de diverger, et une cle API partagee par tous les
 * marchands.
 *
 * Le jeton d'un marchand ne quitte jamais ce serveur. n8n demande un envoi,
 * il n'obtient jamais de quoi envoyer lui-meme — c'est ce qui evite que les
 * secrets se retrouvent dans ses donnees d'execution, qu'il conserve.
 */

export type Canal = 'whatsapp' | 'telegram';

export type ResultatEnvoi =
  | { ok: true; canal: Canal; via: 'marchand' | 'plateforme' }
  | { ok: false; canal: Canal; raison: string; statut: number };

/** Canal → nom du jeton correspondant en base. */
const JETON_DU_CANAL: Record<Canal, 'wasender' | 'telegram'> = {
  whatsapp: 'wasender',
  telegram: 'telegram',
};

/**
 * Met un numero ivoirien au format attendu par WhatsApp.
 *
 * Les numeros arrivent sous toutes les formes : saisis par le client avec
 * des espaces, avec ou sans le zero initial, avec ou sans l'indicatif. Une
 * seule regle desormais, au lieu d'une par workflow.
 */
export function normaliserTelephoneCI(brut: unknown): string {
  const chiffres = String(brut ?? '').replace(/\D/g, '');
  if (!chiffres) return '';
  if (chiffres.startsWith('225')) return chiffres;
  // Un 0 initial est une notation locale : 07… vaut 2250 7…
  return '225' + chiffres;
}

/**
 * Jeton du marchand, ou celui de la plateforme tant qu'il n'a pas connecte
 * son propre numero.
 *
 * Le repli plateforme est temporaire et volontairement explicite : il permet
 * la transition sans coupure, et `via` dit toujours lequel a servi.
 */
async function resoudreJeton(
  boutique: string,
  canal: Canal,
): Promise<{ jeton: string; via: 'marchand' | 'plateforme' } | null> {
  const sb = getSupabaseAdmin();

  if (sb) {
    try {
      // `jeton_canal` est posterieure aux types generes : le client typé ne
      // la connait pas encore, d'ou le passage par une forme explicite.
      const reponse = (await sb.rpc(
        'jeton_canal' as never,
        { p_boutique: boutique, p_canal: JETON_DU_CANAL[canal] } as never,
      )) as { data: string | null; error: { message: string } | null };

      if (reponse.error) {
        console.error(
          `Canaux — lecture du jeton impossible (${boutique}/${canal}) :`,
          reponse.error.message,
        );
      } else if (typeof reponse.data === 'string' && reponse.data.trim()) {
        return { jeton: reponse.data.trim(), via: 'marchand' };
      }
    } catch (e) {
      console.error(`Canaux — acces Vault impossible (${boutique}/${canal}) :`, e);
    }
  }

  const plateforme =
    canal === 'whatsapp'
      ? process.env.WASENDER_API_KEY?.trim()
      : process.env.TELEGRAM_BOT_TOKEN?.trim();

  return plateforme ? { jeton: plateforme, via: 'plateforme' } : null;
}

async function envoyerWhatsApp(
  jeton: string,
  destinataire: string,
  message: string,
): Promise<{ ok: boolean; raison?: string; statut: number }> {
  const numero = normaliserTelephoneCI(destinataire);
  if (!numero) return { ok: false, raison: 'destinataire vide', statut: 400 };

  const res = await fetch('https://www.wasenderapi.com/api/send-message', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: numero, text: message }),
  });

  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    return { ok: false, raison: corps.slice(0, 300) || res.statusText, statut: res.status };
  }
  return { ok: true, statut: 200 };
}

async function envoyerTelegram(
  jeton: string,
  destinataire: string,
  message: string,
): Promise<{ ok: boolean; raison?: string; statut: number }> {
  // Un groupe de livreurs porte un identifiant negatif : pas de
  // normalisation telephonique ici, c'est un chat_id, pas un numero.
  const chatId = String(destinataire ?? '').trim();
  if (!chatId) return { ok: false, raison: 'destinataire vide', statut: 400 };

  const res = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  });

  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    return { ok: false, raison: corps.slice(0, 300) || res.statusText, statut: res.status };
  }
  return { ok: true, statut: 200 };
}

export async function envoyerMessage(params: {
  boutique: string;
  canal: Canal;
  destinataire: string;
  message: string;
}): Promise<ResultatEnvoi> {
  const { boutique, canal, destinataire, message } = params;

  if (!message?.trim()) {
    return { ok: false, canal, raison: 'message vide', statut: 400 };
  }

  const jeton = await resoudreJeton(boutique, canal);
  if (!jeton) {
    // Ni jeton marchand ni jeton plateforme : envoyer serait impossible, le
    // dire est preferable a un echec silencieux.
    return {
      ok: false,
      canal,
      raison: `aucun jeton ${canal} pour ${boutique} ni pour la plateforme`,
      statut: 424,
    };
  }

  try {
    const envoi =
      canal === 'whatsapp'
        ? await envoyerWhatsApp(jeton.jeton, destinataire, message)
        : await envoyerTelegram(jeton.jeton, destinataire, message);

    if (!envoi.ok) {
      console.error(`Canaux — envoi ${canal} refuse (${boutique}) :`, envoi.raison);
      return { ok: false, canal, raison: envoi.raison ?? 'refus', statut: envoi.statut };
    }
    return { ok: true, canal, via: jeton.via };
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'erreur reseau';
    console.error(`Canaux — envoi ${canal} impossible (${boutique}) :`, raison);
    return { ok: false, canal, raison, statut: 502 };
  }
}
