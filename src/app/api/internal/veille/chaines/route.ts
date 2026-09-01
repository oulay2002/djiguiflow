import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { etatQuota } from '@/lib/billing/quota';
import { VALEURS_LIVREE } from '@/lib/livraison';
import { inventaireSessions, santeSessionWhatsApp } from '@/lib/wasenderSessions';

export const dynamic = 'force-dynamic';

/**
 * La veille des chaines rompues.
 *
 * POURQUOI ELLE EXISTE. Aucun des defauts de la semaine du 18 au 21 aout n'a
 * leve d'erreur : la fuite entre marchands, la commande fantome nee d'un
 * « bonjour », les coordonnees inventees, les six miroirs Google Sheets qui
 * tuaient la chaine. Tous ont ete trouves parce qu'un humain regardait une
 * capture d'ecran.
 *
 * Avec deux marchands, l'exploitant EST la surveillance. A vingt, il ne l'est
 * plus, et personne ne verra que le client du marchand n°14 n'a jamais recu sa
 * confirmation. Il ne reviendra pas, le marchand ne saura pas pourquoi.
 *
 * CE QU'ELLE SURVEILLE : DES RESULTATS, PAS DES ERREURS. Une erreur dit qu'un
 * appel a echoue. Un resultat dit qu'une commande confirmee n'a jamais atteint
 * de livreur — ce qui est vrai meme quand tous les appels ont reussi. C'est
 * exactement le cas qui s'est produit : les noeuds ne LEVAIENT pas, ils ne
 * rendaient simplement aucun item.
 *
 * CE QU'ELLE NE FAIT PAS. Elle ne double pas `rapport_retards`, qui previent le
 * MARCHAND qu'une commande traine chez lui. Celle-ci previent l'EXPLOITANT que
 * la machine est cassee, et chez qui.
 *
 * CHAQUE ANOMALIE N'EST ANNONCEE QU'UNE FOIS. Sans cela, la meme commande
 * cassee reviendrait toutes les quinze minutes jusqu'a ce qu'on cesse de lire
 * les alertes. Le verrou est la cle primaire de `anomalies_signalees`, pas un
 * controle applicatif : deux passages simultanes ne peuvent pas la doubler.
 */

type Anomalie = {
  type: string;
  reference: string;
  boutique: string;
  /** Ce qu'un humain doit lire pour comprendre sans ouvrir la base. */
  detail: string;
};

/** Le temps qu'on laisse a la chaine avant de la declarer rompue. */
const MINUTES_AVANT_DISPATCH = 10;
/** Au-dela, ce n'est plus une panne a corriger : c'est de l'histoire. */
const HEURES_DE_FENETRE = 48;

