import { getMarchand, prefixeReference, type Marchand } from '@/lib/marchands';
import { resoudreBoutiqueUuid } from '@/lib/boutiques';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { etatBoutique } from '@/lib/horaires';
import { boutiquePeutVendre } from '@/lib/boutiquePrete';
import {
  horodaterRetrait,
  livraisonOfferte,
  modeAccepte,
  modeParDefaut,
  type ModeCommande,
} from '@/lib/retrait';
import {
  adresseAppelante,
  fenetreDepassee,
  plafondJournalierDepasse,
  rafaleDepassee,
  secondesAvantMinuitAbidjan,
} from '@/lib/limiteur';
import { secretWebhookN8n } from '@/lib/secretN8n';
import { DELAI_WEBHOOK, delai } from '@/lib/reseau';

/**
 * Prise de commande depuis la boutique en ligne.
 *
 * Supabase fait foi. C'est l'inverse de ce que faisait cette route jusqu'ici :
 * elle ecrivait dans Google Sheets puis esperait que n8n reporte la commande
 * dans Supabase, en avalant l'erreur si n8n ne repondait pas. Or le tableau de
 * bord, les statistiques et le suivi client lisent tous Supabase — une
 * commande restee en feuille etait donc encaissee mais invisible du marchand.
 *
 * Desormais : si l'ecriture Supabase echoue, la commande est refusee. Un
 * client qui voit une erreur et recommence coute moins cher qu'un client qui
 * croit avoir commande et que personne ne livre.
 *
 * LA FEUILLE N'EST PLUS ECRITE DU TOUT — 28 aout 2026. Le miroir survivait par
 * son commentaire : « les workflows n8n la lisent encore ». C'etait vrai
 * jusqu'au debranchement de la veille, apres quoi les 23 workflows actifs
 * n'ont plus contenu un seul noeud Google. Verifie sur l'API du VPS avant ce
 * retrait, pas de memoire.
 *
 * Une ecriture que plus personne ne lit n'est pas neutre : elle recopiait nom,
 * telephone et adresse dans un classeur que la purge de conservation n'atteint
 * pas, et elle echouait six fois par jour sur les boutiques de banc — du bruit
 * dans la surveillance de production, precisement la ou il faut du silence.
 */

type LigneCommande = {
  produitId: string | null;
  plat: string;
  /**
   * Le choix du client sur cette ligne : « 39 », « M ». Vide quand l'article
   * n'en proposait pas.
   *
   * IL NE REJOINT PAS `plat`, et c'est la tout l'enjeu. Le decompte de stock
   * rattache les lignes de l'assistante A LEUR PRODUIT PAR LE NOM, normalise :
   * un nom augmente d'une pointure ne correspondrait plus a rien, la ligne
   * deviendrait « introuvable » et le stock deriverait en silence.
   */
  variante: string;
  quantite: number;
  prixUnitaire: number;
  /** `null` = le marchand ne compte pas ce produit. Jamais confondu avec zero. */
  stock: number | null;
  disponible: boolean;
};

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Donne un prix et un nom a chaque ligne du panier.
 *
 * SUPABASE EST LA SEULE SOURCE. La feuille servait de repli « tant que la
 * migration n'est pas finie » ; elle l'est, et la vitrine ne publie de toute
 * facon que ce que `produits` contient. Le prix vient donc toujours de la
 * base, jamais d'un texte comme « 2 500 FCFA » qu'il fallait re-analyser.
 */
