import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/lib/database.types';
import { canoniserStatutLivraison, estLivree } from '@/lib/livraison';
import { motifExact, referenceRecevable } from '@/lib/reference';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Etat de livraison d'une commande, reflete dans Supabase.
 *
 * Le parcours livreur ecrit ses statuts dans Google Sheets, qui reste la vue
 * operationnelle. Supabase, lui, ne les voyait jamais — et c'est lui que
 * `rapport_retards` interroge. Consequence : une commande livree restait
 * signalee en retard au gerant, indefiniment. Constate le 11 aout 2026 sur une
 * commande de test livree, encore comptee a 1003 minutes de retard.
 *
 * On ne touche qu'aux colonnes de livraison : le reste de la commande a ses
 * propres chemins d'ecriture, et les ecraser depuis ici creerait des courses
 * de mise a jour.
 */
type MajCommande = Database['public']['Tables']['commandes']['Update'];

/**
 * Les colonnes de livraison, DERIVEES de la table.
 *
 * Elles etaient reecrites a la main : une colonne renommee en base laissait ce
 * type inchange, et la mise a jour partait vers une colonne disparue. `Pick`
 * les fait echouer a la compilation.
 */
type Champs = Pick<
  MajCommande,
  'statut_livraison' | 'nom_livreur' | 'position_livreur' | 'heure_prise_en_charge' | 'heure_livraison'
>;

/**
 * LA ROUTE LA PLUS EXPOSEE PAR LES JOKERS, ET CELLE QUI ECRIT.
 *
 * `ilike` interprete % et _ : une reference valant « % » mettrait a jour TOUTES
 * les commandes de la plateforme, livrees comprises. La reference arrive d'une
 * feuille que l'agent remplit — elle n'est pas de confiance.
 *
 * CE QUE L'ANCIENNE VERSION LAISSAIT PASSER. Elle echappait `%` et `_` et
 * ignorait `*`, alias du `%` chez PostgREST. Une seule requete portant
 * `reference: "*"` basculait donc toutes les commandes de tous les marchands en
 * « livree » — et `estLivree` forcait `statut` avec. La regle et sa liste
 * blanche vivent maintenant dans `@/lib/reference`.
 */

