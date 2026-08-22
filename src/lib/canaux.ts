import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { DELAI_MESSAGE, delai } from '@/lib/reseau';

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

/**
 * Le salon vers lequel detourner les envois d'une boutique de banc.
 *
 * Rend `null` pour toute boutique reelle — c'est le cas de tout le monde sauf
 * les boutiques de banc, dont c'est la seule raison d'exister.
 *
 * ON N'ECHOUE PAS SUR UNE LECTURE RATEE. Si la base ne repond pas, on rend
 * `null` et l'envoi part normalement : mieux vaut un message reellement
 * delivre qu'un message perdu parce qu'une colonne de test etait illisible.
 * Le risque inverse — une vraie boutique detournee par erreur — est exclu par
 * la forme de la colonne : elle porte une DESTINATION, pas un booleen.
 */
async function salonDeBanc(boutique: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  // `boutique` est tantot un slug, tantot un uuid selon l'appelant. Filtrer sur
  // `id` avec un slug fait lever Postgres au lieu de ne rien rendre.
  const estUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boutique);

  try {
    const requete = sb.from('boutiques').select('banc_telegram_id');
    const { data, error } = estUuid
      ? await requete.eq('id', boutique).maybeSingle()
      : await requete.eq('slug', boutique).maybeSingle();

    if (error) {
      console.error(`Canaux — lecture du salon de banc impossible (${boutique}) :`, error.message);
      return null;
    }
    const salon = String(data?.banc_telegram_id ?? '').trim();
    return salon || null;
  } catch (e) {
    console.error(`Canaux — salon de banc illisible (${boutique}) :`, e);
    return null;
  }
}

/**
 * Ce que le salon de banc recoit a la place du destinataire reel.
 *
 * L'en-tete est la moitie utile du detournement : sans lui on lirait un message
 * sans savoir A QUI ni PAR QUEL CANAL il devait partir — c'est-a-dire sans
 * pouvoir verifier l'isolement, qui est justement ce qu'on eprouve.
 */
