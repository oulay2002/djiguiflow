/**
 * Les sessions wasender : créer, montrer le QR, suivre, libérer.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * Brancher WhatsApp était une manœuvre en cinq étapes manuelles : ouvrir une
 * session dans leur tableau de bord, coller la clé dans le coffre, poser un
 * secret d'entrée, déclarer le webhook, envoyer le QR au marchand. Cinq
 * occasions de se tromper, et cinq occasions d'oublier — pour chaque marchand.
 *
 * Or leur API rend elle-même les deux valeurs qu'on collait à la main : la
 * création d'une session renvoie `api_key` ET `webhook_secret`, et accepte
 * `webhook_url` dans la même requête. Les cinq étapes tiennent donc en un
 * bouton.
 *
 * ── DEUX CLÉS À NE PAS CONFONDRE ───────────────────────────────────────────
 *
 * - Le JETON DE COMPTE (`WASENDER_ACCOUNT_TOKEN`) ouvre les portes : créer,
 *   lister, supprimer une session. C'est le seul utilisé ici.
 * - La CLÉ DE SESSION (`api_key`) n'envoie que les messages d'UN marchand.
 *   Elle vit dans le coffre Supabase, et ce fichier ne fait que la transmettre
 *   à `definir_jeton_canal` — il ne la garde jamais.
 *
 * ── CE QUI COÛTE DE L'ARGENT ───────────────────────────────────────────────
 *
 * Chaque session occupe une place du forfait, et le forfait est plafonné. Une
 * session créée deux fois, c'est une place perdue tous les mois, découverte
 * sur la facture. L'idempotence ne vit pas ici mais chez l'appelant, qui seul
 * sait si la boutique a déjà la sienne — et c'est écrit là-bas en toutes
 * lettres.
 */

const RACINE = 'https://www.wasenderapi.com/api';

/** Dix secondes : un fournisseur qui pend ne doit pas retenir un marchand. */
const DELAI_MS = 10_000;

export type SessionCreee = {
  id: string;
  /** La clé d'envoi de CE marchand. À ranger dans le coffre, jamais ailleurs. */
  apiKey: string;
  /** Le secret que wasender enverra dans `X-Webhook-Signature`, en clair. */
  webhookSecret: string;
};

export type EchecWasender = {
  ok: false;
  /** Ce qu'on montre au marchand. Jamais un corps d'erreur brut. */
  message: string;
  /** Pour le journal, et pour distinguer un plafond d'une panne. */
  motif: 'sans_jeton' | 'plafond' | 'refus' | 'injoignable' | 'reponse_illisible';
  statut: number;
};

function sansJeton(): EchecWasender {
  return {
    ok: false,
    motif: 'sans_jeton',
    statut: 503,
    message: 'Le raccordement WhatsApp n’est pas configuré. Écrivez-nous, nous le faisons pour vous.',
  };
}

/**
 * Appelle wasender avec le jeton de COMPTE.
 *
 * Une panne réseau et un refus du fournisseur sont deux choses différentes :
 * la première se réessaie, la seconde non. On les distingue ici, une fois,
 * plutôt que dans chaque appelant.
 */
