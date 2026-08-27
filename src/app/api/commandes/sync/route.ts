import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { filtreAppariementChat } from '@/lib/appariementChat';
import type { Database } from '@/lib/database.types';
import { normaliserTelephone } from '@/lib/telephone';
import { prefixeReference } from '@/lib/marchands';
import {
  heureRetraitLisible,
  horodaterRetrait,
  livraisonOfferte,
  modeAccepte,
  modeParDefaut,
} from '@/lib/retrait';
import type { ModeCommande } from '@/lib/retrait';

export const dynamic = 'force-dynamic';

type MajCommande = Database['public']['Tables']['commandes']['Update'];

/**
 * Ces coordonnees permettent-elles VRAIMENT de livrer ?
 *
 * POURQUOI CE CONTROLE. Le 21 aout 2026, l'assistante a saute l'etape de
 * collecte et INVENTE les coordonnees : « Inconnu », « 0000000000 »,
 * « Non communiquee ». La commande est partie chez les livreurs telle quelle.
 * Personne ne pouvait la livrer, et le client avait recu « votre commande est
 * bien enregistree ».
 *
 * Le prompt demandait deja de collecter avant de valider. Il n'a pas suffi —
 * comme d'habitude. Le refus vit donc ici.
 */
function coordonneesLivrables(
  nom: unknown,
  telephone: unknown,
  adresse: unknown,
  livre: boolean,
): string[] {
  const manquant: string[] = [];

  // Un modele qui n'a pas l'information ecrit rarement du vide : il ecrit un
  // mot qui SIGNIFIE le vide. Il faut donc reconnaitre les deux.
  const inventé = (v: unknown) => {
    const t = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    if (!t) return true;
    return /^(inconnu|non communiquee?|non renseignee?|n\/?a|neant|aucun|client|a definir|-+)$/.test(t);
  };

  if (inventé(nom)) manquant.push('nom');
  // L'ADRESSE N'EST EXIGEE QUE DE QUI SE FAIT LIVRER.
  //
  // Elle etait obligatoire pour tout le monde : une commande a emporter ne
  // pouvait donc PAS etre validee par l'assistante — elle restait un panier,
  // sans que rien ne le dise au client, qui venait d'entendre « c'est
  // enregistre ». La reclamer aurait pousse le modele a en inventer une, ce
  // que ce controle existe justement pour attraper.
  if (livre && inventé(adresse)) manquant.push('adresse');

  // Le telephone passe par la meme regle que la vitrine : un numero qui ne
  // s'ecrit pas ne se compose pas. « 0000000000 » a la bonne longueur mais ne
  // joint personne — d'ou le refus des chiffres tous identiques.
  const tel = String(telephone ?? '').replace(/\D/g, '');
  if (inventé(telephone) || !normaliserTelephone(telephone).ok || /^(\d)\1+$/.test(tel)) {
    manquant.push('telephone');
  }

  return manquant;
}

/**
 * « 9:5 » → « 09:05 ». Rien d'autre : une saisie illisible ressort telle
 * quelle, et c'est `horodaterRetrait` qui la refusera, en un seul endroit.
 *
 * Sert a comparer ce que l'assistante renvoie a ce qui est deja enregistre :
 * sans mise au meme format, « 9:30 » et « 09:30 » designeraient deux heures
 * differentes et la seconde serait rejugee sans raison.
 */
