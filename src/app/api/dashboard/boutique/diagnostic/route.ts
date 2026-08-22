import { NextResponse } from 'next/server';
import { envoyerMessage, interrogerTelegram, normaliserTelephoneCI } from '@/lib/canaux';
import {
  plafondJournalierDepasse,
  rafaleDepassee,
  secondesAvantMinuitAbidjan,
} from '@/lib/limiteur';
import { ficheDuConnecte } from '@/lib/onboardingBoutique';
import { URL_ROUTEUR_TELEGRAM, urlWebhookTelegram } from '@/lib/telegramBranchement';

export const dynamic = 'force-dynamic';

/**
 * « Tester ma boutique » : prouver un branchement sans passer de commande.
 *
 * POURQUOI CETTE ROUTE EXISTE. La seule facon de verifier un branchement etait
 * la commande d'essai du guide : passer soi-meme une commande depuis sa
 * vitrine, puis l'accepter comme livreur, et verifier quatre choses. Sept
 * gestes manuels, et si l'un des quatre points manque, il faut deviner
 * laquelle des sept etapes est en cause. Chaque inscription finissait par un
 * appel au support, et ce cout grandit avec le nombre de marchands.
 *
 * CE QU'ELLE NE FAIT PAS, ET C'EST DELIBERE. Aucune commande n'est creee,
 * n8n n'est pas sollicite, et AUCUN MESSAGE NE PART VERS LE GROUPE DES
 * LIVREURS. Le groupe se verifie par `getChat` et `getChatMember`, qui disent
 * si le bot y est et s'il y est administrateur sans que personne ne recoive
 * de notification. Un groupe qu'on apprend a ignorer ne repond plus aux vraies
 * courses.
 *
 * --------------------------------------------------------------------------
 * LE PIEGE CENTRAL, et la raison d'etre de la moitie de ce fichier.
 *
 * `envoyerMessage` possede un repli plateforme volontaire : quand le marchand
 * n'a pas son propre jeton, l'envoi part avec celui de la plateforme et
 * REUSSIT. Une sonde qui se contente de `ok === true` passe donc au vert sur
 * le jeton de quelqu'un d'autre, et valide precisement le branchement qui
 * n'existe pas.
 *
 * D'ou la regle, appliquee a CHAQUE appel sortant de ce fichier :
 * `via !== 'marchand'` est un ECHEC.
 * --------------------------------------------------------------------------
 *
 * LA SECONDE REGLE : bloquant quand le marchand peut agir, avertissement quand
 * il ne le peut pas. Un catalogue vide a la fin de l'onboarding est l'ordre
 * NORMAL des choses — le branchement se finit avant que la boutique se charge.
 * Le second facteur du webhook WhatsApp, c'est la plateforme qui le pose.
 * Declarer « pas pret » sur l'un ou l'autre enverrait un marchand correctement
 * branche chercher une panne qui n'existe pas.
 */

/** Mot-cle stable : les tests et les journaux s'y accrochent, pas au libelle. */
type CleControle =
  | 'numero'
  | 'whatsapp'
  | 'telegram_bot'
  | 'telegram_gerant'
  | 'groupe'
  | 'webhook_whatsapp'
  | 'catalogue';

type Controle = {
  cle: CleControle;
  /** L'etape de /aide/brancher a reprendre. 0 quand le controle n'en depend d'aucune. */
  etape: number;
  etat: 'ok' | 'echec' | 'avertissement';
  /** Une phrase pour le marchand, en francais, sans jargon ni nom de colonne. */
  message: string;
};

/**
 * Les cinq controles qui decident si la boutique est prete.
 *
 * `webhook_whatsapp` et `catalogue` n'en font PAS partie : ils ne rendent
 * jamais `echec`, et ils ne pesent jamais sur `pret`.
 */
const BLOQUANTS: readonly CleControle[] = [
  'numero',
  'whatsapp',
  'telegram_bot',
  'telegram_gerant',
  'groupe',
] as const;

