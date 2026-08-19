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

/**
 * A quel titre on ecrit.
 *
 * `service` — le client attend ce message : confirmation de commande, frais de
 * livraison, livreur en route. Rien ne le bloque, jamais.
 *
 * `relance` — c'est NOUS qui reprenons la parole. WhatsApp ne bannit pas au
 * volume, il bannit au premier contact non sollicite ; ce type passe donc par
 * `reserver_relance`, qui verifie la liste STOP, l'espacement et le plafond du
 * jour. Le defaut est `service` pour que les quatorze appelants existants
 * gardent exactement le comportement qu'ils avaient.
 */
export type TypeEnvoi = 'service' | 'relance';

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
      // Le jeton sort du Vault. La signature vient des types generes, donc un
      // renommage d'argument cote base casse la compilation plutot que l'appel.
      const reponse = await sb.rpc('jeton_canal', {
        p_boutique: boutique,
        p_canal: JETON_DU_CANAL[canal],
      });

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
  clavier?: unknown,
  html = false,
): Promise<{ ok: boolean; raison?: string; statut: number }> {
  // Un groupe de livreurs porte un identifiant negatif : pas de
  // normalisation telephonique ici, c'est un chat_id, pas un numero.
  const chatId = String(destinataire ?? '').trim();
  if (!chatId) return { ok: false, raison: 'destinataire vide', statut: 400 };

  // Le clavier inline n'est pas un ornement : c'est par lui que le livreur
  // repond « accepte », « parti », « livre ». Sans lui, le suivi de livraison
  // n'a plus de moyen d'entree.
  const corps: Record<string, unknown> = { chat_id: chatId, text: message };

  // `parse_mode` etait impose a tout le monde, et c'est ce qui a casse quatre
  // envois differents : des lors que Telegram analyse le texte, la moindre
  // esperluette dans un nom de client ou de produit fait repondre
  // « can't parse entities » et l'envoi entier est perdu. Le defaut est donc
  // le texte brut, que rien ne peut faire echouer ; seuls les appelants qui
  // composent volontairement des balises demandent l'analyse.
  if (html) corps.parse_mode = 'HTML';
  if (clavier && typeof clavier === 'object') corps.reply_markup = clavier;

  const res = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });

  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    return { ok: false, raison: corps.slice(0, 300) || res.statusText, statut: res.status };
  }
  return { ok: true, statut: 200 };
}

/**
 * Reserve le droit d'envoyer une relance, ou dit pourquoi c'est refuse.
 *
 * LA RESERVATION PRECEDE L'ENVOI, jamais l'inverse. Un reessai autour d'un
 * envoi le duplique — un client a deja recu trois fois le meme message. Une
 * relance reservee puis non partie ne coute rien ; une relance partie deux fois
 * coute la confiance du client.
 */
async function reserverRelance(
  boutique: string,
  destinataire: string,
  motif: string | undefined,
): Promise<{ autorise: true } | { autorise: false; motif: string }> {
  const sb = getSupabaseAdmin();

  // Sans base, on REFUSE. Le compteur est le frein : s'il est injoignable, on
  // ne sait plus a qui ni combien de fois on a deja ecrit, et c'est exactement
  // la situation ou l'on fait bannir une session.
  if (!sb) return { autorise: false, motif: 'base_indisponible' };

  try {
    const { data, error } = await sb.rpc('reserver_relance', {
      p_boutique: boutique,
      p_telephone: normaliserTelephoneCI(destinataire),
      p_motif: motif,
    });

    if (error) {
      console.error(`Relance — reservation impossible (${boutique}) :`, error.message);
      return { autorise: false, motif: 'reservation_impossible' };
    }

    const r = (data ?? {}) as { autorise?: boolean; motif?: string };
    return r.autorise === true
      ? { autorise: true }
      : { autorise: false, motif: r.motif ?? 'refus' };
  } catch (e) {
    console.error(`Relance — reservation impossible (${boutique}) :`, e);
    return { autorise: false, motif: 'reservation_impossible' };
  }
}

export async function envoyerMessage(params: {
  boutique: string;
  canal: Canal;
  destinataire: string;
  message: string;
  /**
   * `service` par defaut. Voir `TypeEnvoi` : seul `relance` passe par le frein.
   */
  type?: TypeEnvoi;
  /** Pourquoi cette relance, garde en base pour pouvoir en rendre compte. */
  motif?: string;
  /** Clavier inline Telegram, ignore sur WhatsApp. */
  clavier?: unknown;
  /**
   * Le message porte des balises HTML et doit etre analyse par Telegram.
   *
   * Faux par defaut : un texte brut ne peut pas faire echouer l'envoi, alors
   * qu'un texte analyse echoue des qu'il contient une esperluette. Seuls les
   * appelants qui composent des balises — le dispatch livreurs, l'alerte
   * retard — le demandent, et ceux-la echappent ce qu'ils y inserent.
   */
  html?: boolean;
}): Promise<ResultatEnvoi> {
  const { boutique, canal, destinataire, message, clavier, html, motif } = params;
  const type: TypeEnvoi = params.type === 'relance' ? 'relance' : 'service';

  if (!message?.trim()) {
    return { ok: false, canal, raison: 'message vide', statut: 400 };
  }

  // ---- LE FREIN. Il est ICI, dans la sortie unique, et pas dans la route
  // appelante : c'est ce qui le rend incontournable. Un workflow n8n, une page
  // du tableau de bord ou un futur appelant qu'on n'a pas encore ecrit passent
  // tous par cette fonction, donc tous par ce controle.
  //
  // 429 est deliberement distinct de 400 : l'appelant doit pouvoir dire « je
  // n'avais pas le droit » sans le confondre avec « mon message etait mal
  // forme », et surtout sans reessayer.
  if (type === 'relance') {
    const reservation = await reserverRelance(boutique, destinataire, motif);
    if (!reservation.autorise) {
      return { ok: false, canal, raison: `relance refusee (${reservation.motif})`, statut: 429 };
    }
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
        : await envoyerTelegram(jeton.jeton, destinataire, message, clavier, html === true);

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
