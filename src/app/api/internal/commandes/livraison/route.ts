import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

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
type Champs = {
  statut_livraison?: string;
  nom_livreur?: string;
  position_livreur?: string;
  heure_prise_en_charge?: string;
  heure_livraison?: string;
};

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
  const maj: Champs = {};
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
    (maj as Record<string, string>).statut = 'livree';
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .update(maj as never)
    .ilike('reference', motifExact(reference))
    .select('id');

  if (error) {
    console.error(`Livraison — ecriture impossible (${reference}) :`, error.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  // Zero ligne touchee n'est pas une panne : la commande peut n'exister que
  // dans la feuille. On le dit sans faire echouer l'appelant.
  return NextResponse.json({ ok: true, reference, lignes: data?.length ?? 0, maj });
}