/**
 * Le message d'essai, sur les deux canaux.
 *
 * Court, sans Markdown — `sansGrasMarkdown` retire le gras double, mais le
 * plus sur reste de ne pas en ecrire. Et il dit ce qu'il est : quelqu'un qui
 * le recoit sans avoir clique doit comprendre en une ligne qu'il n'a rien a
 * faire.
 */
const MESSAGE_ESSAI =
  'Essai de branchement DjiguiFlow. Si vous lisez ce message, ce canal fonctionne.'
  + " Aucune commande n'a ete creee.";

/** Trois essais par tranche de dix minutes. */
const RAFALE_LIMITE = 3;
const RAFALE_FENETRE_MS = 10 * 60_000;

/**
 * Vingt essais par jour et par boutique.
 *
 * La cle porte l'identifiant de BOUTIQUE, pas l'adresse appelante : le cout
 * d'un essai est une session wasender, donc il se compte par boutique. Et le
 * risque n'est pas la depense, c'est le bannissement — WhatsApp coupe une
 * session qui ecrit trop, et le marchand perd son canal de vente.
 */
const PLAFOND_JOURNALIER = 20;

/**
 * Au-dela, une erreur Telegram ne dit plus rien de l'instant present.
 *
 * `getWebhookInfo` garde la derniere erreur rencontree, meme reglee depuis. La
 * remonter sans borne ferait echouer le test sur une panne vieille de trois
 * jours — exactement la sonde qui crie au loup et qu'on cesse de lire.
 */
const MINUTES_ERREUR_TELEGRAM = 60;

const controle = (
  cle: CleControle,
  etape: number,
  etat: Controle['etat'],
  message: string,
): Controle => ({ cle, etape, etat, message });