const CHAMPS: (keyof Champs)[] = [
  'statut_livraison',
  'nom_livreur',
  'position_livreur',
  'heure_prise_en_charge',
  'heure_livraison',
];

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const reference = String(corps.reference ?? corps.order_id ?? '').trim();
  if (!reference) {
    return NextResponse.json({ error: 'reference requise' }, { status: 400 });
  }

  // CETTE ROUTE ECRIT. Un motif au lieu d'une reference y touchait plusieurs
  // lignes d'un coup ; on refuse donc la forme avant d'approcher la base.
  if (!referenceRecevable(reference)) {
    console.error(`Livraison — reference de forme invalide refusee : ${reference}`);
    return NextResponse.json({ error: 'reference invalide' }, { status: 400 });
  }

  // ET ELLE ECRIT LE STATUT, ce qui en fait la plus lourde des routes qui
  // cherchent par reference. Sans le filtre de boutique pose plus bas sur ses
  // TROIS ecritures, un appel portant la reference d'un autre marchand
  // basculait sa commande en « livree » — donc hors de l'alerte retard de son
  // gerant, comptee dans ses livraisons du jour, et son client prevenu d'une
  // livraison qui n'a pas eu lieu.
  //
  // La liste blanche de `referenceRecevable` fermait le motif `*` qui touchait
  // TOUTE la table ; elle ne dit rien d'une reference parfaitement formee mais
  // appartenant a quelqu'un d'autre. Les deux controles sont complementaires :
  // l'un refuse une forme, l'autre refuse une appartenance.
  const boutiqueRef = String(corps.boutique ?? corps.slug ?? corps.boutique_id ?? '').trim();
  if (!boutiqueRef) {
    return NextResponse.json({ error: 'boutique requise' }, { status: 400 });
  }

  const marchand = await resoudreMarchand(boutiqueRef);
  if (!marchand) {
    return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 });
  }

  // Une chaine vide vaut « pas de changement » : la feuille en envoie pour les
  // colonnes qu'une etape ne renseigne pas.
  const maj: MajCommande = {};
  for (const champ of CHAMPS) {
    const valeur = String(corps[champ] ?? '').trim();
    if (valeur) maj[champ] = valeur;
  }

  if (!Object.keys(maj).length) {
    return NextResponse.json({ error: 'aucun champ de livraison fourni' }, { status: 400 });
  }

  /**
   * UNE SEULE ORTHOGRAPHE ENTRE EN BASE.
   *
   * n8n transmet la valeur telle que le workflow l'a produite. La production
   * en portait donc trois pour un seul etat — « livre », « livree »,
   * « livrée » — et trois lectures comparaient a l'egalite stricte : six
   * commandes leur etaient invisibles, dont pour la veille qui repere les
   * livraisons sans frais annonces.
   *
   * C'est ICI qu'on ferme, et non dans n8n : cette route est la porte unique
   * par laquelle une livraison se met a jour. Corriger cote workflow aurait
   * demande de recommencer a chaque nouveau chemin.
   *
   * Voir `src/lib/livraison.ts` : seule la famille « livree » est ramenee a sa
   * forme retenue. Les autres valeurs sont relues par des workflows que ce
   * depot ne controle pas, et les reecrire casserait peut-etre une
   * comparaison invisible d'ici.
   */
  if (maj.statut_livraison !== undefined) {
    maj.statut_livraison = canoniserStatutLivraison(maj.statut_livraison);
  }

  /**
   * Une livraison terminee cloture aussi la commande.
   *
   * `rapport_retards` et `rapport_activite` raisonnent sur `statut`, jamais sur
   * `statut_livraison` : sans cette ligne, une commande livree reste « en
   * attente » pour la base — elle figure indefiniment dans l'alerte retard du
   * gerant, et n'est jamais comptee parmi les livrees du jour.
   *
   * Le test reste LARGE meme apres la canonisation : celle-ci vient d'etre
   * posee, et une ligne ecrite par un autre chemin — import, correction a la
   * main — ne doit pas rouvrir le defaut. Une comparaison stricte laisserait
   * la commande ouverte sans que rien ne le signale, derriere un 200 ok.
   */
  if (estLivree(maj.statut_livraison)) {
    maj.statut = 'livree';
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .update(maj)
    .ilike('reference', motifExact(reference))
    .eq('boutique_id', marchand.boutiqueId)
    .select('id, boutique_id');

  if (error) {
    console.error(`Livraison — ecriture impossible (${reference}) :`, error.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  /**
   * QUI a livre, et pas seulement sous quel nom.
   *
   * `nom_livreur` est un INSTANTANE TEXTE, et c'est le nom d'affichage Telegram
   * — emojis compris. Il ne designe aucune fiche : jusqu'ici, rien ne reliait
   * une livraison a l'annuaire du marchand. Consequence mesuree le 23 aout
   * 2026 : la page « Livreurs » annoncait « 0 Livraisons » a un livreur qui en
   * avait fait quinze.
   *
   * L'identifiant Telegram, lui, est stable et non usurpable — il vient de
   * Telegram, jamais du texte du message. On le resout ICI plutot que dans
   * n8n : la regle vaut alors pour tout appelant present ou futur, et un
   * workflow modifie ne peut plus l'oublier. Meme raisonnement que pour
   * `statut` et les horodatages ci-dessous.
   *
   * FACULTATIF, ET SANS CONSEQUENCE S'IL MANQUE. Tant que le workflow
   * n'envoie pas le champ, cette route se comporte exactement comme avant.
   *
   * LA RECHERCHE EST CLOISONNEE PAR BOUTIQUE. Un identifiant Telegram est
   * mondial : sans ce filtre, le livreur d'un marchand serait attribue aux
   * courses d'un autre — le meme defaut que celui ferme le 20 aout sur les
   * notifications.
   */
  const livreurTelegramId = String(corps.livreur_telegram_id ?? '').trim();
  const boutiqueId = data?.[0]?.boutique_id ?? null;
  let livreurAttribue = false;

  if (livreurTelegramId && boutiqueId) {
    const { data: fiche, error: errFiche } = await sb
      .from('livreurs')
      .select('id')
      .eq('boutique_id', boutiqueId)
      .eq('telegram_id', livreurTelegramId)
      .maybeSingle();

    // Un livreur absent de l'annuaire est un cas NORMAL : il rejoint le groupe
    // Telegram sans jamais ouvrir son lien d'invitation. On laisse `livreur_id`
    // a NULL — « on ne sait pas qui a livre » — plutot que d'inventer un lien.
    if (errFiche) {
      console.error(`Livraison — fiche livreur illisible (${reference}) :`, errFiche.message);
    } else if (fiche) {
      const { error: errLien } = await sb
        .from('commandes')
        .update({ livreur_id: fiche.id })
        .ilike('reference', motifExact(reference))
        // CE FILTRE-CI N'EST PAS PORTEUR AUJOURD'HUI, et il faut le dire.
        // `boutiqueId` est lu sur la ligne rendue par l'ecriture principale,
        // qui est bornee : cette requete ne peut deja viser que la bonne
        // boutique. Le retirer ne fait rougir aucun test — verifie par
        // mutation le 2 septembre 2026.
        // Il reste parce qu'il coute une ligne et ferme la porte au jour ou
        // `boutiqueId` viendrait d'ailleurs. Ne pas le confondre avec les six
        // autres, qui sont eprouves.
        .eq('boutique_id', marchand.boutiqueId);

      // L'attribution est un CONFORT STATISTIQUE. Elle ne doit jamais faire
      // echouer une livraison deja enregistree : la mise a jour principale a
      // abouti, le client est prevenu, le reste peut attendre le prochain appel.
      if (errLien) {
        console.error(`Livraison — attribution impossible (${reference}) :`, errLien.message);
      } else {
        livreurAttribue = true;
      }
    }
  }

  /**
   * Les horodatages se DEDUISENT du statut, comme `statut` juste au-dessus.
   *
   * LE DEFAUT QUE CECI FERME. Le chemin n8n n'ecrivait que `statut_livraison`.
   * Verifie le 21 aout sur quatre executions consecutives : `Trouver la
   * commande` rendait `undefined` pour les deux horodatages et `""` pour le
   * livreur, et la route repondait « maj: { statut_livraison } » — rien
   * d'autre. Le workflow RENVOYAIT les valeurs existantes au lieu d'en
   * produire : a l'acceptation, `heure_prise_en_charge` est legitimement vide,
   * c'est l'instant de la poser et non de la repeter.
   *
   * Consequence mesuree : l'horodatage n'existait que la ou le tableau de bord
   * etait passe — 23 commandes sur 24 avec un nom de livreur, contre 1 sur 7
   * sans. Aucune commande passee par le circuit livreur n'avait d'heure. Tout
   * calcul de delai etait aveugle sur elles, et le detecteur « sans livreur »
   * de /api/internal/sante les signalait comme abandonnees alors qu'un livreur
   * s'en etait saisi.
   *
   * ICI ET NON DANS N8N. La route derive deja `statut` ; elle derive donc aussi
   * l'heure, et la regle vaut pour tous les appelants — un workflow modifie ne
   * peut plus l'oublier. Corriger dans n8n aurait demande de recommencer a
   * chaque nouveau chemin.
   *
   * EN ECRITURE SEPAREE, ET CONDITIONNEE PAR `is(null)`. La mise a jour
   * principale reste intacte — aucune regression possible sur le chemin des
   * commandes reelles — et l'heure ne peut pas etre ecrasee : le moment ou un
   * livreur a pris la course n'est pas celui ou n8n a repete le statut.
   */
  const statut = maj.statut_livraison ?? '';
  const maintenant = new Date().toISOString();

  // Un statut present qui n'est pas une attente veut dire qu'un livreur s'en
  // est saisi. Le test est NEGATIF a dessein : le vocabulaire de cette colonne
  // n'est tenu par aucune contrainte — on y trouve « livre », « livree »,
  // « livrée », « accepte », « parti », « en route ». Enumerer les valeurs
  // positives, c'est rater la prochaine en silence.
  const prisEnCharge = Boolean(maj.nom_livreur) || (statut !== '' && !/^en[ _-]?attente$/i.test(statut));

  const poses: string[] = [];

  /**
   * Pose une heure si, et seulement si, elle manque encore.
   *
   * Les deux appels sont ecrits en toutes lettres plutot que boucles sur un
   * objet : une cle calculee elargit le type de `update()` a n'importe quelle
   * colonne, et le compilateur cesse alors de proteger contre une faute de
   * frappe — exactement ce que le `Pick` en tete de fichier cherche a eviter.
   */
  const poser = async (
    champ: 'heure_prise_en_charge' | 'heure_livraison',
    maj: MajCommande,
  ): Promise<void> => {
    const { data: touchees, error: errHorodatage } = await sb
      .from('commandes')
      .update(maj)
      .ilike('reference', motifExact(reference))
      .eq('boutique_id', marchand.boutiqueId)
      .is(champ, null)
      .select('id');

    // Un horodatage manque n'annule pas une livraison enregistree : la mise a
    // jour principale a deja abouti. On le journalise et on le dit dans la
    // reponse, sans faire echouer l'appelant.
    if (errHorodatage) {
      console.error(`Livraison — ${champ} non pose (${reference}) :`, errHorodatage.message);
    } else if (touchees?.length) {
      poses.push(champ);
    }
  };

  if (prisEnCharge && !maj.heure_prise_en_charge) {
    await poser('heure_prise_en_charge', { heure_prise_en_charge: maintenant });
  }
  if (/^livr/i.test(statut) && !maj.heure_livraison) {
    await poser('heure_livraison', { heure_livraison: maintenant });
  }

  // Zero ligne touchee n'est pas une panne : la commande peut n'exister que
  // dans la feuille. On le dit sans faire echouer l'appelant.
  return NextResponse.json({
    ok: true,
    reference,
    lignes: data?.length ?? 0,
    maj,
    // Vide quand l'heure existait deja : l'appel est idempotent.
    horodatages_poses: poses,
    // Dit s'il a ete possible de rattacher cette course a une fiche de
    // l'annuaire. `false` avec un `livreur_telegram_id` fourni veut dire que ce
    // livreur n'est dans l'annuaire d'aucune fiche de cette boutique.
    livreur_attribue: livreurAttribue,
  });
}