function normaliserHeure(brut: string): string {
  const m = brut.match(/^(\d{1,2}):(\d{2})$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : brut;
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const b = await req.json();
  const referenceDemandee = String(b.reference || b.order_id || '').trim();
  const boutique_id = String(b.boutique_id || '').trim();
  if (!referenceDemandee || !boutique_id) {
    return Response.json({ error: 'reference et boutique_id requis' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Indisponible' }, { status: 503 });

  // ---- UNE COMMANDE TERMINEE NE SE REOUVRE PAS.
  //
  // L'assistante invente elle-meme la reference, et quand un client demande
  // « la meme chose qu'hier » elle REUTILISE celle de la commande d'hier. Le
  // 21 aout, un client a ainsi recu « votre commande est bien enregistree »
  // alors qu'on venait d'ecrire par-dessus une commande LIVREE la veille : rien
  // n'est parti, ni confirmation, ni livreur.
  //
  // Du temps de Google Sheets, le defaut existait deja mais restait invisible :
  // l'horodatage de la ligne etait reecrit a chaque mise a jour, ce qui trompait
  // la fenetre de douze heures et faisait REPARTIR une commande deja livree
  // chez les livreurs. Le mal etait pire, et silencieux.
  //
  // ON NE DEMANDE PAS AU MODELE DE MIEUX NOMMER. On lui reprend la main : si la
  // reference designe une commande terminee, le serveur en attribue une neuve
  // et la rend a l'appelant. Une consigne ne serait pas un verrou.
  const TERMINEES = ['livree', 'annulee', 'abandonnee'];
  let reference = referenceDemandee;

  const { data: existante } = await sb
    .from('commandes')
    .select('statut, nom_livreur, boutique_id, mode_recuperation')
    .eq('reference', referenceDemandee)
    .maybeSingle();

  /**
   * UNE BOUTIQUE N'ECRIT PAS DANS LA COMMANDE D'UNE AUTRE.
   *
   * `boutique_id` etait exige a l'entree puis JAMAIS utilise comme filtre :
   * les neuf requetes de cette route portaient sur `reference` seule, et la
   * reference est unique sur TOUTE la base. L'assistante inventant elle-meme
   * ses references, il suffisait d'amener le modele a en retenir une autre —
   * un client dictant « ma commande ATT-1000000006 » — pour que la boutique A
   * ecrase le nom, le telephone, l'adresse et le total d'une commande de B.
   *
   * ET LA REPONSE RENDAIT LE `jeton_suivi` DE B. Ce jeton partait ensuite dans
   * le lien de confirmation envoye au client de A, qui pouvait alors lire les
   * coordonnees du client de B et ANNULER sa commande. Le jeton est
   * precisement la preuve que la phase 4 a rendue obligatoire ; il etait remis
   * au mauvais destinataire.
   *
   * LE REFUS EST POSE ICI, EN UN SEUL POINT, et non repete sur neuf requetes :
   * une garde recopiee neuf fois est une garde qu'on oubliera a la dixieme.
   * Les ecritures sont cloisonnees en plus, mais c'est le second rideau.
   *
   * On ne rend PAS une reference neuve dans ce cas, contrairement au cas
   * « commande terminee » plus bas : la reference existe et elle est valide,
   * simplement pas ici. Poursuivre sous un autre numero masquerait une
   * tentative derriere un succes.
   */
  if (existante && String(existante.boutique_id ?? '') !== boutique_id) {
    console.error(
      `Sync — REFUS : la reference ${referenceDemandee} appartient a une autre boutique`
      + ` que ${boutique_id}. Rien n'a ete ecrit.`,
    );
    return Response.json({
      ok: false,
      error: 'Cette référence appartient à une autre boutique.',
    }, { status: 409 });
  }

  const estTerminee = existante
    && (TERMINEES.includes(String(existante.statut ?? ''))
        || String(existante.nom_livreur ?? '').trim() !== '');

  if (estTerminee) {
    // L'ASSISTANTE APPELLE PLUSIEURS FOIS PAR CONVERSATION, toujours avec la
    // meme reference — c'est meme ce que sa consigne lui demande. Generer une
    // reference neuve a chaque appel creerait donc une commande par message.
    //
    // Le panier en cours de ce client fait donc autorite : s'il en existe un,
    // on continue de l'ecrire. C'est la DONNEE qui definit « la commande en
    // cours », pas la chaine que le modele a retenue.
    const chatId = String(b.chat_id ?? b.chat ?? '').trim();

    const { data: panier } = chatId
      ? await sb
          .from('commandes')
          .select('reference')
          .eq('boutique_id', boutique_id)
          // Egalite stricte OU cle des 8 derniers chiffres : un meme client a
          // porte jusqu'a TROIS chat_id chez la meme boutique. Voir
          // appariementChat.ts — la regle y vit seule, pour ne pas diverger.
          .or(filtreAppariementChat(chatId))
          .eq('statut', 'panier')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    if (panier?.reference) {
      reference = panier.reference;
    } else {
      const { data: fiche } = await sb
        .from('boutiques')
        .select('slug')
        .eq('id', boutique_id)
        .maybeSingle();

      reference = `${prefixeReference(String(fiche?.slug ?? ''))}`
        + `-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      console.error(
        `Sync — reference ${referenceDemandee} designe une commande terminee.`
        + ` Nouvelle commande ouverte sous ${reference}.`,
      );
    }
  }

  /**
   * Ne recopier que ce qui est reellement fourni.
   *
   * Cette route ecrasait chaque champ, meme absent de l'appel : une commande
   * enregistree avec son adresse la perdait des la premiere synchronisation,
   * `String(undefined || '')` valant la chaine vide. Constate le 12 aout 2026
   * sur deux commandes de test — adresse saisie, adresse disparue, et donc une
   * course impossible a livrer.
   *
   * Un champ absent veut dire « je n'en sais rien », pas « efface-le ».
   */
  const siFourni = (valeur: unknown): string | undefined => {
    if (valeur === undefined || valeur === null) return undefined;
    const t = String(valeur).trim();
    return t === '' ? undefined : t;
  };

  // Le nom de colonne etait un `string` libre : une colonne renommee ou mal
  // orthographiee partait vers PostgREST et n echouait qu a l execution.
  const payload: MajCommande = {};
  const poser = <K extends keyof MajCommande>(colonne: K, valeur: MajCommande[K] | undefined) => {
    if (valeur !== undefined) payload[colonne] = valeur;
  };

  poser('client_nom', siFourni(b.customer_name ?? b.nom));
  // ---- LE NUMERO SE NORMALISE ICI, POUR TOUT LE MONDE.
  //
  // La vitrine validait deja le telephone ; l'assistante, non. Un client a
  // dicte « 010291886 » — NEUF chiffres — et le numero est parti tel quel en
  // base. Le marchand qui rappelle depuis son tableau de bord compose alors un
  // numero qui n'existe pas.
  //
  // On NE REFUSE PAS la commande pour autant : un numero douteux vaut mieux
  // qu'une vente perdue, et le marchand peut toujours joindre son client par la
  // conversation. On garde donc la saisie telle quelle quand elle est
  // illisible, mais on la met au format des qu'elle est reconnaissable — c'est
  // ainsi que « +225 01 02 03 04 05 » et « 0102030405 » cessent de designer
  // deux clients differents dans la fiche client.
  const telBrut = siFourni(b.phone);
  if (telBrut !== undefined) {
    const lu = normaliserTelephone(telBrut);
    if (lu.ok) {
      poser('client_telephone', lu.national);
    } else {
      console.error(`Sync ${reference} — telephone non conforme conserve tel quel : ${lu.erreur}`);
      poser('client_telephone', telBrut);
    }
  }
  // ---- `chat_id` NE SE DEDUIT PAS DU TELEPHONE, SAUF A LA CREATION.
  //
  // Le repli `b.chat_id ?? b.phone` violait la regle meme de cette route : un
  // champ absent veut dire « je n'en sais rien », pas « remplace-le ». Sur une
  // commande DEJA EN BASE, un appel qui ne portait pas de chat_id ecrasait
  // l'identifiant de conversation par le numero de telephone — et le client
  // Telegram devenait injoignable pour toutes ses notifications suivantes,
  // sans le moindre message d'erreur.
  //
  // A la creation seulement, le repli garde son sens : un client venu de la
  // vitrine n'a pas de conversation, son numero en tient lieu. Il est donc
  // applique plus bas, dans l'INSERT.
  poser('chat_id', siFourni(b.chat_id));
  poser('canal', siFourni(b.canal));

  /**
   * COMMENT LE CLIENT RECUPERE SA COMMANDE — arrete ICI, par le serveur.
   *
   * Le prompt de l'assistante lui dira de proposer le retrait quand la boutique
   * le propose. CELA NE SUFFIT PAS, et ce depot l'a paye plusieurs fois : une
   * consigne au modele n'est pas un verrou. Le mode est donc verifie contre la
   * fiche, exactement comme la vitrine le fait — meme fonction, meme refus.
   *
   * Un appel qui ne dit rien retombe sur le mode par defaut de la boutique :
   * l'assistante d'une boutique qui ne livre pas cesse ainsi d'ecrire des
   * commandes en livraison, meme avant que son prompt ne soit a jour.
   */
  const { data: reglages } = await sb
    .from('boutiques')
    .select('mode_recuperation, delai_preparation_min, livraison_offerte_des')
    .eq('id', boutique_id)
    .maybeSingle();

  const demande = String(b.mode_recuperation ?? '').trim();
  let modeRetenu: ModeCommande;

  if (!demande) {
    /**
     * UN APPEL MUET NE CHANGE PAS LE MODE. C'EST LE BANC QUI L'A TROUVE.
     *
     * Cette route retombait ici sur le mode par defaut de la BOUTIQUE. Or elle
     * est rappelee, pour chaque commande de la vitrine, par « Confirmation
     * Client » : son noeud `Sync Supabase` poste la reference, le nom, le
     * telephone et l'adresse — jamais `mode_recuperation`.
     *
     * Une commande a emporter passee chez un marchand en « les deux » etait
     * donc REECRITE en « livraison » quelques secondes apres sa creation.
     * Mesure du 26 aout au banc de chaine : adresse vide, frais a zero, aucun
     * livreur lance — et pourtant `mode_recuperation = 'livraison'` en base.
     * L'ecran du marchand aurait annonce une livraison, le suivi du client
     * aurait montre trois etapes qui n'arrivent jamais, et les gardes de veille
     * se seraient remis a crier sur chaque retrait.
     *
     * C'est exactement la regle que ce fichier enonce quarante lignes plus
     * haut, et qu'il s'appliquait a tous les champs SAUF a celui-ci : un champ
     * absent veut dire « je n'en sais rien », pas « efface-le ».
     *
     * On garde donc ce qui est deja enregistre, et on ne retombe sur le defaut
     * de la boutique qu'a la CREATION, ou il n'y a rien a garder.
     */
    modeRetenu = existante?.mode_recuperation
      ? (String(existante.mode_recuperation) as ModeCommande)
      : modeParDefaut(reglages?.mode_recuperation);
  } else if (modeAccepte(reglages?.mode_recuperation, demande)) {
    modeRetenu = demande as ModeCommande;
  } else {
    console.error(
      `Sync ${reference} — mode « ${demande} » refuse`
      + ` (boutique : ${String(reglages?.mode_recuperation ?? 'inconnu')}).`,
    );
    // 422 et non 400 : c'est l'outil de l'assistante qui recoit ce texte, et il
    // doit pouvoir le relayer au client au lieu de tomber en panne.
    return Response.json({
      ok: false,
      reference,
      error: demande === 'retrait'
        ? 'Cette boutique ne propose pas le retrait sur place : proposez la livraison.'
        : 'Cette boutique ne livre pas : le client doit venir chercher sa commande.',
    }, { status: 422 });
  }

  // ON N'ECRIT LE MODE QUE SI L'APPELANT L'A DIT. Voir ci-dessus : l'ecrire a
  // chaque appel effacait le choix du client au premier rappel muet. A la
  // creation, l'INSERT le pose lui-meme a partir de `modeRetenu`.
  if (demande) poser('mode_recuperation', modeRetenu);
  // En retrait, aucune adresse n'est enregistree. Le modele en fournit parfois
  // une malgre tout — « a emporter », « sur place » — et l'ecrire ferait partir
  // au marchand une consigne de livraison qui n'en est pas une.
  if (modeRetenu === 'livraison') poser('client_adresse', siFourni(b.address));

  /**
   * L'HEURE DEMANDEE, DATEE PAR LE SERVEUR — ET TOLEREE SI ELLE NE CHANGE PAS.
   *
   * L'assistante rappelle cette route A CHAQUE information collectee, avec le
   * meme panier et la meme heure. Revalider le plancher de preparation a chaque
   * appel ferait donc ECHOUER une conversation qui dure : « 12:30 » demande a
   * 12:00 chez un marchand qui prepare en 45 minutes deviendrait invalide au
   * troisieme message, alors que rien n'a change dans la demande du client.
   *
   * On ne verifie donc que ce qui CHANGE. Une heure identique a celle deja
   * enregistree est conservee telle quelle ; c'est la meme regle que la
   * vitrine, appliquee au seul moment ou elle veut dire quelque chose.
   */
  if (modeRetenu === 'retrait') {
    const brut = String(b.heure_retrait ?? '').trim();
    if (brut) {
      const { data: dejaLa } = await sb
        .from('commandes')
        .select('heure_retrait')
        .eq('reference', reference)
        .eq('boutique_id', boutique_id)
        .maybeSingle();

      // La MEME heure, renvoyee telle quelle : rien n'a change dans la demande
      // du client, seule l'horloge a tourne. On la garde sans la rejuger.
      const inchangee = heureRetraitLisible(dejaLa?.heure_retrait) === normaliserHeure(brut)
        && !!dejaLa?.heure_retrait;

      if (!inchangee) {
        const verdict = horodaterRetrait(brut, new Date(), reglages?.delai_preparation_min);
        // UNE HEURE NOUVELLE ET INTENABLE SE REFUSE, MEME S'IL Y EN AVAIT
        // DEJA UNE. La garder en silence ferait croire au client que son
        // changement a ete pris, et il se presenterait a l'heure qu'il vient
        // de donner pendant que le marchand prepare pour l'autre.
        if (!verdict.ok) {
          return Response.json({ ok: false, reference, error: verdict.message }, { status: 422 });
        }
        poser('heure_retrait', verdict.iso);
      }
    }
  }

  const total = Number(b.total_price ?? b.total);
  if (Number.isFinite(total) && total > 0) payload.total = total;

  const { data } = await sb
    .from('commandes')
    .select('reference')
    .eq('reference', reference)
    .eq('boutique_id', boutique_id)
    .maybeSingle();

  // ---- LE MARQUEUR « on a demande, on attend ».
  //
  // `confirmation_statut` valait NULL dans deux cas opposes : « demande sans
  // reponse » et « jamais demandee ». Impossible de distinguer un panier
  // abandonne d'une commande qui ne passe pas par la confirmation.
  //
  // Il n'est pose QUE sur demande explicite de l'appelant, et JAMAIS par-dessus
  // une valeur existante — ecraser un 'confirmee' annulerait une confirmation
  // que le client vient de donner, ce que cette route s'interdit deja pour les
  // memes raisons.
  const marquerDemandee =
    b.confirmation_demandee === true ||
    String(b.confirmation_demandee ?? '') === '1' ||
    String(b.confirmation_demandee ?? '').toLowerCase() === 'true';

  // ---- L'ETAT DECLARE PAR L'ASSISTANTE.
  //
  // Elle construit la commande au fil de la conversation et n'a que deux
  // etats a dire : `en_cours` tant qu'elle collecte, `validee` quand le client
  // a confirme le recapitulatif. Ils se traduisent ici en etats du produit.
  //
  // `en_cours` devient `panier` — un statut deja exclu PARTOUT : fiche client,
  // liste des commandes, statistiques, suivi. Une commande a moitie construite
  // ne doit pas s'annoncer au marchand comme une commande a preparer.
  //
  // `validee` devient `en_attente` : la commande est reelle, le marchand la
  // voit, la confirmation peut partir.
  const etatDemande = String(b.status ?? b.statut ?? '').trim().toLowerCase();
  const statutVoulu =
    etatDemande === 'validee' ? 'en_attente'
    : etatDemande === 'en_cours' ? 'panier'
    : null;

  if (data) {
    // Ni `statut` ni `confirmation_statut` ici : ils appartiennent au cycle de
    // vie reel de la commande. Les forcer remettait a « en attente » une
    // commande deja en livraison, et annulait une confirmation que le client
    // venait de donner — c'est justement cet appel qui suit sa confirmation.
    if (marquerDemandee) {
      const { error: errMarque } = await sb
        .from('commandes')
        .update({ confirmation_statut: 'demandee' })
        .eq('reference', reference)
        .eq('boutique_id', boutique_id)
        .is('confirmation_statut', null);

      if (errMarque) {
        // Non bloquant : la commande vit sa vie, seule la mesure de l'abandon
        // s'en trouve amputee.
        console.error(`Sync ${reference} — marqueur de confirmation refuse :`, errMarque.message);
      }
    }

    // ---- LA PROMOTION D'UN PANIER EN COMMANDE, ET ELLE SEULE.
    //
    // Cette route s'interdit de toucher `statut` parce que le forcer remettait
    // « en attente » une commande deja en livraison. L'interdiction tient : on
    // n'autorise QU'UNE transition, `panier` -> `en_attente`, et le filtre
    // `.eq('statut', 'panier')` la rend impossible a detourner. Une commande
    // livree, annulee ou deja en attente n'est pas concernee.
    if (statutVoulu === 'en_attente') {
      // ---- ON NE VALIDE PAS UNE COMMANDE QU'ON NE PEUT PAS LIVRER.
      //
      // La ligne peut deja porter des coordonnees d'un tour precedent : on
      // controle donc l'ETAT FINAL, pas seulement ce que cet appel transmet.
      const { data: apres } = await sb
        .from('commandes')
        .select('client_nom, client_telephone, client_adresse')
        .eq('reference', reference)
        .eq('boutique_id', boutique_id)
        .maybeSingle();

      const manquant = coordonneesLivrables(
        payload.client_nom ?? apres?.client_nom,
        payload.client_telephone ?? apres?.client_telephone,
        payload.client_adresse ?? apres?.client_adresse,
        modeRetenu === 'livraison',
      );

      if (manquant.length) {
        // La commande RESTE un panier : invisible au marchand, aucun livreur
        // lance, et la relance des paniers abandonnes la rattrapera. On rend
        // la raison a l'appelant pour que l'assistante sache quoi demander.
        console.error(
          `Sync ${reference} — validation refusee, coordonnees inexploitables : ${manquant.join(', ')}`,
        );
        return Response.json({
          ok: false,
          reference,
          promu: false,
          manquant,
          error: `Impossible de valider : ${manquant.join(', ')} manquant(s) ou invalide(s).`
            + ` Demandez-les au client avant de valider.`,
        }, { status: 422 });
      }

      const { error: errPromotion } = await sb
        .from('commandes')
        .update({ statut: 'en_attente' })
        .eq('reference', reference)
        .eq('boutique_id', boutique_id)
        .eq('statut', 'panier');

      if (errPromotion) {
        console.error(`Sync ${reference} — promotion du panier refusee :`, errPromotion.message);
      }
    }

    if (Object.keys(payload).length === 0) {
      // Ce retour-ci porte le jeton LUI AUSSI. Un champ present sur une
      // sortie et absent sur une autre est precisement ce qui a produit le
      // lien mort : l'appelant ne peut pas savoir laquelle il a recue, et il
      // se rabat en silence sur la chaine vide.
      const { data: dejaLa } = await sb
        .from('commandes')
        .select('jeton_suivi')
        .eq('reference', reference)
        .eq('boutique_id', boutique_id)
        .maybeSingle();
      return Response.json({
        ok: true,
        reference,
        maj: 'rien a mettre a jour',
        jeton_suivi: dejaLa?.jeton_suivi ?? '',
      });
    }
    const { error } = await sb
      .from('commandes')
      .update(payload)
      .eq('reference', reference)
      .eq('boutique_id', boutique_id);
    if (error) return Response.json({ error: 'UPDATE: ' + error.message }, { status: 500 });
  } else {
    // A LA CREATION, les colonnes NOT NULL doivent etre garanties ICI.
    //
    // Elles ne l'etaient pas : seuls `client_nom` et `canal` avaient un
    // defaut. Un corps sans telephone, sans adresse ou sans total partait
    // quand meme, et c'est Postgres qui le refusait — l'appelant recevait un
    // « INSERT: null value in column ... violates not-null constraint », la
    // commande n'existait nulle part, et le message ne disait pas quel champ
    // manquait dans SA requete. Le compilateur a revele le trou une fois la
    // table typee.
    const telephone = payload.client_telephone;
    // EN RETRAIT, IL N'Y A PAS D'ADRESSE, ET LA COLONNE EST `not null`.
    // La chaine vide n'est donc pas un repli commode : c'est la seule valeur
    // qui dit « aucune adresse » sans mentir, et le reste du produit la lit
    // deja ainsi — la vitrine ecrit exactement la meme chose.
    const adresse = modeRetenu === 'livraison' ? payload.client_adresse : '';
    const montant = payload.total;

    const manquants: string[] = [];
    if (!telephone) manquants.push('phone');
    if (modeRetenu === 'livraison' && !adresse) manquants.push('address');
    if (typeof montant !== 'number') manquants.push('total_price');

    // Le test reste ecrit CHAMP PAR CHAMP, et non sur `manquants.length` :
    // c'est lui qui apprend au compilateur que les trois valeurs existent en
    // dessous. C'est le meme compilateur qui avait revele ce trou.
    if (!telephone || adresse === undefined || typeof montant !== 'number') {
      return Response.json(
        { error: `Creation impossible, champs requis absents : ${manquants.join(', ')}` },
        { status: 400 },
      );
    }

    const { error } = await sb.from('commandes').insert({
      ...payload,
      reference,
      boutique_id,
      /**
       * LE MODE EST POSE ICI, ET SEULEMENT ICI QUAND L'APPELANT S'EST TU.
       *
       * `poser` ne l'ecrit plus qu'en cas de demande explicite — sinon un
       * rappel muet effacerait le choix du client. Mais a la CREATION il n'y a
       * rien a preserver, et la valeur par defaut de la colonne vaut
       * « livraison » : chez un marchand qui ne fait QUE du retrait, elle
       * mentirait des la premiere commande.
       */
      mode_recuperation: payload.mode_recuperation ?? modeRetenu,
      // L'etat de depart n'est connu qu'a la creation. `panier` quand
      // l'assistante est encore en train de collecter : la commande existe,
      // mais elle reste invisible au marchand jusqu'a la confirmation.
      statut: statutVoulu ?? 'en_attente',
      // LE MARQUEUR VAUT AUSSI A LA CREATION.
      //
      // Il n'etait pose que sur une commande DEJA EN BASE. Or l'assistante fait
      // naitre la commande par ce meme appel : le marqueur n'etait donc jamais
      // pose sur les commandes qu'il devait justement suivre, et un panier
      // abandonne sur WhatsApp restait invisible.
      ...(marquerDemandee ? { confirmation_statut: 'demandee' } : {}),
      client_nom: payload.client_nom || 'Client',
      // Le repli du chat_id vit ICI et nulle part ailleurs : a la creation, un
      // client venu de la vitrine n'a pas de conversation ouverte.
      chat_id: payload.chat_id || telephone,
      // Un appelant qui ne dit pas le canal nous laisse deviner, et deviner
      // « whatsapp » a coute cher : les frais de livraison, le suivi et la
      // demande d'avis d'un client Telegram partaient vers un numero. Le
      // defaut reste — refuser la commande serait pire — mais il ne se tait
      // plus.
      canal: payload.canal || (() => {
        console.error(
          `Sync ${reference} — canal absent de la requete, « whatsapp » suppose.`
          + ` L'appelant devrait le transmettre.`,
        );
        return 'whatsapp';
      })(),
      client_telephone: telephone,
      client_adresse: adresse,
      total: montant,
      /**
       * ZERO EXPLICITE QUAND IL N'Y A RIEN A PAYER, jamais NULL.
       *
       * `frais_livraison` a deux absences a ne pas confondre : NULL veut dire
       * « le livreur ne les a pas encore annonces », zero veut dire « il n'y a
       * rien a encaisser ». La vitrine applique deja cette regle ; l'oublier
       * ici ferait crier le garde `livree_sans_frais` sur toute commande prise
       * par l'assistante — et une veille qu'on bruite est une veille qu'on
       * cesse de lire.
       */
      frais_livraison:
        modeRetenu === 'retrait' || livraisonOfferte(reglages?.livraison_offerte_des, montant)
          ? 0
          : null,
    });
    if (error) return Response.json({ error: 'INSERT: ' + error.message }, { status: 500 });
  }

  // ---- id de la commande (pour les articles) ET son jeton de suivi
  //
  // LE JETON EST RENDU A L'APPELANT, et ce n'est pas un confort.
  //
  // « Confirmation Client » compose le lien de confirmation a partir de ce
  // que lui envoie l'assistante. Or la commande N'EXISTE PAS ENCORE a cet
  // instant : c'est cette route-ci qui l'insere, et le jeton nait de la
  // valeur par defaut de la colonne, a l'insertion. L'assistante ne pouvait
  // donc pas le connaitre, et le lien partait sans `&t=`.
  //
  // Depuis la phase 4, un lien sans jeton est refuse en 404 « Commande
  // introuvable ». Mesure du 24 aout 2026 sur une vraie commande : le client
  // recevait un lien mort, et personne ne pouvait plus confirmer sur tout le
  // chemin de l'assistante — WhatsApp comme Telegram.
  //
  // La seule source possible du jeton est donc la reponse de cette route.
  const { data: cmd } = await sb
    .from('commandes')
    .select('id, jeton_suivi')
    .eq('reference', reference)
    .eq('boutique_id', boutique_id)
    .maybeSingle();
  if (!cmd) return Response.json({ error: 'commande introuvable après upsert' }, { status: 500 });

  // ---- articles : tableau d'objets, chaine JSON, ou texte « 2 x Soupe, Pizza »
  //
  // Le decoupage sur les virgules etait applique sans distinction. Une chaine
  // JSON comme [{"name":"Pizza","price":1500,"quantity":1}] se retrouvait donc
  // hachee en fragments — « "price": 1500 » — qui atterrissaient tels quels
  // dans nom_produit. Le bot WhatsApp envoyant ses articles sous cette forme,
  // tous les rapports par plat en etaient fausses.
  type Article = { nom: string; qte: number };

  const depuisObjet = (o: Record<string, unknown>): Article | null => {
    const nom = String(o.nom ?? o.name ?? o.plat ?? '').trim();
    if (!nom) return null;
    const q = Number(o.quantite ?? o.quantity ?? o['quantité'] ?? 1);
    return { nom, qte: Math.max(1, Number.isFinite(q) ? q : 1) };
  };

  const depuisTexte = (s: string): Article => {
    const m = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    return { qte: m ? Math.max(1, parseInt(m[1], 10)) : 1, nom: (m ? m[2] : s).trim() };
  };

  const extraireArticles = (raw: unknown): Article[] => {
    if (Array.isArray(raw)) {
      return raw
        .map((x) =>
          x && typeof x === 'object'
            ? depuisObjet(x as Record<string, unknown>)
            : depuisTexte(String(x)),
        )
        .filter((a): a is Article => Boolean(a?.nom));
    }

    const s = String(raw ?? '').trim();
    if (!s) return [];

    // Une chaine JSON se parse, elle ne se decoupe pas.
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const j: unknown = JSON.parse(s);
        const articles = (Array.isArray(j) ? j : [j])
          .map((x) =>
            // UN TABLEAU PEUT CONTENIR DES TEXTES, PAS SEULEMENT DES OBJETS.
            // `["Burger Classique"]` rendait `null` pour chacun de ses
            // elements, la liste sortait vide, et on retombait sur le
            // decoupage par virgules — qui rangeait la chaine ENTIERE, crochets
            // et guillemets compris, dans `nom_produit`. Constate le 18 aout
            // chez zahara : un article nomme `["Burger Classique"]` figurait
            // dans le palmarès de la semaine, a un rang de la publication.
            x && typeof x === 'object'
              ? depuisObjet(x as Record<string, unknown>)
              : depuisTexte(String(x)),
          )
          .filter((a): a is Article => Boolean(a?.nom));

        // On rend le resultat du JSON MEME S'IL EST VIDE. Le decoupage par
        // virgules d'une chaine JSON valide ne produit jamais rien de bon : il
        // vaut mieux zero article qu'un nom de produit fabrique a partir de
        // ponctuation, qui polluerait les rapports du marchand et pourrait
        // paraitre sur sa publication.
        return articles;
      } catch {
        // Pas du JSON valide : on retombe sur la lecture en texte.
      }
    }

    return s.split(',').map((x) => depuisTexte(x.trim())).filter((a) => a.nom);
  };

  const parsed = extraireArticles(b.items);

  if (parsed.length) {
    // prix connus si possible (jamais bloquant)
    let priceMap = new Map<string, number>();
    try {
      // ON NE DEMANDE QUE LES DEUX COLONNES QU'ON LIT. `select('*')` obligeait
      // a typer la ligne en `any` — donc a renoncer au compilateur sur un
      // calcul de PRIX — et rapatriait au passage le stock, le seuil d'alerte
      // et les photos pour n'en rien faire.
      const { data: prods } = await sb
        .from('produits')
        .select('nom, prix')
        .eq('boutique_id', boutique_id);

      priceMap = new Map(
        (prods ?? []).map((p) => [
          String(p.nom || '').toLowerCase(),
          Number(p.prix ?? 0) || 0,
        ])
      );
    } catch { /* prix inconnus → 0 */ }

    // idempotence : on remplace les anciens articles
    await sb.from('commande_items').delete().eq('commande_id', cmd.id);

    const rows = parsed.map((p) => ({
      commande_id: cmd.id,
      nom_produit: p.nom,
      quantite: p.qte,
      prix_unitaire: priceMap.get(p.nom.toLowerCase()) ?? 0,
    }));

    const { error: errItems } = await sb.from('commande_items').insert(rows);
    if (errItems) return Response.json({ error: 'ITEMS: ' + errItems.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    reference,
    articles: parsed.length,
    jeton_suivi: cmd.jeton_suivi ?? '',
  });
}