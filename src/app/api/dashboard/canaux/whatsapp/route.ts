import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normaliserTelephone } from '@/lib/telephone';
import { urlWebhookWhatsApp } from '@/lib/routeurWhatsApp';
import { creerSession, etatSession, qrDeSession } from '@/lib/wasenderSessions';
import { prevenirExploitant } from '@/lib/alerteExploitant';

export const dynamic = 'force-dynamic';

/**
 * Brancher WhatsApp en scannant un QR code.
 *
 * ── CE QUE CETTE ROUTE REMPLACE ────────────────────────────────────────────
 *
 * Cinq manœuvres manuelles, refaites pour chaque marchand : ouvrir une session
 * chez wasender, coller sa clé dans le coffre, poser un secret d'entrée,
 * déclarer le webhook, envoyer le QR. Cinq occasions de se tromper.
 *
 * La création de session rend elle-même `api_key` et `webhook_secret`, et
 * accepte l'adresse du webhook dans la même requête. Tout tient donc en un
 * bouton — et le marchand n'a qu'un QR à scanner.
 *
 * ── CE QUI NE SORT JAMAIS D'ICI ────────────────────────────────────────────
 *
 * Ni la clé d'envoi, ni le secret d'entrée. Ils passent directement de la
 * réponse de wasender aux fonctions du coffre, et le navigateur ne reçoit que
 * l'état. Un secret qui traverse un écran est un secret qu'on retrouvera un
 * jour dans une capture.
 */

/** Ce qu'on rend au navigateur : jamais un secret, jamais un corps d'erreur brut. */
type Reponse = {
  ok: boolean;
  etat: 'connectee' | 'a_scanner' | 'inconnu' | 'absente';
  qr?: string;
  message?: string;
};

async function ficheDeLaBoutique(boutiqueId: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from('boutiques')
    .select('id, slug, nom, telephone, wasender_secret_id, wasender_session_id')
    .eq('id', boutiqueId)
    .maybeSingle();

  if (error) {
    console.error('WhatsApp — lecture de la boutique impossible :', error.message);
    return null;
  }
  return data;
}

