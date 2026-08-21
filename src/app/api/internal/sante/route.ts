import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Les silences de la chaine : surveiller les RESULTATS, pas les erreurs.
 *
 * POURQUOI CETTE ROUTE EXISTE. Aucun des defauts de la semaine du 14 aout n'a
 * leve d'alerte : la fuite entre marchands, la commande fantome sur « bonjour »,
 * les coordonnees inventees, les six miroirs qui tuaient la chaine. Tous ont
 * ete trouves parce que le marchand regardait une capture d'ecran. A deux
 * marchands, il EST la surveillance. A vingt, il ne l'est plus — et personne ne
 * verra que le client du marchand n°14 n'a jamais recu sa confirmation. C'est
 * le seul risque qui grandit avec le nombre.
 *
 * CE QU'ON SURVEILLE N'EST PAS UNE ERREUR. Une exception leve une alerte toute
 * seule ; ce qui est dangereux ici, c'est le SILENCE — une commande qui reste
 * assise sans que rien n'echoue. Ces trois detecteurs cherchent des resultats
 * absents, pas des erreurs presentes.
 *
 * ELLE DETECTE, ELLE N'ALERTE PAS. Comme `commandes/abandons`, la regle vit ici
 * ou elle est lisible et eprouvable ; n8n ne sert que d'horloge, et c'est lui
 * qui porte le message au bot de veille. Une route qui enverrait elle-meme
 * dupliquerait un canal d'alerte qui existe deja.
 *
 * CHAQUE CONSTAT NOMME LE MARCHAND. Un decompte global — « 3 commandes en
 * souffrance » — n'est pas actionnable : il faut savoir CHEZ QUI.
 *
 * --------------------------------------------------------------------------
 * TROIS PIEGES DE TERRAIN, mesures le 21 aout 2026, qui expliquent les choix
 * de colonnes ci-dessous :
 *
 * 1. `livraisons` est une table MORTE : 0 ligne, alors que 24 commandes
 *    portaient un livreur. Un detecteur bati dessus dirait « tout va bien »
 *    pour toujours. On lit donc `commandes.heure_prise_en_charge`.
 *
 * 2. `statut_livraison` a QUATRE orthographes de « livre » (`livre`, `livree`,
 *    `livrée`, plus `en attente`, `accepte`, `en route`) et aucune contrainte
 *    ne la tient. Filtrer dessus raterait des lignes en silence. On lit
 *    `statut`, dont le vocabulaire est clos.
 *
 * 3. `produits` porte DEUX colonnes de stock, `stock` et `quantite_stock`.
 *    Aucun detecteur ici n'en depend : on lit `stock_decremente_le` sur la
 *    commande, qui est le fait qu'on surveille — le decompte a-t-il eu lieu.
 */

/**
 * Une commande confirmee dont personne ne s'est saisi.
 *
 * Dix minutes est le seuil retenu avec le marchand. Il ne distingue pas « la
 * course n'est jamais partie au groupe » de « elle est partie, aucun livreur
 * n'a accepte » : la donnee ne permet pas de trancher, et du point de vue du
 * client les deux sont le meme silence. L'age est donc rendu avec chaque
 * constat, pour que dix minutes et onze heures ne se lisent pas pareil.
 */
const MINUTES_SANS_LIVREUR = 10;

/**
 * La fenetre du detecteur de stock.
 *
 * BORNEE, ET C'EST LE POINT. Sans borne, il remonterait 21 commandes livrees
 * entre le 5 et le 19 aout dont le stock n'a jamais ete decompte — un defaut
 * REEL a l'epoque, corrige depuis par le decouplage Google Sheets. Un moniteur
 * qui annonce vingt-et-une pannes deja reglees perd sa credibilite le jour de
 * son lancement, et on cesse de le lire avant qu'il ne dise vrai.
 */
const HEURES_FENETRE_STOCK = 48;

/**
 * Au-dela, `commandes/abandons` aurait du fermer la ligne.
 *
 * Cette route ferme a 24 h. Une confirmation encore « demandee » a 26 h ne dit
 * pas qu'un client n'a pas repondu : elle dit que la tache planifiee ne tourne
 * plus. C'est une surveillance de la surveillance, et elle vaut son cout : le
 * 15 aout, le quota n8n epuise avait arrete la plateforme entiere sans que le
 * workflow d'alerte puisse alerter non plus.
 */
const HEURES_ABANDONS_EN_RETARD = 26;

type Constat = {
  /** Le silence observe, en un mot-cle stable pour n8n. */
  type: 'sans_livreur' | 'stock_non_decompte' | 'abandons_en_retard';
  /** Toujours nomme : un compte global n'est pas actionnable. */
  boutique: string;
  reference: string;
  /** Depuis combien de temps ce silence dure. */
  age_minutes: number;
  /** De quoi juger sans ouvrir la base. */
  detail: string;
};