async function appeler(
  chemin: string,
  init: RequestInit = {},
): Promise<{ ok: true; corps: unknown } | EchecWasender> {
  const jeton = process.env.WASENDER_ACCOUNT_TOKEN?.trim();
  if (!jeton) return sansJeton();

  let res: Response;
  try {
    res = await fetch(`${RACINE}${chemin}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    console.error(`wasender ${chemin} — injoignable :`, e instanceof Error ? e.message : e);
    return {
      ok: false,
      motif: 'injoignable',
      statut: 503,
      message: 'Le service WhatsApp ne répond pas. Réessayez dans un instant.',
    };
  }

  const texte = await res.text().catch(() => '');

  if (!res.ok) {
    /**
     * LE PLAFOND N'EST PAS UNE PANNE, ET IL NE SE DIT PAS PAREIL.
     *
     * Le forfait limite le nombre de sessions. Quand il est atteint, le
     * marchand ne doit pas lire une erreur technique — il n'y peut rien, et
     * c'est l'exploitant qui doit décider d'ouvrir un second forfait. On
     * reconnaît le cas pour pouvoir le dire autrement, et pour l'alerter.
     */
    const plafond = /limit|quota|subscription|plan/i.test(texte) || res.status === 402;
    console.error(`wasender ${chemin} — refus HTTP ${res.status} :`, texte.slice(0, 300));
    return plafond
      ? {
          ok: false,
          motif: 'plafond',
          statut: 409,
          message:
            'Toutes nos lignes WhatsApp sont occupées pour le moment. '
            + 'Nous vous rappelons très vite pour brancher la vôtre.',
        }
      : {
          ok: false,
          motif: 'refus',
          statut: 502,
          message: 'Le service WhatsApp a refusé la demande. Écrivez-nous, nous prenons le relais.',
        };
  }

  try {
    return { ok: true, corps: texte ? JSON.parse(texte) : {} };
  } catch {
    console.error(`wasender ${chemin} — reponse illisible :`, texte.slice(0, 200));
    return {
      ok: false,
      motif: 'reponse_illisible',
      statut: 502,
      message: 'Réponse inattendue du service WhatsApp. Écrivez-nous.',
    };
  }
}

/** Descend `data` quand il existe, sans supposer sa présence. */
function donnees(corps: unknown): Record<string, unknown> {
  const c = (corps ?? {}) as Record<string, unknown>;
  const d = c.data;
  return (d && typeof d === 'object' ? d : c) as Record<string, unknown>;
}

/**
 * Crée la session d'un marchand, webhook compris.
 *
 * `webhookUrl` est passé À LA CRÉATION : le déclarer après coup laisserait une
 * fenêtre pendant laquelle la session existe et n'écoute rien — le marchand
 * scannerait son QR, croirait avoir fini, et ne recevrait aucun message.
 */
export async function creerSession(params: {
  nom: string;
  telephone: string;
  webhookUrl: string;
}): Promise<{ ok: true; session: SessionCreee } | EchecWasender> {
  const r = await appeler('/whatsapp-sessions', {
    method: 'POST',
    body: JSON.stringify({
      name: params.nom,
      phone_number: params.telephone,
      account_protection: true,
      // On n'a aucun besoin d'un journal de messages chez le fournisseur, et
      // c'est une copie de plus des conversations de clients.
      log_messages: false,
      webhook_url: params.webhookUrl,
      webhook_enabled: true,
      // Seul l'entrant nous intéresse : les accusés d'envoi et les réactions
      // feraient tourner le routeur pour rien, et chaque exécution se paie.
      webhook_events: ['messages.upsert'],
      ignore_groups: true,
      ignore_broadcasts: true,
    }),
  });

  if (!('ok' in r) || r.ok !== true) return r as EchecWasender;

  const d = donnees(r.corps);
  const id = String(d.id ?? '').trim();
  const apiKey = String(d.api_key ?? '').trim();
  const webhookSecret = String(d.webhook_secret ?? '').trim();

  /**
   * UNE SESSION SANS SES DEUX CLÉS EST INUTILISABLE — ET ELLE OCCUPE UNE PLACE.
   *
   * Si le fournisseur change la forme de sa réponse, on ne peut ni envoyer ni
   * recevoir. Le taire laisserait une place consommée pour rien, et un
   * marchand persuadé d'être branché. On refuse, et on le dit.
   */
  if (!id || !apiKey || !webhookSecret) {
    console.error(
      'wasender — session creee mais reponse incomplete :',
      JSON.stringify({ id: Boolean(id), apiKey: Boolean(apiKey), webhookSecret: Boolean(webhookSecret) }),
    );
    return {
      ok: false,
      motif: 'reponse_illisible',
      statut: 502,
      message: 'Le service WhatsApp a répondu sans les éléments attendus. Écrivez-nous.',
    };
  }

  return { ok: true, session: { id, apiKey, webhookSecret } };
}

/** Le QR à montrer au marchand. Il expire : on le redemande à chaque fois. */
export async function qrDeSession(
  id: string,
): Promise<{ ok: true; qr: string } | EchecWasender> {
  const r = await appeler(`/whatsapp-sessions/${encodeURIComponent(id)}/qrcode`);
  if (!('ok' in r) || r.ok !== true) return r as EchecWasender;

  const d = donnees(r.corps);
  const qr = String(d.qrCode ?? d.qrcode ?? d.qr ?? '').trim();
  if (!qr) {
    return {
      ok: false,
      motif: 'reponse_illisible',
      statut: 502,
      message: 'Le QR code n’est pas encore prêt. Réessayez dans quelques secondes.',
    };
  }
  return { ok: true, qr };
}

/**
 * L'état d'une session, ramené à ce que le marchand doit comprendre.
 *
 * On ne lui montre pas le vocabulaire du fournisseur : `connected`,
 * `need_scan`, `disconnected` ne veulent rien dire pour lui. Et surtout, on
 * distingue « pas encore connecté » de « on ne sait pas » — une panne de
 * lecture ne doit pas s'afficher comme un échec de branchement.
 */
export type EtatSession = 'connectee' | 'a_scanner' | 'inconnu';

export async function etatSession(
  id: string,
): Promise<{ ok: true; etat: EtatSession; brut: string } | EchecWasender> {
  const r = await appeler(`/whatsapp-sessions/${encodeURIComponent(id)}`);
  if (!('ok' in r) || r.ok !== true) return r as EchecWasender;

  const brut = String(donnees(r.corps).status ?? '').trim();
  const etat: EtatSession = /^connect/i.test(brut)
    ? 'connectee'
    : brut
      ? 'a_scanner'
      : 'inconnu';

  return { ok: true, etat, brut };
}

/**
 * Libère la place d'un marchand parti.
 *
 * ELLE COMPTE PLUS QU'IL N'Y PARAIT : le forfait est plafonné, et une session
 * abandonnée se paie tous les mois sans rien servir. Sans ce chemin, le
 * onzième marchand coûterait un forfait entier alors que trois places
 * dorment.
 */
export async function supprimerSession(
  id: string,
): Promise<{ ok: true } | EchecWasender> {
  const r = await appeler(`/whatsapp-sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!('ok' in r) || r.ok !== true) return r as EchecWasender;
  return { ok: true };
}
