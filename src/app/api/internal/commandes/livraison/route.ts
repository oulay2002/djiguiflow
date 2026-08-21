import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/lib/database.types';

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
 * Neutralise les jokers d'un motif LIKE.
 *
 * `ilike` interprete % et _ : une reference valant « % » mettrait a jour
 * TOUTES les commandes de la plateforme, livrees comprises. La reference
 * arrive d'une feuille que l'agent remplit — elle n'est pas de confiance.
 */
function motifExact(valeur: string): string {
  return valeur.replace(/[\\%_]/g, (c) => `\\${c}`);
}

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
   * Une livraison terminee cloture aussi la commande.
   *
   * `rapport_retards` et `rapport_activite` raisonnent sur `statut`, jamais sur
   * `statut_livraison` : sans cette ligne, une commande livree reste « en
   * attente » pour la base — elle figure indefiniment dans l'alerte retard du
   * gerant, et n'est jamais comptee parmi les livrees du jour.
   *
   * Le test est volontairement large : selon la source, la valeur s'ecrit
   * « livre », « livree » ou « livrée ». Une comparaison stricte laisserait la
   * commande ouverte sans que rien ne le signale, derriere un 200 ok.
   */
  if (/^livr/i.test(maj.statut_livraison ?? '')) {
    maj.statut = 'livree';
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .update(maj)
    .ilike('reference', motifExact(reference))
    .select('id');

  if (error) {
    console.error(`Livraison — ecriture impossible (${reference}) :`, error.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
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
  });
}