/** L'hote d'une URL, ou une chaine vide si elle est illisible. */
function hote(url: unknown): string {
  try {
    return new URL(String(url ?? '')).host;
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  const r = await ficheDuConnecte(req);
  if ('erreur' in r) return NextResponse.json({ error: r.erreur }, { status: r.statut });

  const boutique = r.boutique as Record<string, unknown>;
  const id = String(boutique.id ?? '');
  const slug = String(boutique.slug ?? '').trim();

  // LES PLAFONDS PASSENT AVANT TOUT CONTROLE. Cette route envoie deux vrais
  // messages par appel : sans frein, un marchand qui clique en boucle fait
  // bannir sa propre session.
  const rafale = rafaleDepassee(`diagnostic:${id}`, RAFALE_LIMITE, RAFALE_FENETRE_MS);
  if (rafale.depassee) {
    return NextResponse.json(
      { error: 'Vous venez de tester votre boutique. Patientez un instant avant de recommencer.' },
      { status: 429, headers: { 'Retry-After': String(rafale.attendreSecondes) } },
    );
  }

  const plafond = await plafondJournalierDepasse(`diagnostic:${id}`, PLAFOND_JOURNALIER);
  if (plafond.depasse) {
    return NextResponse.json(
      { error: 'Trop d’essais aujourd’hui. Réessayez demain, ou écrivez-nous.' },
      {
        status: plafond.indisponible ? 503 : 429,
        headers: { 'Retry-After': String(secondesAvantMinuitAbidjan()) },
      },
    );
  }

  const controles: Controle[] = [];

  // ---- 1. Le numero -------------------------------------------------------
  // Il precede l'envoi : ecrire a un numero mal forme consomme un message pour
  // rien et rend une erreur wasender illisible.
  const numero = normaliserTelephoneCI(boutique.telephone);
  const numeroValide = numero.length >= 11 && numero.startsWith('225');
  controles.push(
    numeroValide
      ? controle('numero', 1, 'ok', 'Votre numéro WhatsApp est enregistré.')
      : controle(
          'numero',
          1,
          'echec',
          "Votre numéro WhatsApp manque, ou il n'est pas au format international. Reprenez l'étape 1.",
        ),
  );

  // ---- 2. WhatsApp --------------------------------------------------------
  if (!numeroValide) {
    controles.push(
      controle(
        'whatsapp',
        1,
        'echec',
        "Sans numéro valide, rien ne peut être envoyé. Reprenez l'étape 1.",
      ),
    );
  } else {
    const envoi = await envoyerMessage({
      boutique: slug || id,
      canal: 'whatsapp',
      destinataire: numero,
      message: MESSAGE_ESSAI,
      type: 'service',
    });

    if (!envoi.ok) {
      controles.push(
        controle(
          'whatsapp',
          2,
          'echec',
          "Votre numéro WhatsApp n'a pas pu envoyer le message d'essai. Reprenez l'étape 2.",
        ),
      );
    } else if (envoi.via !== 'marchand') {
      // LE PIEGE CENTRAL. L'envoi a REUSSI, avec le jeton de la plateforme.
      controles.push(
        controle(
          'whatsapp',
          2,
          'echec',
          "Votre numéro n'est pas encore connecté : le message d'essai est parti par le numéro de"
            + " la plateforme, pas par le vôtre. Reprenez l'étape 2.",
        ),
      );
    } else {
      controles.push(
        controle('whatsapp', 2, 'ok', 'Votre numéro WhatsApp a envoyé le message d’essai.'),
      );
    }
  }

  // ---- 3. Le bot Telegram -------------------------------------------------
  // Six constats distincts, parce qu'ils appellent six remedes differents.
  // Les confondre en un seul « echec » renverrait le marchand recoller son
  // jeton dans le seul cas ou ce geste ne repare rien.
  const moi = await interrogerTelegram(slug || id, 'getMe');
  const jetonDuMarchand = moi.ok && moi.via === 'marchand';
  let idDuBot = '';

  if (!moi.ok) {
    controles.push(
      controle(
        'telegram_bot',
        2,
        'echec',
        'Votre bot ne répond plus. Créez un nouveau jeton avec @BotFather et recollez-le à'
          + " l'étape 2.",
      ),
    );
  } else if (moi.via !== 'marchand') {
    controles.push(
      controle(
        'telegram_bot',
        2,
        'echec',
        "Aucun bot ne vous appartient encore : c'est celui de la plateforme qui a répondu."
          + " Collez le jeton de votre bot à l'étape 2.",
      ),
    );
  } else {
    idDuBot = String(moi.resultat.id ?? '');
    const info = await interrogerTelegram(slug || id, 'getWebhookInfo');
    const url = info.ok ? String(info.resultat.url ?? '') : '';
    const attendue = urlWebhookTelegram(slug);

    const erreurTexte = info.ok ? String(info.resultat.last_error_message ?? '') : '';
    const erreurDate = info.ok ? Number(info.resultat.last_error_date ?? 0) : 0;
    const erreurRecente =
      Boolean(erreurTexte)
      && erreurDate > 0
      && Date.now() / 1000 - erreurDate < MINUTES_ERREUR_TELEGRAM * 60;

    if (!info.ok) {
      controles.push(
        controle(
          'telegram_bot',
          2,
          'echec',
          "Impossible de lire le branchement de votre bot. Recollez son jeton à l'étape 2.",
        ),
      );
    } else if (!url) {
      controles.push(
        controle(
          'telegram_bot',
          2,
          'echec',
          "Votre bot est enregistré, mais il n'envoie pas ses messages à votre boutique."
            + " Recollez son jeton à l'étape 2.",
        ),
      );
    } else if (hote(url) !== hote(URL_ROUTEUR_TELEGRAM)) {
      // CE N'EST PAS UNE PANNE DE BRANCHEMENT, C'EST UN INCIDENT. Un bot dont
      // le webhook vise un serveur tiers signifie que quelqu'un d'autre
      // possede son jeton. Rebrancher ne repare rien : le tiers peut le
      // repointer. Le seul remede est la revocation.
      console.error(
        `Diagnostic — le webhook du bot de « ${slug} » vise un hote etranger (${hote(url)}).`
          + ' Jeton probablement compromis : revocation requise chez @BotFather.',
      );
      controles.push(
        controle(
          'telegram_bot',
          2,
          'echec',
          "Votre bot envoie ses messages à un serveur qui n'est pas le nôtre. Quelqu'un d'autre"
            + ' possède son jeton : révoquez-le tout de suite chez @BotFather, créez-en un nouveau,'
            + " et recollez-le à l'étape 2.",
        ),
      );
    } else if (url !== attendue) {
      controles.push(
        controle(
          'telegram_bot',
          2,
          'echec',
          'Votre bot pointe vers une ancienne adresse. Recollez son jeton à l’étape 2, cela le'
            + ' rebranche.',
        ),
      );
    } else if (erreurRecente) {
      // Le texte brut de Telegram peut porter une adresse interne : il part au
      // journal, jamais dans la reponse.
      console.error(
        `Diagnostic — Telegram ne parvient pas a livrer chez « ${slug} » : ${erreurTexte}`,
      );
      controles.push(
        controle(
          'telegram_bot',
          2,
          'echec',
          "Votre bot est bien branché, mais Telegram n'arrive pas à nous joindre depuis moins"
            + " d'une heure. Réessayez dans quelques minutes ; si cela dure, écrivez-nous.",
        ),
      );
    } else if (!boutique.telegram_webhook_secret_hash) {
      console.error(
        `Diagnostic — le webhook Telegram de « ${slug} » n'a aucune empreinte enregistree.`,
      );
      controles.push(
        controle(
          'telegram_bot',
          2,
          'echec',
          'Votre bot est branché mais sa liaison n’est pas signée. Recollez son jeton à l’étape 2,'
            + ' cela la répare.',
        ),
      );
    } else {
      controles.push(controle('telegram_bot', 2, 'ok', 'Votre bot Telegram est branché.'));
    }
  }

  // ---- 4. Le gerant -------------------------------------------------------
  const gerant = String(boutique.telegram_marchand ?? '').trim();
  if (!jetonDuMarchand) {
    controles.push(
      controle(
        'telegram_gerant',
        2,
        'echec',
        "Tant que votre bot n'est pas branché, il ne peut vous écrire. Reprenez l'étape 2.",
      ),
    );
  } else if (!gerant) {
    controles.push(
      controle(
        'telegram_gerant',
        3,
        'echec',
        'Votre identifiant Telegram manque. Écrivez ID en privé à votre bot, puis recopiez le'
          + " numéro à l'étape 3.",
      ),
    );
  } else {
    const envoi = await envoyerMessage({
      boutique: slug || id,
      canal: 'telegram',
      destinataire: gerant,
      message: MESSAGE_ESSAI,
      type: 'service',
    });

    controles.push(
      envoi.ok && envoi.via === 'marchand'
        ? controle('telegram_gerant', 3, 'ok', 'Votre bot vous a écrit sur Telegram.')
        : controle(
            'telegram_gerant',
            3,
            'echec',
            'Votre bot ne peut pas vous écrire. Écrivez-lui ID en privé, puis recopiez le numéro'
              + " à l'étape 3.",
          ),
    );
  }

  // ---- 5. Le groupe des livreurs -----------------------------------------
  // AUCUN MESSAGE N'EST ENVOYE ICI. `getChat` et `getChatMember` disent tout
  // ce dont on a besoin, et ne derangent personne.
  const groupe = String(boutique.groupe_livreurs ?? '').trim();
  if (!jetonDuMarchand) {
    controles.push(
      controle(
        'groupe',
        2,
        'echec',
        "Tant que votre bot n'est pas branché, le groupe ne peut pas être vérifié. Reprenez"
          + " l'étape 2.",
      ),
    );
  } else if (!groupe) {
    controles.push(
      controle(
        'groupe',
        4,
        'echec',
        "L'identifiant de votre groupe de livreurs manque. Reprenez l'étape 4.",
      ),
    );
  } else {
    const chat = await interrogerTelegram(slug || id, 'getChat', { chat_id: groupe });
    if (!chat.ok) {
      controles.push(
        controle(
          'groupe',
          4,
          'echec',
          "Votre bot n'est pas dans le groupe des livreurs, ou l'identifiant du groupe est faux."
            + " Reprenez l'étape 4.",
        ),
      );
    } else {
      const membre = await interrogerTelegram(slug || id, 'getChatMember', {
        chat_id: groupe,
        user_id: idDuBot,
      });
      const statut = membre.ok ? String(membre.resultat.status ?? '') : '';

      if (!membre.ok || statut === 'left' || statut === 'kicked') {
        controles.push(
          controle(
            'groupe',
            4,
            'echec',
            "Votre bot n'est pas dans le groupe des livreurs. Reprenez l'étape 4.",
          ),
        );
      } else if (statut !== 'administrator' && statut !== 'creator') {
        controles.push(
          controle(
            'groupe',
            4,
            'echec',
            "Votre bot est dans le groupe mais n'y est pas administrateur : il ne pourra pas y"
              + " envoyer les courses. Reprenez l'étape 4.",
          ),
        );
      } else {
        controles.push(
          controle('groupe', 4, 'ok', 'Votre bot est administrateur du groupe des livreurs.'),
        );
      }
    }
  }

  // ---- 6. Le second facteur du webhook WhatsApp --------------------------
  // AVERTISSEMENT, JAMAIS ECHEC. C'est un SECOND facteur — /api/internal/fiche
  // exige deja SYNC_SECRET de tout appelant en amont — et surtout c'est la
  // plateforme qui le pose, pas le marchand. Bloquer sur un geste qu'il ne peut
  // pas faire serait lui reprocher notre propre travail.
  if (boutique.webhook_secret_hash) {
    controles.push(
      controle('webhook_whatsapp', 0, 'ok', 'La liaison WhatsApp de votre boutique est signée.'),
    );
  } else {
    console.error(
      `Diagnostic — la boutique « ${slug} » n'a aucune empreinte de webhook WhatsApp.`
        + ' Second facteur absent : a poser cote plateforme.',
    );
    controles.push(
      controle(
        'webhook_whatsapp',
        0,
        'avertissement',
        "La liaison WhatsApp de votre boutique n'est pas encore signée. C'est à nous de le faire :"
          + " écrivez-nous, il n'y a rien à régler de votre côté.",
      ),
    );
  }

  // ---- 7. Le catalogue ----------------------------------------------------
  // AVERTISSEMENT, JAMAIS ECHEC. Le branchement se finit AVANT que la boutique
  // se charge : a la fin de l'onboarding, le catalogue est vide et c'est
  // l'ordre normal des choses.
  const { data: articles } = await r.sb
    .from('produits')
    .select('id')
    .eq('boutique_id', id)
    .eq('disponible', true)
    .limit(1);

  controles.push(
    (articles?.length ?? 0) > 0
      ? controle('catalogue', 0, 'ok', 'Votre catalogue contient des articles.')
      : controle(
          'catalogue',
          0,
          'avertissement',
          'Votre branchement est fait. Il vous reste à charger vos articles : sans eux, votre'
            + " assistante n'aura rien à proposer.",
        ),
  );

  const pret = BLOQUANTS.every(
    (cle) => controles.find((c) => c.cle === cle)?.etat === 'ok',
  );

  return NextResponse.json({
    pret,
    controles,
    verifie_le: new Date().toISOString(),
  });
}