/**
 * POST — ouvrir la session.
 *
 * ── L'IDEMPOTENCE EST UNE QUESTION D'ARGENT, PAS DE PROPRETÉ ───────────────
 *
 * Chaque session occupe une place d'un forfait plafonné, et se paie tous les
 * mois. Un marchand qui clique deux fois — ce que fait un bouton qui semble ne
 * rien faire — consommerait deux places, et on ne le découvrirait que sur la
 * facture, sans savoir laquelle est la bonne.
 *
 * On refuse donc de créer dès qu'une session existe, et on rend l'état plutôt
 * qu'une erreur : de son point de vue, cliquer deux fois doit simplement
 * remontrer son QR.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) {
    return Response.json({ ok: false, etat: 'absente', message: acces.message } satisfies Reponse, {
      status: acces.statut,
    });
  }

  const fiche = await ficheDeLaBoutique(acces.marchand.boutiqueId);
  if (!fiche) {
    return Response.json(
      { ok: false, etat: 'absente', message: 'Boutique introuvable.' } satisfies Reponse,
      { status: 404 },
    );
  }

  // ---- Déjà branchée : on ne recrée rien, on rend l'état.
  if (fiche.wasender_session_id) {
    return await etatEtQr(String(fiche.wasender_session_id));
  }

  /**
   * ---- BRANCHÉE AUTREMENT, ET LE GARDE AU-DESSUS NE LA VOYAIT PAS.
   *
   * Le contrôle précédent demande « cette colonne est-elle remplie ? ». Ce
   * n'est pas la bonne question : la bonne est « cette boutique a-t-elle déjà
   * un jeton WhatsApp qui marche ? ».
   *
   * Zahara le prouve. Elle porte un jeton au coffre — ses messages partent —
   * mais AUCUN `wasender_session_id` : elle a été branchée à la main, avant
   * que ce libre-service n'existe. Le garde ne la voyait donc pas comme
   * branchée, et un clic sur « brancher WhatsApp » lui aurait ouvert une
   * SECONDE session : une place payée en plus, et la première orpheline —
   * que `supprimerSession()` ne peut pas récupérer puisque rien ne l'appelle.
   *
   * On ne découvre ce genre de perte que sur la facture, ou le jour où il
   * manque une place. C'est exactement le motif que ce dépôt poursuit : une
   * valeur absente prise pour une absence de fait.
   *
   * Pas de QR ici, et c'est normal : sans identifiant de session on ne peut
   * rien montrer. Le marchand n'en a pas besoin — son WhatsApp fonctionne
   * déjà. On le lui dit, au lieu de lui vendre un branchement qu'il a.
   */
  const sbCoffre = getSupabaseAdmin();
  if (sbCoffre) {
    try {
      const { data: jeton, error } = await sbCoffre.rpc('jeton_canal', {
        p_boutique: String(fiche.slug ?? ''),
        p_canal: 'wasender',
      });

      // UNE LECTURE DU COFFRE QUI ÉCHOUE NE VAUT PAS « PAS BRANCHÉE ». On
      // laisse passer plutôt que de bloquer un branchement légitime sur une
      // panne de lecture : le pire cas redevient l'ancien comportement.
      if (error) {
        console.error('WhatsApp — lecture du coffre impossible :', error.message);
      } else if (typeof jeton === 'string' && jeton.trim()) {
        return Response.json(
          {
            ok: true,
            etat: 'connectee',
            message:
              'Votre WhatsApp est déjà branché. Rien à refaire — et nous n’ouvrons '
              + 'pas de seconde ligne, qui vous serait facturée pour rien.',
          } satisfies Reponse,
          { status: 200 },
        );
      }
    } catch (e) {
      console.error('WhatsApp — accès au coffre impossible :', e);
    }
  }

  // ---- Le numéro d'abord. Ouvrir une session sur un numéro mal formé
  // consomme une place du forfait pour rien.
  const numero = normaliserTelephone(fiche.telephone);
  if (!numero.ok) {
    return Response.json(
      {
        ok: false,
        etat: 'absente',
        message: `${numero.erreur} Reprenez l’étape 1 avant de brancher WhatsApp.`,
      } satisfies Reponse,
      { status: 400 },
    );
  }

  const creation = await creerSession({
    nom: String(fiche.nom || fiche.slug),
    telephone: numero.international,
    webhookUrl: urlWebhookWhatsApp(String(fiche.slug)),
  });

  if (!creation.ok) {
    /**
     * LE MARCHAND LIT « NOUS VOUS RAPPELONS ». ENCORE FAUT-IL QUE QUELQU'UN LE SACHE.
     *
     * Un forfait plein n'est pas une panne, et le marchand n'y peut rien : on
     * lui promet donc un rappel. Mais cette promesse n'engage personne tant
     * que l'exploitant l'ignore — et le marchand attendrait indéfiniment, en
     * silence, persuadé qu'on s'occupe de lui.
     *
     * C'est le seul cas qu'on remonte : les autres échecs se réessaient
     * d'eux-mêmes, celui-ci exige une décision — ouvrir un second forfait, ou
     * libérer une place.
     *
     * L'alerte n'attend pas la réponse : un canal technique lent ne doit pas
     * retenir le marchand devant son écran.
     */
    if (creation.motif === 'plafond') {
      void prevenirExploitant(
        'wasender-plafond',
        [
          '⚠️ Forfait WhatsApp PLEIN',
          '',
          `« ${fiche.nom} » (${fiche.slug}) vient de demander son branchement`,
          'et ne l’a pas obtenu.',
          '',
          'Il a lu « nous vous rappelons très vite » :',
          'cette promesse n’engage que vous.',
          '',
          'Ouvrez une place, ou relevez le forfait, puis dites-lui de recliquer.',
        ].join('\n'),
      );
    }

    return Response.json(
      { ok: false, etat: 'absente', message: creation.message } satisfies Reponse,
      { status: creation.statut },
    );
  }

  const { id, apiKey, webhookSecret } = creation.session;
  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error(`WhatsApp — session ${id} creee mais base indisponible : place consommee.`);
    return Response.json(
      { ok: false, etat: 'absente', message: 'Enregistrement impossible. Écrivez-nous.' } satisfies Reponse,
      { status: 503 },
    );
  }

  /**
   * LES TROIS ÉCRITURES, ET L'ORDRE COMPTE.
   *
   * La session existe déjà chez wasender : la place est consommée quoi qu'il
   * arrive ici. Ce qu'on protège maintenant, c'est de ne pas la perdre — une
   * session dont on n'aurait gardé ni la clé ni l'identifiant occuperait une
   * place pour toujours, sans que personne sache laquelle.
   *
   * L'identifiant part donc EN PREMIER : même si le coffre échoue ensuite, on
   * peut la retrouver et la libérer.
   */
  const { error: errId } = await sb
    .from('boutiques')
    .update({ wasender_session_id: id })
    .eq('id', fiche.id);

  if (errId) {
    console.error(
      `WhatsApp — session ${id} creee mais son identifiant n'a pas ete garde (${fiche.slug}) :`,
      errId.message,
    );
  }

  const { error: errJeton } = await sb.rpc('definir_jeton_canal', {
    p_slug: String(fiche.slug),
    p_canal: 'wasender',
    p_jeton: apiKey,
  });

  const { error: errSecret } = await sb.rpc('definir_secret_webhook', {
    p_slug: String(fiche.slug),
    p_secret: webhookSecret,
  });

  if (errJeton || errSecret) {
    console.error(
      `WhatsApp — session ${id} creee mais mal enregistree (${fiche.slug}) :`,
      errJeton?.message ?? '',
      errSecret?.message ?? '',
    );
    return Response.json(
      {
        ok: false,
        etat: 'absente',
        message: 'La ligne a été ouverte mais nous n’avons pas pu la relier. Écrivez-nous.',
      } satisfies Reponse,
      { status: 503 },
    );
  }

  return await etatEtQr(id);
}

/** GET — où en est-on ? Le navigateur y revient toutes les quelques secondes. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) {
    return Response.json({ ok: false, etat: 'absente', message: acces.message } satisfies Reponse, {
      status: acces.statut,
    });
  }

  const fiche = await ficheDeLaBoutique(acces.marchand.boutiqueId);
  if (!fiche?.wasender_session_id) {
    return Response.json({ ok: true, etat: 'absente' } satisfies Reponse);
  }

  return await etatEtQr(String(fiche.wasender_session_id));
}

/**
 * L'état, et le QR seulement s'il sert encore.
 *
 * Un QR expire vite : on le redemande à chaque passage tant que la session
 * n'est pas connectée, et on cesse dès qu'elle l'est. Continuer à en demander
 * après coup ferait un appel réseau toutes les cinq secondes pour rien.
 */
async function etatEtQr(id: string): Promise<Response> {
  const etat = await etatSession(id);
  if (!etat.ok) {
    return Response.json(
      { ok: false, etat: 'inconnu', message: etat.message } satisfies Reponse,
      { status: etat.statut },
    );
  }

  if (etat.etat === 'connectee') {
    return Response.json({ ok: true, etat: 'connectee' } satisfies Reponse);
  }

  const qr = await qrDeSession(id);
  return Response.json(
    {
      ok: true,
      etat: etat.etat,
      ...(qr.ok ? { qr: qr.qr } : { message: qr.message }),
    } satisfies Reponse,
  );
}