async function tariferPanier(
  m: Marchand,
  panier: unknown,
  sb: Admin | null,
  boutiqueUuid: string | null,
): Promise<LigneCommande[]> {
  const demandes = (Array.isArray(panier) ? panier : [])
    .map((l) => ({
      id: String((l as { id?: unknown })?.id ?? '').trim(),
      quantite: Math.max(1, Number((l as { quantite?: unknown })?.quantite) || 1),
      // On borne : cette valeur part telle quelle dans le message du marchand
      // et du livreur. Un client ne tape pas trente caracteres de pointure.
      variante: String((l as { variante?: unknown })?.variante ?? '').trim().slice(0, 40),
    }))
    .filter((l) => l.id);

  if (!demandes.length) return [];

  /**
   * INDEXE PAR ARTICLE **ET** PAR CHOIX. Une clef limitee a l'identifiant
   * aurait fondu deux pointures du meme modele en une seule ligne : le client
   * demandait un 39 et un 41, le marchand en recevait deux d'une seule taille.
   */
  const clef = (l: { id: string; variante: string }) =>
    l.variante ? `${l.id}::${l.variante}` : l.id;

  const resolues = new Map<string, LigneCommande>();

  if (sb && boutiqueUuid) {
    const { data, error } = await sb
      .from('produits')
      .select('id, nom, prix, reference, stock, disponible')
      .eq('boutique_id', boutiqueUuid);

    if (error) {
      console.error('Panier — lecture produits Supabase impossible :', error);
    }

    // La vitrine publie `reference ?? id` comme identifiant public (voir la
    // route menu). Un marchand dont les produits n'ont pas encore de
    // reference envoie donc des uuid : accepter les deux cles est ce qui
    // permet a Rose MonDE de commander, ce que la correspondance par
    // reference seule ne permettait pas.
    const parCle = new Map<string, NonNullable<typeof data>[number]>();
    for (const p of data ?? []) {
      const ref = String(p.reference ?? '').trim();
      if (ref) parCle.set(ref, p);
      parCle.set(String(p.id), p);
    }

    for (const demande of demandes) {
      const p = parCle.get(demande.id);
      if (!p) continue;

      resolues.set(clef(demande), {
        produitId: p.id,
        plat: String(p.nom ?? ''),
        variante: demande.variante,
        quantite: demande.quantite,
        prixUnitaire: Number(p.prix) || 0,
        stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
        disponible: p.disponible !== false,
      });
    }
  }

  /*
    LE REPLI PAR LA FEUILLE EST RETIRE, ET IL NE POUVAIT PLUS SE DECLENCHER.
    Il rattrapait « les marchands pas encore migres » : un article absent de
    Supabase etait cherche dans l'onglet Menu. Or la vitrine ne propose que ce
    que Supabase contient — un identifiant qui n'y est pas n'a jamais pu etre
    mis dans un panier. Verifie avant le retrait : les trois boutiques ont leur
    catalogue en base (3, 5 et 6 articles), aucune n'a zero.
    Un article introuvable est desormais simplement absent du panier, ce que
    faisait deja ce code quand la feuille ne le connaissait pas non plus.
  */

  /**
   * L'ordre du panier du client est conserve.
   *
   * ON RELIT PAR `clef(d)`, PAS PAR `d.id`. La table est remplie sous `clef` —
   * `id::variante` des qu'une declinaison existe — et testee sous `clef` vingt
   * lignes plus haut. Seule cette relecture utilisait `d.id`.
   *
   * CE QUE CA COUTAIT : toute ligne portant une pointure, une taille ou un
   * coloris etait SILENCIEUSEMENT PERDUE ici. Une commande de chaussures en 42
   * se reduisait a « Panier vide » (400) ou a une commande amputee — c'est-a-dire
   * que la fonctionnalite des declinaisons ne fonctionnait pas du tout sur la
   * vitrine, sans qu'une erreur ne le dise. Trouve a l'audit du 26 aout 2026.
   */
  return demandes
    .map((d) => resolues.get(clef(d)))
    .filter((l): l is LigneCommande => Boolean(l));
}

/**
 * LES FREINS DE LA PRISE DE COMMANDE.
 *
 * CE POINT D'ENTREE EST PUBLIC ET IL ECRIT. Il insere dans `commandes`, dans
 * `commande_items`, et il DECOMPTE LE STOCK. L'identifiant de boutique et les
 * references produits sont tous deux publics — c'est la vitrine. Sans frein,
 * une simple boucle vide le stock de n'importe quel marchand ; et comme le
 * stock bloque la commande, sa vitrine refuse ensuite ses vrais clients.
 *
 * TROIS ETAGES, ET CHACUN A SA RAISON :
 *
 * 1. PAR APPELANT ET PAR BOUTIQUE. Un vrai client commande une fois, deux
 *    s'il s'est trompe. Cinq en dix minutes depuis la meme adresse n'est plus
 *    un client.
 * 2. PAR BOUTIQUE, TOUTES ADRESSES CONFONDUES. C'est celui qui borne le
 *    degat : meme reparti sur cent adresses, un vidage de stock ne peut pas
 *    aller plus vite que vingt commandes par dix minutes, ce qui laisse au
 *    marchand le temps de voir passer l'anomalie.
 * 3. LE PLAFOND DU JOUR. Trois cents commandes par boutique et par jour. Le
 *    forfait le plus large en couvre mille par MOIS : ce plafond ne peut donc
 *    pas gener un marchand reel, il n'arrete qu'un abus.
 *
 * LE DEUXIEME ETAGE VIT EN BASE, ET C'EST CE QUI LE REND UTILE. Il l'a
 * longtemps compte en memoire du processus : le 22 aout 2026, le banc
 * multi-marchand a envoye sept commandes de suite en production sans obtenir
 * un seul refus, puis a obtenu le refus au troisieme appel au passage suivant.
 * Vercel repartit les appels sur plusieurs instances, et aucune n'atteignait
 * son seuil. Il passe donc par `reserver_fenetre`, partage entre toutes.
 *
 * Le premier etage reste en memoire, a dessein : il arrete la boucle depuis un
 * poste — le cas courant — sans aucun aller-retour vers la base. C'est un
 * plancher gratuit, pas un plafond, exactement comme `limiteur.ts` le dit.
 *
 * CE N'EST PAS UNE PROTECTION ANTI-BOT COMPLETE, et il ne faut pas le croire.
 * Un attaquant reparti sur des centaines d'adresses reste capable de nuire
 * plus lentement. La reponse propre a ce niveau-la est une protection de
 * peripherie (Vercel BotID / pare-feu) ; ces freins-ci ferment la boucle
 * triviale, celle qu'un seul poste suffit a lancer.
 */
const COMMANDES_PAR_APPELANT = 5;
const COMMANDES_PAR_BOUTIQUE = 20;
const FENETRE_COMMANDES_MS = 10 * 60_000;
const COMMANDES_PAR_JOUR = 300;