export function messageDeBanc(canal: Canal, destinataire: string, message: string): string {
  return `🧪 BANC · ${canal} → ${destinataire || '(destinataire vide)'}\n\n${message}`;
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
    // Un fournisseur qui PEND retient tous les appelants de la sortie unique.
    signal: delai(DELAI_MESSAGE),
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
    signal: delai(DELAI_MESSAGE),
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
  jours: number | undefined,
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
      ...(typeof jours === 'number' ? { p_jours: jours } : {}),
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

/**
 * Retire le gras Markdown d'un message qui part en TEXTE BRUT.
 *
 * Le modele de langage ecrit spontanement `**15 000 FCFA**`. Ces messages
 * partent sans `parse_mode` — a dessein, un texte analyse echoue des qu'il
 * contient une esperluette — et le client lit donc les asterisques en clair.
 * Vu par un vrai client le 19 aout 2026.
 *
 * ON NETTOIE ICI PLUTOT QUE DANS LE PROMPT. Une consigne au modele n'est pas un
 * verrou : Mistral a deja ignore une « REGLE ABSOLUE ». Ce nettoyage-ci tient,
 * quoi qu'ecrive le modele et quel que soit le marchand.
 *
 * Seules les formes DOUBLES sont retirees. Une seule etoile est le gras natif de
 * WhatsApp, et un marchand peut legitimement l'employer : y toucher abimerait sa
 * mise en forme au lieu de la reparer.
 */
function sansGrasMarkdown(texte: string): string {
  return texte
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1');
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
  /**
   * Espacement minimal entre deux relances au meme client, en jours. 30 par
   * defaut — c'est la bonne mesure pour du demarchage.
   *
   * Le panier abandonne demande moins : le client vient d'ecrire, il a compose
   * le panier lui-meme, et lui refuser un rappel parce qu'il a hesite trois
   * semaines plus tot ferait perdre une vente sans rien proteger. La liste STOP
   * et le plafond du jour continuent de s'appliquer, eux.
   */
  jours?: number;
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
  const { boutique, canal, destinataire, message, clavier, html, motif, jours } = params;
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
    const reservation = await reserverRelance(boutique, destinataire, motif, jours);
    if (!reservation.autorise) {
      return { ok: false, canal, raison: `relance refusee (${reservation.motif})`, statut: 429 };
    }
  }

  // Le texte analyse (HTML) garde ses balises : ses appelants les composent
  // volontairement et echappent ce qu'ils y inserent.
  const texte = html === true ? message : sansGrasMarkdown(message);

  // ---- LE DETOURNEMENT DE BANC. Il vient APRES le frein, a dessein : le
  // frein doit voir le vrai destinataire, sinon le banc n'eprouve pas la regle
  // qu'il pretend eprouver — la liste STOP et l'espacement sont keyes sur le
  // client, pas sur le salon.
  //
  // Il vient AVANT la resolution du jeton, aussi a dessein : une boutique de
  // banc n'a pas besoin d'avoir des canaux branches. C'est meme le contraire
  // qu'on veut — qu'elle n'en ait aucun, pour qu'aucune erreur de configuration
  // ne puisse la faire ecrire a quelqu'un.
  const salon = await salonDeBanc(boutique);
  if (salon) {
    const jetonVeille = process.env.TELEGRAM_ALERTE_TOKEN?.trim();
    if (!jetonVeille) {
      return {
        ok: false,
        canal,
        raison: 'boutique de banc sans TELEGRAM_ALERTE_TOKEN : rien ne peut etre observe',
        statut: 424,
      };
    }

    const envoi = await envoyerTelegram(
      jetonVeille,
      salon,
      messageDeBanc(canal, destinataire, texte),
      clavier,
      html === true,
    );

    if (!envoi.ok) {
      console.error(`Canaux — detournement de banc refuse (${boutique}) :`, envoi.raison);
      return { ok: false, canal, raison: envoi.raison ?? 'refus', statut: envoi.statut };
    }
    // `via: 'plateforme'` est exact : c'est le bot de veille qui a servi, pas
    // le marchand. Un appelant qui exige `via === 'marchand'` doit donc
    // considerer un envoi de banc comme non concluant, et c'est correct.
    return { ok: true, canal, via: 'plateforme' };
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
        ? await envoyerWhatsApp(jeton.jeton, destinataire, texte)
        : await envoyerTelegram(jeton.jeton, destinataire, texte, clavier, html === true);

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

export type ReponseTelegram =
  | { ok: true; via: 'marchand' | 'plateforme'; resultat: Record<string, unknown> }
  | { ok: false; raison: string; statut: number };

/**
 * Interroge Telegram en LECTURE, avec le jeton du marchand.
 *
 * Le pendant silencieux de `envoyerMessage` : `getMe`, `getWebhookInfo`,
 * `getChat` et `getChatMember` disent l'etat d'un branchement sans qu'aucun
 * message ne parte. C'est ce qui permet de verifier qu'un bot est bien dans le
 * groupe des livreurs, et qu'il y est administrateur, SANS notifier de vrais
 * livreurs pour une course qui n'existe pas.
 *
 * ELLE VIT ICI, avec `envoyerMessage`, pour la meme raison que celle-ci : le
 * jeton du marchand ne quitte pas ce fichier. Une route de diagnostic qui
 * lirait le Vault elle-meme ouvrirait un second chemin vers les secrets, et
 * deux chemins finissent toujours par diverger.
 *
 * `via` EST RENDU ET COMPTE. Un `getMe` qui reussit avec le jeton de la
 * plateforme ne prouve rien du bot du marchand : l'appelant doit exiger
 * `via === 'marchand'`, sinon il valide le branchement de quelqu'un d'autre.
 */
export async function interrogerTelegram(
  boutique: string,
  methode: 'getMe' | 'getWebhookInfo' | 'getChat' | 'getChatMember',
  params: Record<string, unknown> = {},
): Promise<ReponseTelegram> {
  const jeton = await resoudreJeton(boutique, 'telegram');
  if (!jeton) {
    return {
      ok: false,
      raison: `aucun jeton telegram pour ${boutique} ni pour la plateforme`,
      statut: 424,
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${jeton.jeton}/${methode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: delai(DELAI_MESSAGE),
    });

    // Telegram rend 200 avec `ok: false` sur certaines erreurs metier : lire le
    // corps est obligatoire, le code HTTP seul ment.
    const corps = (await res.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    } | null;

    if (!res.ok || corps?.ok !== true) {
      return {
        ok: false,
        raison: corps?.description || res.statusText || 'refus',
        statut: res.status || 502,
      };
    }

    return { ok: true, via: jeton.via, resultat: (corps.result ?? {}) as Record<string, unknown> };
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'erreur reseau';
    console.error(`Canaux — ${methode} impossible (${boutique}) :`, raison);
    return { ok: false, raison, statut: 502 };
  }
}
