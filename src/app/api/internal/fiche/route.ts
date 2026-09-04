import { etatBoutique } from '@/lib/horaires';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { nomsOngletsParDefaut } from '@/lib/marchands';
import { cleCanalAccepte, cleCanalRefuse, cleCanalSlugInconnu } from '@/lib/compteurCanal';
import { compterJournalier } from '@/lib/limiteur';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le secret d'entree du marchand, verifie ici plutot que dans n8n.
 *
 * Le fournisseur (wasender) signe chaque webhook avec un secret propre au
 * marchand. Le comparer dans un noeud n8n obligeait a ecrire un secret en dur
 * dans le workflow, donc a n'en avoir qu'un pour tout le monde : le webhook
 * d'un marchand acceptait les messages de n'importe quel autre. La fiche est
 * le bon endroit — c'est le seul appel qui connait deja de quel marchand on
 * parle, et le secret n'a plus a quitter la base.
 *
 * UNE EMPREINTE ABSENTE VAUT REFUS, ET C'EST UN CHANGEMENT DU 17 AOUT 2026.
 * Elle valait auparavant acceptation, au titre de « marchand pas encore
 * migre ». Le repli penchait donc du mauvais cote : tout marchand sans
 * empreinte voyait son webhook accepter n'importe quel POST forge — commandes
 * fictives, faux `callback_query` faisant defiler une livraison jusqu'a
 * « livree », et messages sortants emis par son propre bot vers des
 * destinataires choisis par l'attaquant.
 *
 * Ce qui rendait le defaut dangereux, c'est qu'il etait SILENCIEUX : l'empreinte
 * est posee par `brancherBotTelegram` apres un `setWebhook` reussi, et si cette
 * pose echoue, le canal fonctionne tout en n'etant plus protege, sans qu'aucun
 * signal ne le dise. Verifie avant de changer : zero marchand dans ce cas, les
 * deux empreintes de la seule boutique existante etant posees. Le refus ne
 * ferme donc aucun canal en service.
 *
 * La route reste protegee par SYNC_SECRET dans tous les cas — le secret de canal
 * est un SECOND facteur, qui prouve de quel marchand vient le message.
 */
type VerdictSecret = 'valide' | 'invalide' | 'empreinte_absente';