/**
 * TROIS FREINS, TROIS MESSAGES -- ET PAS UN SEUL.
 *
 * Le meme texte sortait des trois refus ET des trois pannes de compteur. Deux
 * consequences, toutes deux mesurees a la lecture :
 *
 *  - Le plafond de boutique est PAR BOUTIQUE, pas par client : au coup de feu,
 *    le 21e client d un maquis se faisait dire qu il commandait trop. Il n y
 *    est pour rien, et le texte l accusait.
 *  - Quand le compteur est simplement injoignable, la route repond 503 -- une
 *    PANNE -- avec un texte qui parle de quota. La vitrine affiche `error`
 *    verbatim et ne lit pas le statut : le client lisait « patientez » sur une
 *    indisponibilite.
 */
const TROP_VITE =
  'Vous avez envoyé plusieurs commandes coup sur coup. Patientez quelques minutes.';
const BOUTIQUE_SATUREE =
  'Cette boutique reçoit beaucoup de commandes en ce moment. Réessayez dans quelques minutes.';
const BOUTIQUE_COMPLETE =
  'Cette boutique a atteint son nombre de commandes pour aujourd’hui. Réessayez demain.';
const SERVICE_INDISPONIBLE =
  'Service momentanément indisponible. Réessayez dans un instant.';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  // LES FREINS PASSENT AVANT TOUT LE RESTE : avant de lire le corps, avant
  // d'interroger le catalogue, avant la moindre ecriture. Un appel refuse ne
  // doit rien couter.
  const appelant = adresseAppelante(req);

  const rafaleAppelant = rafaleDepassee(
    `commande:${m.id}:${appelant}`,
    COMMANDES_PAR_APPELANT,
    FENETRE_COMMANDES_MS,
  );
  if (rafaleAppelant.depassee) {
    console.error(`Commande — rafale refusee pour « ${m.id} » depuis ${appelant}.`);
    return Response.json(
      { error: TROP_VITE },
      { status: 429, headers: { 'Retry-After': String(rafaleAppelant.attendreSecondes) } },
    );
  }

  const rafaleBoutique = await fenetreDepassee(
    `commande:${m.id}`,
    COMMANDES_PAR_BOUTIQUE,
    FENETRE_COMMANDES_MS / 1000,
  );
  if (rafaleBoutique.depassee) {
    // Celui-ci est journalise en priorite : une boutique qui atteint ce seuil
    // est soit en train de tres bien marcher, soit attaquee. Les deux valent
    // qu'on le sache.
    console.error(
      `Commande — seuil de boutique atteint pour « ${m.id} » :`
        + ` plus de ${COMMANDES_PAR_BOUTIQUE} commandes en ${FENETRE_COMMANDES_MS / 60_000} min.`,
    );
    return Response.json(
      { error: rafaleBoutique.indisponible ? SERVICE_INDISPONIBLE : BOUTIQUE_SATUREE },
      {
        // 503 quand le compteur est injoignable : ce n'est pas un refus de
        // quota, c'est une panne, et l'appelant doit pouvoir les distinguer.
        status: rafaleBoutique.indisponible ? 503 : 429,
        headers: { 'Retry-After': String(FENETRE_COMMANDES_MS / 1000) },
      },
    );
  }

  // Le plafond du jour est en base, donc partage entre les instances Vercel :
  // un abus reparti sur plusieurs instances ne passe que celui-la. Quand le
  // compteur est injoignable, il refuse — et cela ne coute rien ici, puisque
  // sans base la commande ne pourrait de toute facon pas etre enregistree.
  const plafondJour = await plafondJournalierDepasse(`commande:${m.id}`, COMMANDES_PAR_JOUR);
  if (plafondJour.depasse) {
    console.error(
      `Commande — plafond du jour atteint pour « ${m.id} » (${plafondJour.valeur ?? '?'}`
        + `/${COMMANDES_PAR_JOUR}).`,
    );
    return Response.json(
      { error: plafondJour.indisponible ? SERVICE_INDISPONIBLE : BOUTIQUE_COMPLETE },
      {
        status: plafondJour.indisponible ? 503 : 429,
        headers: { 'Retry-After': String(secondesAvantMinuitAbidjan()) },
      },
    );
  }

  // Un corps tronque ou un content-type inattendu ne doit pas rendre un 500 :
  // c'est un client qui a mal envoye, pas le serveur qui a casse.
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'Requête illisible' }, { status: 400 });
  const {
    nom, tel, adresse, instructions, panier,
    mode_recuperation: modeDemande,
    heure_retrait: heureDemandee,
  } = body as {
    nom?: unknown; tel?: unknown; adresse?: unknown;
    instructions?: unknown; panier?: unknown;
    mode_recuperation?: unknown; heure_retrait?: unknown;
  };

  const sb = getSupabaseAdmin();
  const boutiqueUuid = sb ? await resoudreBoutiqueUuid(sb, m) : null;

  // ---- La boutique est-elle ouverte ?
  //
  // LE REFUS SE PRONONCE ICI, PAS SEULEMENT DANS LA VITRINE. Un bouton grise
  // dans le navigateur n'empeche rien : un onglet reste ouvert toute la nuit,
  // un lien se rejoue, un appel se forge. Et une commande passee a 3 h du matin
  // ne coute pas une vente — elle coute un client, qui n'aura aucune reponse et
  // s'en prendra au restaurant, pas a l'heure.
  //
  // Une boutique sans horaires reste ouverte : c'est le cas de toutes celles
  // deja en service, et les fermer d'office ferait plus de degats que le
  // probleme qu'on corrige.
  // `essai` est lu ICI, avec les horaires : une seule lecture de la fiche, et il
  // servira plus bas a taire le dispatch.
  let boutiqueEssai = false;

  /**
   * Le minimum annonce, remonte HORS du bloc de lecture.
   *
   * Il est verifie plus bas, quand le total du panier est connu — la fiche,
   * elle, est lue ici et une seule fois. `0` veut dire « pas de minimum » : la
   * contrainte en base interdit d'enregistrer zero, qui ne serait ni un
   * minimum reel ni son absence.
   */
  let minimumBoutique = 0;

  /**
   * COMMENT LE CLIENT RECUPERE SA COMMANDE, arrete ICI et une seule fois.
   *
   * `mode` est fige sur la commande : sans lui, un marchand qui passerait plus
   * tard de « les deux » a « livraison » ferait basculer tout son historique,
   * et les gardes de veille se mettraient a crier sur des commandes closes
   * depuis des semaines.
   *
   * Les valeurs de depart sont celles d'une boutique qui livre — c'est le cas
   * de toutes celles en service, et d'une fiche qu'on n'a pas su lire.
   */
  let modeRetenu: ModeCommande = 'livraison';
  let heureRetraitIso: string | null = null;
  let offerteDes: number | null = null;
  let preparationMin: number | null = null;

  if (sb && boutiqueUuid) {
    const { data: fiche } = await sb
      .from('boutiques')
      // En UNE seule chaine litterale : concatenee, elle perd son inference et
      // le type retombe sur `GenericStringError`.
      .select('horaires, pause_jusqua, essai, banc_telegram_id, wasender_secret_id, telegram_secret_id, groupe_livreurs, commande_minimum, mode_recuperation, delai_preparation_min, livraison_offerte_des')
      .eq('id', boutiqueUuid)
      .maybeSingle();

    boutiqueEssai = fiche?.essai === true;
    minimumBoutique = Number(fiche?.commande_minimum ?? 0);
    // ZERO GARDE SA VALEUR. Un `?? null` sur un `|| null` ferait de « toujours
    // offerte » un « le livreur annonce ses frais » — l'exact contraire.
    offerteDes =
      typeof fiche?.livraison_offerte_des === 'number' ? fiche.livraison_offerte_des : null;
    preparationMin =
      typeof fiche?.delai_preparation_min === 'number' ? fiche.delai_preparation_min : null;

    /**
     * LE MODE SE VERIFIE ICI, PAS DANS LE NAVIGATEUR.
     *
     * Le selecteur de la vitrine n'empeche rien : un onglet reste ouvert apres
     * que le marchand a change d'avis, un lien se rejoue, un appel se forge.
     * Sans ce controle, une commande « retrait » arriverait chez un marchand
     * qui ne fait que livrer — et un client se deplacerait vers une porte ou
     * personne ne l'attend. Meme regle que pour les horaires et le stock.
     *
     * Un corps sans mode retombe sur le mode par defaut de la boutique : les
     * anciens clients, dont l'onglet ne connait pas ce champ, continuent
     * exactement comme avant.
     */
    const demande = String(modeDemande ?? '').trim();
    if (!demande) {
      modeRetenu = modeParDefaut(fiche?.mode_recuperation);
    } else if (modeAccepte(fiche?.mode_recuperation, demande)) {
      modeRetenu = demande as ModeCommande;
    } else {
      console.error(
        `Commande refusee — « ${m.id} » ne propose pas « ${demande} »`
          + ` (mode boutique : ${String(fiche?.mode_recuperation ?? 'inconnu')}).`,
      );
      return Response.json(
        {
          error:
            demande === 'retrait'
              ? `${m.nom} ne propose pas le retrait sur place. Rechargez la page.`
              : `${m.nom} ne propose pas la livraison. Rechargez la page.`,
        },
        { status: 409 },
      );
    }

    /**
     * L'HEURE DEMANDEE, DATEE PAR LE SERVEUR.
     *
     * Le navigateur n'envoie qu'un « HH:MM » : un client qui commande depuis
     * un autre fuseau pour sa famille a Abidjan ferait sinon arriver la
     * commande deux heures trop tot, sans que rien ne le signale.
     *
     * Une heure hors d'atteinte se REFUSE — elle ne bascule pas au lendemain.
     * Reporter en silence donnerait au client et au marchand deux lectures de
     * la meme commande, et c'est le client qui se deplacerait pour rien.
     */
    if (modeRetenu === 'retrait') {
      const verdict = horodaterRetrait(heureDemandee, new Date(), preparationMin);
      if (!verdict.ok) return Response.json({ error: verdict.message }, { status: 400 });
      heureRetraitIso = verdict.iso;
    }

    /**
     * UNE BOUTIQUE NON BRANCHEE NE PREND PAS DE COMMANDE.
     *
     * Le guide met les articles a l'etape 2 et les canaux aux etapes 3 a 6 : en
     * suivant l'ordre officiel, il existe une fenetre ou la vitrine vend et ou
     * PERSONNE n'est prevenu. Le client attend une commande que rien n'a
     * transmise, et il s'en prend au commercant.
     *
     * Le catalogue de la vitrine ecarte deja ces boutiques -- mais un onglet
     * reste ouvert, un lien se partage, un appel se forge. Comme pour les
     * horaires, le refus se prononce ICI.
     *
     * La regle vit dans `@/lib/boutiquePrete` pour etre EPROUVEE : en ligne ici,
     * la tester demandait de simuler les freins, la tarification et le stock,
     * donc personne ne la testait -- et elle a casse le banc de chaine des son
     * premier passage.
     */
    const verdict = boutiquePeutVendre({
      essai: fiche?.essai,
      bancTelegramId: fiche?.banc_telegram_id,
      wasenderSecretId: fiche?.wasender_secret_id,
      telegramSecretId: fiche?.telegram_secret_id,
      groupeLivreurs: fiche?.groupe_livreurs,
      modeRecuperation: fiche?.mode_recuperation,
    });

    if (!verdict.peutVendre) {
      console.error(
        `Commande refusee — « ${m.id} » n'est pas branchee : ${verdict.manque.join(', ')}.`,
      );
      return Response.json(
        {
          error:
            `${m.nom} n’est pas encore prête à recevoir des commandes.`
            + ' Contactez la boutique directement.',
        },
        { status: 409 },
      );
    }

    const etat = etatBoutique(fiche?.horaires, new Date(), fiche?.pause_jusqua);
    if (!etat.ouvert) {
      return Response.json(
        { error: `${m.nom} n’accepte pas de commande pour le moment. ${etat.message ?? ''}`.trim() },
        { status: 409 },
      );
    }
  }

  const lignes = await tariferPanier(m, panier, sb, boutiqueUuid);
  if (!lignes.length) return Response.json({ error: 'Panier vide' }, { status: 400 });

  // ---- Ce qui est demande existe-t-il encore ?
  //
  // LA VITRINE NE SUFFIT PAS. Elle masque deja les produits indisponibles, mais
  // elle le fait AU CHARGEMENT : un onglet ouvert il y a vingt minutes propose
  // encore le plat epuise entre-temps. Le client commande, le marchand
  // decouvre en cuisine, rappelle pour s'excuser — et ne revoit pas ce client.
  //
  // ON REFUSE LA COMMANDE ENTIERE, ET ON DIT QUOI. Retirer la ligne en silence
  // livrerait autre chose que ce qui a ete commande ; refuser sans preciser
  // laisserait le client deviner. Il ajuste lui-meme, en connaissance de cause.
  const refus = lignes
    .filter((l) => !l.disponible || (l.stock !== null && l.stock < l.quantite))
    .map((l) => {
      if (!l.disponible) return `${l.plat} n’est plus disponible`;
      return l.stock === 0
        ? `${l.plat} est épuisé`
        : `${l.plat} — il n’en reste que ${l.stock}`;
    });

  if (refus.length) {
    return Response.json(
      { error: `Votre panier a changé depuis son ouverture. ${refus.join('. ')}.` },
      { status: 409 },
    );
  }

  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);

  /**
   * LE MINIMUM ANNONCE DOIT ETRE TENU PAR LE SERVEUR.
   *
   * Il n'etait qu'AFFICHE. Une boutique annoncait « minimum 5 000 F » sur sa
   * vitrine, un client composait 1 000 F, et le serveur acceptait : le
   * marchand ne le decouvrait qu'au moment de preparer. C'est la meme regle
   * que le stock et que les horaires — LA VITRINE AFFICHE, LE SERVEUR DECIDE.
   * Une regle que seul l'ecran applique n'est pas une regle, c'est une
   * suggestion.
   *
   * `null` veut dire « pas de minimum », jamais zero : la contrainte en base
   * interdit d'ailleurs zero, qui ne serait ni l'un ni l'autre.
   *
   * Le refus NOMME le montant manquant. « Commande trop petite » obligerait le
   * client a deviner combien ajouter, et beaucoup partiraient plutot que de
   * chercher.
   */
  if (Number.isFinite(minimumBoutique) && minimumBoutique > 0 && total < minimumBoutique) {
    const minimum = minimumBoutique;
    const manque = minimum - total;
    return Response.json(
      {
        error:
          `${m.nom} accepte les commandes à partir de ${minimum.toLocaleString('fr-FR')} F.`
          + ` Il vous manque ${manque.toLocaleString('fr-FR')} F.`,
      },
      { status: 409 },
    );
  }

  let phone = String(tel || '').replace(/\D/g, '');
  if (!phone.startsWith('225')) phone = '225' + phone;
  const order_id = `${prefixeReference(m.id)}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  /**
   * Le jeton qui rend le lien de suivi indevinable.
   *
   * IL N'EST PAS FABRIQUE ICI. Un defaut de colonne le pose en base a chaque
   * insertion, quel que soit le chemin — vitrine, assistante, n8n. On le RELIT
   * donc apres l'ecriture plutot que de le calculer, pour qu'il n'existe qu'a
   * un seul endroit et ne puisse pas diverger d'un chemin a l'autre.
   *
   * Il est rendu au navigateur : c'est celui du client qui vient de commander,
   * et c'est lui qui construit son propre lien de suivi.
   */
  let jetonSuivi = '';

  /**
   * CE QUE LE CLIENT DEVRA — OU NON — AU LIVREUR, calcule UNE FOIS.
   *
   * Il est ecrit en base ET transmis au dispatch. Le recalculer a chaque
   * endroit ferait exactement ce que ce chantier evite depuis le debut : deux
   * lectures de la meme regle qui finissent par diverger, et un livreur qui
   * reclame au client une somme que la base dit offerte.
   */
  const fraisEnregistres: number | null =
    modeRetenu === 'retrait' || livraisonOfferte(offerteDes, total) ? 0 : null;

  // ---- 1. Supabase : c'est ici que la commande existe ou n'existe pas.
  if (sb) {
    if (!boutiqueUuid) {
      console.error(`Commande ${order_id} — boutique ${m.id} absente de Supabase`);
      return Response.json(
        { error: 'Cette boutique ne peut pas recevoir de commande pour le moment' },
        { status: 503 },
      );
    }

    const { data: creee, error } = await sb
      .from('commandes')
      .insert({
        boutique_id: boutiqueUuid,
        reference: order_id,
        client_nom: String(nom || 'Client'),
        client_telephone: phone,
        // EN RETRAIT, ON N'ECRIT AUCUNE ADRESSE. Le champ est cache dans la
        // vitrine, mais un client qui a saisi la sienne puis bascule en
        // retrait la garde en memoire : elle serait partie au livreur et au
        // marchand comme une adresse de livraison a honorer.
        client_adresse: modeRetenu === 'retrait' ? '' : String(adresse || ''),
        instructions: String(instructions || ''),
        mode_recuperation: modeRetenu,
        // NULL veut dire « des que pret », jamais « on ne sait pas ».
        heure_retrait: heureRetraitIso,
        /**
         * ZERO EXPLICITE, JAMAIS NULL, QUAND IL N'Y A RIEN A PAYER.
         *
         * `frais_livraison` a deux absences qu'il ne faut pas confondre :
         * NULL veut dire « le livreur ne les a pas encore annonces », zero veut
         * dire « il n'y a rien a encaisser ». Les melanger est precisement le
         * defaut que ce depot poursuit — et ici il a un cout immediat : le
         * garde `livree_sans_frais` crierait sur chaque commande offerte, et
         * une veille qu'on bruite est une veille qu'on cesse de lire.
         *
         * On laisse NULL dans le seul cas ou c'est vrai : une livraison dont le
         * livreur annoncera le prix.
         */
        frais_livraison: fraisEnregistres,
        chat_id: phone,
        total,
        // `canal` dit COMMENT JOINDRE le client, pas d'ou vient la commande.
        // Il a longtemps valu 'app', que ni `/api/canaux/envoyer` ni le routeur
        // de « Envoyer reponse client » ne connaissent : les cinq notifications
        // de livraison — acceptee, partie, en route, livree, demande de note —
        // echouaient toutes en « Envoi impossible », sans que rien ne le
        // signale. Le livreur et le gerant, eux, etaient bien prevenus, ce qui
        // rendait la panne invisible. Un client de la vitrine laisse son
        // numero : c'est sur WhatsApp qu'on le joint.
        canal: 'whatsapp',
        statut: 'en_attente',
      })
      .select('id, jeton_suivi')
      .single();

    if (error || !creee) {
      console.error(`Commande ${order_id} — insertion Supabase refusee :`, error);
      return Response.json(
        { error: 'Commande non enregistrée, merci de réessayer' },
        { status: 503 },
      );
    }

    jetonSuivi = String((creee as { jeton_suivi?: string | null }).jeton_suivi ?? '');

    const { error: errArticles } = await sb.from('commande_items').insert(
      lignes.map((l) => ({
        commande_id: creee.id,
        produit_id: l.produitId,
        nom_produit: l.plat,
        variante: l.variante || null,
        quantite: l.quantite,
        prix_unitaire: l.prixUnitaire,
      })),
    );

    if (errArticles) {
      // Une commande sans article afficherait un total sans contenu et
      // enverrait le livreur sans savoir quoi livrer. On la retire plutot que
      // de laisser cette incoherence en base.
      console.error(`Commande ${order_id} — articles refuses, annulation :`, errArticles);
      await sb.from('commandes').delete().eq('id', creee.id);
      return Response.json(
        { error: 'Commande non enregistrée, merci de réessayer' },
        { status: 503 },
      );
    }

    // ---- Retirer du stock ce qui vient d'etre vendu.
    //
    // APRES la commande, et volontairement : si l'ecriture avait echoue, on
    // aurait decompte des plats que personne n'a achetes, et le marchand se
    // serait cru en rupture sans l'etre.
    //
    // JAMAIS BLOQUANT. La commande est prise, le marchand est prevenu, le
    // livreur part : un decompte rate ne doit pas defaire tout cela. Il est
    // journalise, parce qu'un stock qui derive sans qu'on sache pourquoi finit
    // par n'etre plus consulte du tout.
    //
    // Reste une fenetre etroite entre le controle plus haut et ce decompte :
    // deux clients qui commandent le dernier plat a la meme seconde passent
    // tous les deux. Le plancher a zero empeche le nombre negatif, et le
    // marchand tranche — ce qu'il fait deja aujourd'hui, sans aucun controle.
    const aDecompter = lignes.filter((l) => l.produitId && l.stock !== null);
    for (const l of aDecompter) {
      const { error: errStock } = await sb.rpc('decrementer_stock', {
        p_produit: l.produitId as string,
        p_quantite: l.quantite,
      });
      if (errStock) {
        console.error(
          `Commande ${order_id} — stock non decompte pour « ${l.plat} » :`,
          errStock.message,
        );
      }
    }

    // ---- MARQUER LA COMMANDE COMME DECOMPTEE.
    //
    // Le decompte existe desormais AUSSI pour les commandes prises par
    // l'assistante, par `/api/internal/commandes/stock`. Cette route-la se
    // reserve sur `stock_decremente_le is null` : sans ce marqueur, elle
    // decompterait une seconde fois les commandes venues de la vitrine, et le
    // marchand refuserait des ventes bien reelles.
    //
    // Pose meme quand rien n'etait a decompter — « il n'y a rien a faire » doit
    // se distinguer de « ce n'est pas encore fait ».
    const { error: errMarque } = await sb
      .from('commandes')
      .update({ stock_decremente_le: new Date().toISOString() })
      .eq('reference', order_id)
      .is('stock_decremente_le', null);

    if (errMarque) {
      console.error(`Commande ${order_id} — marqueur de decompte non pose :`, errMarque.message);
    }

    // ---- Le panier de ce client n'est plus un panier perdu.
    //
    // Sans cette ligne, le compteur du tableau de bord mesurerait le TRAFIC et
    // non l'abandon : chaque commande reussie laisserait derriere elle un
    // panier qu'on presenterait au marchand comme une vente ratee.
    //
    // Jamais bloquant : la commande est prise, elle ne se defait pas parce
    // qu'une mesure n'a pas pu etre mise a jour.
    // `phone` et la cle du panier sont produits par la meme regle : « 225 »
    // suivi du numero national. Les apparier sur autre chose reviendrait a ne
    // jamais solder aucun panier, sans que rien ne le signale.
    if (phone) {
      const { error: errPanier } = await sb
        .from('paniers')
        .update({ converti_le: new Date().toISOString(), commande_id: creee.id })
        .eq('boutique_id', boutiqueUuid)
        .eq('telephone', phone)
        .is('converti_le', null);

      if (errPanier) {
        console.error(`Commande ${order_id} — panier non solde :`, errPanier.message);
      }
    }
  } else {
    // Sans client admin, RIEN n'est ecrit — et rien n'est signale non plus, le
    // secret des webhooks se lisant lui aussi dans le coffre Supabase. Cette
    // branche rendait pourtant `ok`, avec un numero de commande : le client
    // voyait « REÇUE » et un lien de suivi qui repondait « Commande
    // introuvable », le marchand ne voyait rien, et personne n'etait livre.
    //
    // Constate le 15 aout sur `ZAH-1786793412887-4521` : reference emise par
    // cette route a 11h30, introuvable en base comme au suivi, et aucune
    // execution n8n. Le mot « ecriture en feuille seule » decrivait une
    // intention de la periode de double ecriture ; la feuille ne fait plus foi
    // depuis, et le repli s'etait transforme en perte silencieuse.
    //
    // On echoue donc, bruyamment. Un client qui voit une erreur et recommence
    // coute moins cher qu'un client qui croit avoir commande.
    console.error(
      `Commande ${order_id} — client admin Supabase indisponible, commande refusee`,
    );
    return Response.json(
      {
        error: 'Commande non enregistrée, merci de réessayer',
        // Nomme la cause pour que l'exploitant la distingue d'un refus
        // d'insertion, sans rien exposer de la configuration.
        raison: 'supabase_indisponible',
      },
      { status: 503 },
    );
  }

  // ---- 2. Les articles, tels qu'un humain doit les lire.
  //
  // Ce tableau a servi au miroir Google Sheets jusqu'au 28 aout 2026. Le
  // miroir est parti ; lui reste, parce que c'est LE champ `items` que n8n
  // recoit et que le marchand comme le livreur lisent dans leur message.
  const articlesLisibles = lignes.map((l) => ({
    // LE CHOIX REJOINT LE NOM **ICI SEULEMENT**, parce que ce texte n'est pas
    // apparie : il est LU par un marchand et par un livreur. C'est le seul
    // endroit ou la pointure doit se voir sans que personne n'ait a la
    // chercher. En base, elle reste dans sa colonne — voir `LigneCommande`.
    plat: l.variante ? `${l.plat} (${l.variante})` : l.plat,
    variante: l.variante,
    quantité: l.quantite,
    prix_unitaire: l.prixUnitaire,
  }));

  // ---- 3. Webhook generique (avec boutique_id pour n8n)
  // UNE BOUTIQUE D'ESSAI NE REVEILLE PERSONNE.
  //
  // La commande est creee exactement comme les autres — memes controles, memes
  // ecritures, meme decompte de stock — mais le dispatch n'est pas appele. Sans
  // cela, chaque passage du banc multi-marchand enverrait une course a de vrais
  // livreurs, ou a defaut produirait une alerte technique : une veille qu'on
  // bruite est une veille qu'on cesse de lire.
  //
  // Le test reste FIDELE la ou il compte, et muet la ou il derangerait.
  const n8nUrl = boutiqueEssai ? null : process.env.N8N_COMMANDE_APP_URL;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Un seul secret pour tous les webhooks n8n, lu au coffre Supabase.
          // Voir `secretN8n.ts` pour la rotation.
          'x-djiguiflow-secret': await secretWebhookN8n(),
        },
        body: JSON.stringify({
          boutique_id: m.id,
          boutique_nom: m.nom,
          order_id,
          customer_name: String(nom || 'Client'),
          phone,
          address: modeRetenu === 'retrait' ? '' : String(adresse || ''),
          items: JSON.stringify(articlesLisibles),
          /**
           * CE QUI EMPECHE D'ENVOYER UN LIVREUR CHERCHER UNE COMMANDE A
           * EMPORTER.
           *
           * « Commande App » fait DEUX choses : prevenir le client, et alerter
           * les livreurs. Taire l'appel entier pour un retrait priverait donc
           * le client de sa confirmation. C'est n8n qui branche, sur ce champ.
           *
           * Il est envoye pour TOUTE commande, livraison comprise : un champ
           * qui n'apparait que dans un cas oblige le workflow a traiter son
           * absence comme une valeur, et c'est ainsi qu'on se retrouve a
           * comparer `undefined` a une chaine.
           */
          mode_recuperation: modeRetenu,
          heure_retrait: heureRetraitIso ?? '',
          /**
           * CE QUE LE LIVREUR DOIT SAVOIR AVANT D'ACCEPTER.
           *
           * `0` veut dire « il n'y a rien a encaisser », et c'est LUI que ca
           * regarde en premier : une livraison offerte se regle entre le
           * marchand et lui, jamais a la porte du client. Sans cette valeur, il
           * reclamerait au client une somme que personne ne lui doit — c'est la
           * dispute que cette fonctionnalite peut creer, et elle se joue sur le
           * pas de la porte, la ou plus personne ne rattrape rien.
           *
           * Chaine vide quand le livreur annoncera ses frais : « rien a dire »
           * ne doit pas se confondre avec « zero franc ».
           */
          frais_livraison: fraisEnregistres === null ? '' : String(fraisEnregistres),
          total_price: String(total),
          sheetCommandes: m.sheetCommandes,
          // Sans ce champ, le workflow n8n retombait sur le groupe de
          // livreurs de Zahara : une commande passee chez un autre marchand
          // alertait les livreurs de Zahara et n'atteignait jamais les siens.
          // Le repli a ete supprime cote n8n, ce champ est donc obligatoire.
          groupeLivreurs: m.groupeLivreurs,
        }),
      signal: delai(DELAI_WEBHOOK),
    });
    } catch (e) {
      // n8n injoignable : la commande est en base, le marchand la voit. Non
      // bloquant, donc — mais journalise. Ce `catch` etait vide, et il avalait
      // aussi l'echec de `secretWebhookN8n()`, qui lit le coffre Supabase :
      // quand Supabase manquait, les livreurs n'etaient jamais alertes et rien
      // n'en gardait trace.
      console.error(`Commande ${order_id} — webhook commande n8n injoignable :`, e);
    }
  }

  // ---- 4. Demande de confirmation au client (anti-retours)
  // Meme raison qu'au-dessus, et il a fallu le constater : la premiere version
  // du drapeau ne taisait QUE le dispatch. Le banc multi-marchand declenchait
  // donc encore trois executions n8n — demande de confirmation au client et
  // alerte au marchand. Un drapeau qui ne couvre qu'une sortie sur deux ne
  // protege de rien.
  const confUrl = boutiqueEssai ? null : process.env.N8N_CONFIRMATION_URL;
  if (confUrl) {
    try {
      await fetch(confUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Un seul secret pour tous les webhooks n8n, lu au coffre Supabase.
          // Voir `secretN8n.ts` pour la rotation.
          'x-djiguiflow-secret': await secretWebhookN8n(),
        },
        body: JSON.stringify({
          type: 'demande',
          reference: order_id,
          phone,
          nom: String(nom || 'Client'),
          total: String(total),
          boutique_id: m.boutiqueId,
          /**
           * SANS CE CHAMP, LE MESSAGE DE CONFIRMATION PARLE DE LIVRAISON.
           *
           * « Confirmez-vous être disponible pour la réception ? » — lu par un
           * client qui vient CHERCHER sa commande. Constate au banc de chaine
           * le 26 aout : le texte est compose dans « Confirmation Client », qui
           * ne connaissait de la commande que ce que cette route lui envoie.
           *
           * Il part pour TOUTE commande, livraison comprise : un champ qui
           * n'apparait que dans un cas oblige le workflow a traiter son absence
           * comme une valeur.
           */
          mode_recuperation: modeRetenu,
          heure_retrait: heureRetraitIso ?? '',
        }),
      signal: delai(DELAI_WEBHOOK),
    });
    } catch (e) {
      // Non bloquant : la commande est en base. Mais journalise, pour la meme
      // raison que ci-dessus — un `catch` muet cache un coffre injoignable.
      console.error(`Commande ${order_id} — demande de confirmation injoignable :`, e);
    }
  }

  // `jeton_suivi` accompagne la reference : sans lui, la vitrine ne saurait
  // construire qu'un lien devinable. Vide quand Supabase etait injoignable — le
  // lien reste alors valide, puisque les routes publiques tolerent encore
  // l'absence de jeton (phase 3 du chantier).
  return Response.json({ ok: true, order_id, jeton_suivi: jetonSuivi });
}
