import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { VALEURS_LIVREE } from '@/lib/livraison';

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
  const { data: boutiques } = await sb.from('boutiques').select('id, slug, nom, essai');
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