type LigneCommande = {
  reference: string | null;
  total: number | null;
  created_at: string | null;
  boutiques: { nom: string | null } | null;
};

const minutesDepuis = (iso: string | null): number =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60_000) : 0;

const nomBoutique = (l: LigneCommande): string =>
  String(l.boutiques?.nom ?? '').trim() || 'boutique inconnue';

const fcfa = (n: number | null) => Number(n ?? 0).toLocaleString('fr-FR');

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const maintenant = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const constats: Constat[] = [];
  const champs = 'reference, total, created_at, boutiques(nom)';

  // ---- 1. Confirmee, et personne ne s'en est saisi.
  const seuilLivreur = iso(maintenant - MINUTES_SANS_LIVREUR * 60_000);
  const { data: sansLivreur, error: errLivreur } = await sb
    .from('commandes')
    .select(champs)
    .eq('confirmation_statut', 'confirmee')
    .in('statut', ['en_attente', 'en_livraison'])
    .is('heure_prise_en_charge', null)
    .lt('created_at', seuilLivreur)
    .order('created_at', { ascending: true })
    .limit(100);

  // ---- 2. Livree, stock jamais decompte, dans la fenetre recente.
  const seuilStock = iso(maintenant - HEURES_FENETRE_STOCK * 3_600_000);
  const { data: stockOublie, error: errStock } = await sb
    .from('commandes')
    .select(champs)
    .eq('statut', 'livree')
    .is('stock_decremente_le', null)
    .gt('created_at', seuilStock)
    .order('created_at', { ascending: true })
    .limit(100);

  // ---- 3. La tache `abandons` ne ferme plus rien.
  const seuilAbandons = iso(maintenant - HEURES_ABANDONS_EN_RETARD * 3_600_000);
  const { data: abandonsBloques, error: errAbandons } = await sb
    .from('commandes')
    .select(champs)
    .eq('confirmation_statut', 'demandee')
    .eq('statut', 'en_attente')
    .lt('created_at', seuilAbandons)
    .order('created_at', { ascending: true })
    .limit(100);

  // UNE LECTURE RATEE N'EST PAS UN SILENCE DE MOINS.
  //
  // Si l'on avalait l'erreur, la route rendrait « 0 constat » et n8n
  // conclurait que la chaine va bien. Un moniteur qui ment quand il est casse
  // est pire que pas de moniteur : il fabrique une confiance sans objet.
  const panne = errLivreur ?? errStock ?? errAbandons;
  if (panne) {
    console.error('Sante — lecture impossible :', panne.message);
    return Response.json(
      { ok: false, erreur: `Lecture impossible : ${panne.message}` },
      { status: 503 },
    );
  }

  for (const l of (sansLivreur ?? []) as unknown as LigneCommande[]) {
    constats.push({
      type: 'sans_livreur',
      boutique: nomBoutique(l),
      reference: String(l.reference ?? ''),
      age_minutes: minutesDepuis(l.created_at),
      detail: `${fcfa(l.total)} F confirmes, aucun livreur`,
    });
  }

  for (const l of (stockOublie ?? []) as unknown as LigneCommande[]) {
    constats.push({
      type: 'stock_non_decompte',
      boutique: nomBoutique(l),
      reference: String(l.reference ?? ''),
      age_minutes: minutesDepuis(l.created_at),
      detail: 'livree, stock jamais decompte',
    });
  }

  for (const l of (abandonsBloques ?? []) as unknown as LigneCommande[]) {
    constats.push({
      type: 'abandons_en_retard',
      boutique: nomBoutique(l),
      reference: String(l.reference ?? ''),
      age_minutes: minutesDepuis(l.created_at),
      detail: `en attente de confirmation depuis plus de ${HEURES_ABANDONS_EN_RETARD} h`,
    });
  }

  // Les boutiques concernees, pour qu'une alerte puisse dire CHEZ QUI sans
  // avoir a relire la liste entiere.
  const boutiques = [...new Set(constats.map((c) => c.boutique))].sort();

  return Response.json({
    ok: true,
    // n8n n'alerte que si ce nombre est non nul : c'est le seul test dont il
    // a besoin, et il reste vrai si l'on ajoute un detecteur.
    total: constats.length,
    par_type: {
      sans_livreur: constats.filter((c) => c.type === 'sans_livreur').length,
      stock_non_decompte: constats.filter((c) => c.type === 'stock_non_decompte').length,
      abandons_en_retard: constats.filter((c) => c.type === 'abandons_en_retard').length,
    },
    boutiques,
    constats,
  });
}