function verifierSecretWebhook(recu: string, empreinteAttendue: unknown): VerdictSecret {
  const attendu = String(empreinteAttendue ?? '').trim();
  if (!attendu) return 'empreinte_absente';

  const a = Buffer.from(createHash('sha256').update(recu, 'utf8').digest('hex'), 'utf8');
  const b = Buffer.from(attendu, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b) ? 'valide' : 'invalide';
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  let data: unknown = null;

  /**
   * UNE PANNE DE BASE N'EST PAS UNE BOUTIQUE INTROUVABLE.
   *
   * Les trois recherches ignoraient leur `error`. Une secousse de Supabase sur
   * la premiere — la plus empruntee — retombait sur la deuxieme, puis la
   * troisieme, et si elles blanchissaient aussi la route rendait un 404
   * « Boutique introuvable ».
   *
   * CE QUE CA PRODUIT. C'est la requete que fait CHAQUE webhook WhatsApp et
   * Telegram avant de toucher aux secrets de canal du marchand. n8n lisait donc
   * « ce marchand n'existe pas » — un defaut de configuration, qu'on ne
   * reessaie pas — la ou il fallait lire « la base a hoquete, reessaie ». Et
   * aucune ligne de journal ne nommait la vraie cause.
   *
   * On leve des la premiere erreur : chercher plus loin apres une panne, c'est
   * fabriquer un 404 a partir d'une indisponibilite.
   */
  const chercher = async (
    quoi: string,
    requete: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<unknown> => {
    const r = await requete;
    if (r.error) {
      console.error(`Fiche ${slug} — recherche par ${quoi} impossible :`, r.error.message);
      throw new Error(r.error.message);
    }
    return r.data;
  };

  try {
    // 1) par ID uuid (si le slug en est un)
    if (UUID_RE.test(slug)) {
      data = await chercher('id', sb.from('boutiques').select('*').eq('id', slug).maybeSingle());
    }

    // 2) par slug exact
    if (!data) {
      data = await chercher('slug', sb.from('boutiques').select('*').eq('slug', slug).maybeSingle());
    }

    // 3) par nom (contient)
    if (!data) {
      data = await chercher(
        'nom',
        sb.from('boutiques').select('*').ilike('nom', `%${slug}%`).maybeSingle(),
      );
    }
  } catch {
    // Le detail est deja journalise. 503 et non 404 : l'appelant doit reessayer,
    // pas conclure que la boutique n'existe pas.
    return NextResponse.json({ error: 'Registre indisponible' }, { status: 503 });
  }

  if (!data) {
    /**
     * ON COMPTE, ON NE CRIE PLUS.
     *
     * Ce 404 est rendu APRES une recherche qui a abouti sans rien trouver —
     * le cas « registre indisponible » est sorti plus haut en 503. Il designe
     * donc un slug qui n'est reellement aucune boutique.
     *
     * Cote n8n, il faisait echouer l'execution du routeur, qui porte un
     * `errorWorkflow` : n'importe qui pouvait faire sonner le salon de veille
     * en POSTant un slug invente sur une URL publiee dans un depot public.
     * Meme famille que le 401 traite le 3 septembre, meme remede — a ceci pres
     * que le seau est GLOBAL et non par slug, faute de quoi l'appelant
     * choisirait le nombre de lignes de la table. Voir `compteurCanal.ts`.
     */
    await compterJournalier(cleCanalSlugInconnu());
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 });
  }

  const fiche = data as {
    webhook_secret_hash?: string | null;
    telegram_webhook_secret_hash?: string | null;
  };

  // Chaque canal a son secret et son en-tete : wasender signe avec le sien,
  // Telegram renvoie le `secret_token` pose au setWebhook. On verifie celui du
  // canal dont l'appel provient, pas les deux.
  const canaux = [
    { entete: 'x-webhook-secret', empreinte: fiche.webhook_secret_hash },
    {
      entete: 'x-telegram-bot-api-secret-token',
      empreinte: fiche.telegram_webhook_secret_hash,
    },
  ] as const;

  let secretPresente = false;
  for (const { entete, empreinte } of canaux) {
    const recu = req.headers.get(entete);
    if (recu === null) continue;
    secretPresente = true;

    const verdict = verifierSecretWebhook(recu, empreinte);

    // Deux refus distincts, journalises distinctement : sans cette distinction,
    // un provisionnement inachevé se lit comme une tentative d'intrusion, et on
    // cherche au mauvais endroit.
    //
    // LES TROIS REFUS CI-DESSOUS SE COMPTENT, ET C'EST TOUT CE QUI LES REND
    // VISIBLES. Depuis que n8n ne casse plus son execution sur un 401, ce
    // compteur est le SEUL endroit ou l'on saura qu'un canal de marchand a
    // cesse de s'ouvrir. Voir `compteurCanal.ts`.
    if (verdict === 'empreinte_absente') {
      console.error(
        `Fiche — « ${slug} » présente un ${entete} mais AUCUNE empreinte n'est enregistrée.`
        + ' Canal refusé. Rebranchez le bot depuis /onboarding pour reposer l’empreinte'
        + ' (POST /api/internal/telegram/brancher).',
      );
      await compterJournalier(cleCanalRefuse(slug));
      return NextResponse.json({ error: 'Canal non provisionné' }, { status: 401 });
    }

    if (verdict === 'invalide') {
      console.warn(`Fiche — secret ${entete} invalide pour « ${slug} »`);
      await compterJournalier(cleCanalRefuse(slug));
      return NextResponse.json({ error: 'Secret webhook invalide' }, { status: 401 });
    }
  }

  // Un marchand qui a au moins un secret pose ne doit pas pouvoir etre lu en
  // omettant simplement l'en-tete : l'absence totale de preuve vaut refus.
  //
  // Mais tous les appelants ne sont pas des webhooks de canal. `Commande App`
  // lit la fiche pour un ordre passe depuis la boutique en ligne : il n'a ni
  // secret wasender ni secret Telegram a presenter, et cette regle le refusait
  // en 401 — ce qui explique qu'il n'ait jamais abouti depuis le 10 aout.
  //
  // Ces appels-la se declarent par `x-usage-interne`, et restent couverts par
  // SYNC_SECRET, exige plus haut pour tout le monde. Le second facteur garde
  // donc tout son role la ou il sert : le trafic de canal, ou le secret vient
  // du fournisseur et prouve l'origine du message.
  const usageInterne = req.headers.get('x-usage-interne') === '1';
  const aUnSecret = canaux.some(({ empreinte }) => String(empreinte ?? '').trim());
  if (aUnSecret && !secretPresente && !usageInterne) {
    console.warn(`Fiche — aucun secret presente pour « ${slug} »`);
    await compterJournalier(cleCanalRefuse(slug));
    return NextResponse.json({ error: 'Secret webhook requis' }, { status: 401 });
  }

  /**
   * L'ACCEPTATION SE COMPTE AUSSI, ET SANS ELLE LE REFUS NE VEUT RIEN DIRE.
   *
   * Des refus AVEC des acceptations, c'est un inconnu qui frappe a une porte
   * qui fonctionne : rien a signaler. Des refus SANS aucune acceptation, c'est
   * la porte du marchand qui ne s'ouvre plus. Seul le couple distingue les
   * deux, et c'est ce couple que relit la veille des chaines.
   *
   * ON NE COMPTE QUE LE TRAFIC DE CANAL. Un appel interne — `Commande App`,
   * qui se declare par `x-usage-interne` et ne presente aucun secret de canal
   * — ne prouve pas que le webhook du marchand fonctionne. Le compter
   * eteindrait l'alerte exactement dans le cas ou elle doit sonner.
   */
  if (secretPresente) await compterJournalier(cleCanalAccepte(slug));

  // n8n conserve ses donnees d'execution : tout ce qui touche aux secrets
  // resterait lisible dans ses journaux longtemps apres l'appel. Il n'a besoin
  // que de l'identite du marchand et de ses reglages — pas des empreintes, pas
  // des pointeurs de coffre.
  const publique: Record<string, unknown> = { ...fiche };
  for (const cle of [
    'webhook_secret_hash',
    'telegram_webhook_secret_hash',
    'wasender_session_hash',
    'wasender_secret_id',
    'telegram_secret_id',
  ]) {
    delete publique[cle];
  }

  // Un nom d'onglet vide est une panne garantie, pas une valeur par defaut :
  // n8n le passe tel quel a Google Sheets, qui repond « Sheet with ID  not
  // found » et interrompt la prise de commande. Constate le 12 aout 2026 :
  // `rosemonde` avait `sheet_commandes` et `sheet_menu` a NULL en base, donc
  // aucune commande n'etait possible sur ses canaux, sans que rien ne le dise.
  //
  // On rend donc la convention de provisioning plutot que le vide. L'onglet
  // peut manquer au classeur — l'erreur sera alors explicite et nommee, au
  // lieu de porter sur une chaine vide.
  const parDefaut = nomsOngletsParDefaut(String(publique.slug ?? slug));
  if (!String(publique.sheet_commandes ?? '').trim()) {
    publique.sheet_commandes = parDefaut.sheetCommandes;
  }
  if (!String(publique.sheet_menu ?? '').trim()) {
    publique.sheet_menu = parDefaut.sheetMenu;
  }
  if (!String(publique.sheet_notes ?? '').trim()) {
    publique.sheet_notes = 'Notes';
  }

  // L'etat d'ouverture, CALCULE ICI et rendu tout cuit.
  //
  // Les routeurs n8n ne savent pas lire un JSON d'horaires ni raisonner sur un
  // creneau qui enjambe minuit — et on ne veut pas qu'ils apprennent : la regle
  // vit dans `horaires.ts`, une seule fois, et c'est ce qui l'empeche de
  // diverger comme l'ont fait le test de la note client puis celui du visuel.
  //
  // Le champ sert de VERROU, pas d'indication. Une consigne au modele de
  // langage ne tient pas — Mistral a deja ignore une « REGLE ABSOLUE ». C'est
  // au routeur de s'arreter avant d'appeler l'assistante.
  // La pause immediate passe par le meme champ : le routeur n8n qui teste
  // `ouvert` n'a rien a apprendre de nouveau, et le marchand qui appuie sur
  // « Je ferme » coupe d'un coup la vitrine ET l'assistante WhatsApp.
  const etat = etatBoutique(publique.horaires, new Date(), publique.pause_jusqua);
  publique.ouvert = etat.ouvert;
  publique.message_horaires = etat.message ?? '';

  return NextResponse.json(publique);
}