const fcfa = (n: unknown) => Number(n ?? 0).toLocaleString('fr-FR');

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  const client = getSupabaseAdmin();
  if (!client) return Response.json({ error: 'Base indisponible' }, { status: 503 });
  // Capture non nulle : les fermetures ci-dessous ne peuvent pas prouver a
  // TypeScript que le controle a eu lieu.
  const sb = client;

  const maintenant = Date.now();
  const seuilDispatch = new Date(maintenant - MINUTES_AVANT_DISPATCH * 60_000).toISOString();
  const fenetre = new Date(maintenant - HEURES_DE_FENETRE * 3_600_000).toISOString();
  const hier = new Date(maintenant - 24 * 3_600_000).toISOString();

  const trouvees: Anomalie[] = [];

  // Le nom lisible de chaque boutique, pour que l'alerte nomme le marchand
  // plutot que de rendre un uuid que personne ne reconnait.
  const { data: boutiques } = await sb.from('boutiques').select('id, slug, nom, essai, user_id');
  const nomDe = new Map((boutiques ?? []).map((b) => [String(b.id), String(b.nom || b.slug || '?')]));

  // LES BOUTIQUES DE BANC NE SONT PAS DES PANNES. Depuis que le banc de chaine
  // existe, chacun de ses passages laisse derriere lui des commandes qui, vues
  // d'ici, ressemblent a des chaines rompues — stock non decompte, panier
  // oublie. Les signaler ferait crier la veille a chaque essai, et une veille
  // qu'on bruite est une veille qu'on cesse de lire. C'est le meme raisonnement
  // que le drapeau `essai` cote dispatch : fidele la ou ca compte, muet la ou
  // ca derangerait.
  const deBanc = new Set(
    (boutiques ?? []).filter((b) => b.essai === true).map((b) => String(b.id)),
  );

  const lire = async (
    type: string,
    detail: (c: Record<string, unknown>) => string,
    construire: (r: ReturnType<typeof sb.from>) => unknown,
  ) => {
    const { data, error } = (await construire(sb.from('commandes'))) as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    };

    if (error) {
      // Une veille qui echoue en silence est pire que pas de veille : elle
      // rassure a tort. On remonte, la tache appelante alertera.
      throw new Error(`${type} — lecture impossible : ${error.message}`);
    }

    for (const c of data ?? []) {
      if (deBanc.has(String(c.boutique_id))) continue;
      trouvees.push({
        type,
        reference: String(c.reference ?? ''),
        boutique: nomDe.get(String(c.boutique_id)) ?? '?',
        detail: detail(c),
      });
    }
  };

  try {
    // ---- 1. LE CLIENT A CONFIRME, AUCUN LIVREUR N'A ETE LANCE.
    //
    // C'est la rupture la plus couteuse : le client attend une commande que
    // personne ne prepare. Elle s'est produite le 21 aout, quand la recherche
    // de commande lisait encore une feuille devenue vide.
    // UN RETRAIT N'EST PAS UNE CHAINE ROMPUE. Le client vient chercher : il
    // n'y a ni livreur a lancer, ni frais a annoncer, ni personne dont on
    // devrait savoir qui a livre. Sans ce filtre, ce controle crierait sur
    // CHAQUE commande a emporter — et une veille qu'on bruite est une veille
    // qu'on cesse de lire.
    //
    // ELLE NE VOYAIT QUE LES COMMANDES CONFIRMEES, ET C'ETAIT LE TROU.
    //
    // Le filtre exigeait `confirmation_statut = 'confirmee'`. Or une commande
    // passee depuis la VITRINE ne traverse aucune etape de confirmation : le
    // client a clique « commander », il n'y a rien a lui redemander. Sa colonne
    // reste donc `null`, et elle etait invisible a ce controle.
    //
    // C'est precisement la forme que prend la panne la plus probable depuis la
    // migration : n8n injoignable au moment de la commande. La prise de
    // commande est etagee pour y survivre — Supabase fait foi et refuse si
    // l'ecriture rate, la feuille et le webhook n8n sont NON BLOQUANTS — donc
    // le client commande, le marchand voit sa commande… et AUCUN LIVREUR N'EST
    // LANCE. L'echec du webhook est journalise, mais personne ne lit les
    // journaux d'un serveur.
    //
    // Le filet pose contre la panne creait donc son propre angle mort : la
    // commande survit, et c'est justement pour cela que rien ne crie.
    //
    // ON ENUMERE LES DEUX ETATS QUI AUTORISENT LE DISPATCH, on n'exclut pas
    // les autres. `not.in('refusee','demandee')` aurait paru equivalent et
    // aurait REPERDU tous les `null` : en SQL, `colonne NOT IN (…)` vaut NULL
    // quand la colonne est nulle, donc la ligne est ecartee. Le piege qui a
    // cree ce trou aurait suffi a le recreer.
    //
    // `refusee` reste dehors a dessein : ne pas lancer de livreur y est le
    // comportement correct. `demandee` aussi — le client n'a pas encore
    // repondu, et attendre est normal.
    await lire(
      'confirmee_sans_livreur',
      (c) => `reçue il y a ${Math.round((maintenant - Date.parse(String(c.created_at))) / 60_000)} min, aucun livreur`,
      (r) => r
        .select('reference, boutique_id, created_at')
        .eq('statut', 'en_attente')
        .eq('mode_recuperation', 'livraison')
        .or('confirmation_statut.is.null,confirmation_statut.eq.confirmee')
        .is('nom_livreur', null)
        .lt('created_at', seuilDispatch)
        .gt('created_at', fenetre)
        .limit(50),
    );

    // ---- 2. LIVREE SANS QUE LES FRAIS AIENT ETE ANNONCES.
    //
    // Le client n'a jamais su combien payer au livreur. NULL ne veut pas dire
    // gratuit : c'est « le livreur ne l'a pas dit ».
    await lire(
      'livree_sans_frais',
      () => 'livrée sans que les frais aient été annoncés au client',
      (r) => r
        .select('reference, boutique_id, created_at')
        .in('statut_livraison', [...VALEURS_LIVREE])
        .eq('mode_recuperation', 'livraison')
        .is('frais_livraison', null)
        .gt('created_at', fenetre)
        .limit(50),
    );

    // ---- 3. LIVREE, STOCK JAMAIS DECOMPTE.
    //
    // Le marchand croit avoir en rayon ce qu'il a deja vendu, et refusera une
    // vente bien reelle ou en acceptera une impossible.
    await lire(
      'livree_sans_decompte',
      (c) => `livrée (${fcfa(c.total)} F) sans décompte de stock`,
      (r) => r
        .select('reference, boutique_id, total, created_at')
        .eq('statut', 'livree')
        .is('stock_decremente_le', null)
        .gt('created_at', fenetre)
        .limit(50),
    );

    // ---- 4. LIVREE, MAIS ON NE SAIT PAS QUI L'A FAITE.
    //
    // Le marchand ne peut ni remercier, ni demander des comptes, ni compter les
    // courses de qui que ce soit. `livreurs.total_livraisons` et `gain_total`
    // resteraient vides pour toujours.
    //
    // Ce detecteur existe surtout pour EPROUVER UN CORRECTIF. Le 22 aout 2026,
    // la voie Telegram n'enregistrait jamais le livreur — le noeud lisait un
    // champ qu'aucun autre ne produisait. Corrige cote n8n le soir meme ; sans
    // ce detecteur, « ca se remplira desormais » serait reste une affirmation
    // que personne ne verifie.
    await lire(
      'livree_sans_livreur',
      () => 'livrée sans qu’on sache qui l’a livrée',
      (r) => r
        .select('reference, boutique_id, created_at')
        .in('statut_livraison', [...VALEURS_LIVREE])
        .eq('mode_recuperation', 'livraison')
        .is('nom_livreur', null)
        .gt('created_at', fenetre)
        .limit(50),
    );

    // ---- 5. PANIER RESTE EN COLLECTE PLUS DE 24 HEURES.
    //
    // L'assistante a commence une commande et ne l'a jamais finie. Rien ne les
    // ferme : la relance des paniers abandonnes ne traite que ceux dont la
    // confirmation a ete DEMANDEE.
    await lire(
      'panier_oublie',
      (c) => `panier en collecte depuis plus de 24 h (${fcfa(c.total)} F)`,
      (r) => r
        .select('reference, boutique_id, total, created_at')
        .eq('statut', 'panier')
        .lt('created_at', hier)
        .gt('created_at', fenetre)
        .limit(50),
    );

    // ---- 6. LE FORFAIT EST DEPASSE, ET PERSONNE NE LE DIT.
    //
    // Le quota compte DEJA toutes les commandes, quel que soit le canal : la
    // mesure n'a jamais ete asymetrique. Ce qui l'etait, c'est la reaction —
    // l'assistante declinait, la vitrine laissait passer.
    //
    // La regle retenue est de LAISSER PASSER ET DE PREVENIR : on ne fait jamais
    // perdre une vente a un marchand pour une question de facturation. Le
    // depassement se regle entre lui et nous, pas au detriment de son client.
    //
    // Mais « laisser passer » sans rien dire, c'est un marchand qui decouvre
    // son depassement sur sa facture. Il ne le voyait jusqu'ici que s'il
    // ouvrait son tableau de bord — le compteur y est, personne ne le pousse.
    //
    // LE QUOTA EST CELUI DU COMPTE, PAS DE LA BOUTIQUE. Un compte peut en
    // posseder plusieurs, et `etatQuota` additionne leurs commandes. On
    // dedoublonne donc par `user_id` : sans cela, un marchand a deux enseignes
    // recevrait deux fois la meme alerte pour un seul depassement.
    //
    // LA REFERENCE PORTE LE MOIS. La cle primaire de `anomalies_signalees`
    // fait le reste : une fois par fenetre de facturation, puis silence. Le
    // mois suivant ouvre une nouvelle reference, donc une nouvelle alerte —
    // c'est bien un nouveau depassement.
    const parCompte = new Map<string, { slug: string; nom: string }>();
    for (const b of boutiques ?? []) {
      if (b.essai === true) continue;
      const compte = String(b.user_id ?? '').trim();
      if (!compte) continue;
      const connue = parCompte.get(compte);
      const slug = String(b.slug ?? '');
      // Le slug le plus petit, pour que la reference ne bouge pas quand la
      // base rend les boutiques dans un autre ordre.
      if (!connue || slug < connue.slug) {
        parCompte.set(compte, { slug, nom: String(b.nom || slug || '?') });
      }
    }

    for (const [compte, ident] of parCompte) {
      // Une panne du quota ne doit pas emporter toute la veille : les cinq
      // controles precedents valent d'etre rendus meme si celui-ci echoue.
      let etat = null;
      try {
        etat = await etatQuota(compte);
      } catch (e) {
        console.error('Veille — quota illisible pour un compte :', e);
        continue;
      }

      if (!etat || etat.exempt || !etat.bloque) continue;

      trouvees.push({
        type: 'forfait_depasse',
        reference: `${ident.slug || compte}-${String(etat.fenetreDebut).slice(0, 7)}`,
        boutique: ident.nom,
        detail:
          `${etat.utilise} commandes sur les ${etat.quota} du forfait ${etat.plan}`
          + ' — les commandes continuent de passer, le depassement se regle avec lui',
      });
    }

    // ---- 4. LES SESSIONS WHATSAPP DES MARCHANDS REPONDENT-ELLES ENCORE ?
    //
    // ON SURVEILLE LE JETON DU MARCHAND, PAS UN REPLI DE PLATEFORME. La
    // premiere version de ce bloc sondait `WASENDER_API_KEY` et a leve une
    // FAUSSE ALERTE des son premier passage : cette variable est absente a
    // dessein. Un repli plateforme ferait partir les messages d'un marchand
    // par le numero d'un autre — son absence est l'etat correct. Sonder son
    // absence, c'etait crier au loup sur une porte volontairement fermee.
    //
    // UNE BOUTIQUE SANS JETON WHATSAPP N'EST PAS EN PANNE : elle vend par
    // Telegram, et il n'y a rien a surveiller. Confondre « pas branche » et
    // « casse » remplirait l'alerte de bruit, et le bruit fait cesser de lire.
    //
    // LA REFERENCE PORTE LE JOUR. Le verrou de `anomalies_signalees` n'annonce
    // chaque couple (reference, type) qu'une fois — parfait pour une commande
    // cassee, piege pour une sante qui dure : la panne se dirait le premier
    // jour puis se tairait, et ce silence se lirait comme un retour a la
    // normale. Datee, elle se redit une fois par jour tant qu'elle dure.
    const { data: aSurveiller } = await sb
      .from('boutiques')
      .select('slug, nom, actif, essai');

    const jour = new Date().toISOString().slice(0, 10);

    for (const b of aSurveiller ?? []) {
      if (b.actif === false || b.essai === true) continue;
      const slug = String(b.slug ?? '').trim();
      if (!slug) continue;

      const { data: jeton, error: errJeton } = await sb.rpc('jeton_canal', {
        p_boutique: slug,
        p_canal: 'wasender',
      });
      if (errJeton || typeof jeton !== 'string' || !jeton.trim()) continue;

      const sante = await santeSessionWhatsApp(jeton);

      // SEULE `deconnectee` LEVE. `indetermine` est un doute — reseau tombe,
      // reponse illisible — et la sonde de veille a deja annonce « n8n
      // injoignable » alors qu'il tournait. Une alerte fausse coute deux fois :
      // le derangement, puis la defiance envers toutes les suivantes.
      if (sante.etat !== 'deconnectee') continue;

      trouvees.push({
        type: 'whatsapp_marchand',
        reference: `whatsapp-${slug}-${jour}`,
        boutique: String(b.nom ?? slug),
        detail:
          `Session WhatsApp deconnectee (${sante.brut}). Les messages ne partent`
          + ' plus. Verifier l abonnement wasender, puis rebrancher le numero.',
      });
    }

    // ---- 5. LE COMPTE WASENDER LUI-MEME : L'ABONNEMENT TIENT-IL ?
    //
    // Le controle precedent interroge la session d'UN marchand, avec SON
    // jeton : il dit si ses messages partent. Il ne voit rien du compte — ni
    // l'abonnement, ni les places payees. Une session abandonnee, rattachee a
    // aucune boutique, lui est invisible et se facture tous les mois.
    //
    // LES DEUX VERDICTS GRAVES SORTENT DU STATUT HTTP, PAS DU CORPS. Ce point
    // d'entree n'a pas pu etre appele depuis un poste de developpement — le
    // jeton de compte est « Sensitive » chez Vercel. La forme de la reponse
    // etait donc inconnue a l'ecriture, et rien d'important n'en depend.
    const compte = await inventaireSessions();

    // `injoignable` et `reponse_illisible` SE TAISENT : ce sont des doutes.
    // `sans_jeton` aussi — et c'est la lecon du jour meme : la version
    // precedente de cette veille alertait sur une variable absente A DESSEIN.
    // Une configuration manquante n'est pas une panne en cours.
    if (!compte.ok && (compte.motif === 'refus' || compte.motif === 'plafond')) {
      trouvees.push({
        type: 'compte-wasender',
        reference: `compte-wasender-${jour}`,
        boutique: 'DjiguiFlow',
        detail:
          compte.motif === 'plafond'
            ? 'Le compte wasender signale une limite ou un abonnement en cause.'
              + ' Aucune nouvelle ligne ne peut etre branchee. Verifier le forfait.'
            : 'Le compte wasender refuse l authentification. Abonnement echu,'
              + ' paiement rejete ou cle revoquee — verifier chez wasender.',
      });
    }

    // Une session que le compte declare deconnectee, meme sans savoir a quelle
    // boutique elle appartient. Le nom sort du corps quand il est lisible ;
    // sinon la ligne le dit plutot que d'inventer.
    if (compte.ok && compte.deconnectees.length) {
      trouvees.push({
        type: 'ligne-whatsapp-eteinte',
        reference: `lignes-eteintes-${jour}`,
        boutique: 'DjiguiFlow',
        detail:
          `${compte.deconnectees.length} ligne(s) WhatsApp deconnectee(s) au compte : `
          + compte.deconnectees.slice(0, 5).join(', ')
          + '. Elles se facturent sans servir.',
      });
    }
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'erreur inconnue';
    console.error('Veille des chaines —', raison);
    return Response.json({ ok: false, error: raison }, { status: 503 });
  }

  if (!trouvees.length) {
    return Response.json({ ok: true, nouvelles: 0, anomalies: [] });
  }

  // ---- Ne garder que ce qui n'a jamais ete annonce.
  //
  // L'INSERTION FAIT OFFICE DE FILTRE. Lire d'abord puis ecrire laisserait deux
  // passages simultanes annoncer la meme anomalie ; ici, le second se heurte a
  // la cle primaire et n'obtient rien.
  const { data: inserees, error: errInsert } = await sb
    .from('anomalies_signalees')
    .upsert(
      trouvees.map((a) => ({ reference: a.reference, type: a.type, boutique: a.boutique })),
      { onConflict: 'reference,type', ignoreDuplicates: true },
    )
    .select('reference, type');

  if (errInsert) {
    console.error('Veille des chaines — memoire indisponible :', errInsert.message);
    return Response.json({ ok: false, error: errInsert.message }, { status: 503 });
  }

  const neuves = new Set((inserees ?? []).map((a) => `${a.reference}|${a.type}`));
  const anomalies = trouvees.filter((a) => neuves.has(`${a.reference}|${a.type}`));

  return Response.json({
    ok: true,
    nouvelles: anomalies.length,
    vues: trouvees.length,
    anomalies,
  });
}
