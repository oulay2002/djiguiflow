import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Note client d'une commande, ecrite dans Supabase.
 *
 * Remplace le noeud Postgres qui portait cette ecriture dans n8n. Il visait
 * l'hote direct de Supabase, qui ne resout qu'en IPv6 : n8n Cloud n'ayant pas
 * d'IPv6 sortant, chaque appel echouait en ENETUNREACH — sans bruit, le noeud
 * etant en `continueRegularOutput`. La double ecriture n'a donc jamais eu lieu.
 *
 * Passer par ici evite le probleme et aligne ce flux sur tous les autres :
 * n8n demande, le serveur ecrit.
 *
 * LA PREMIERE NOTE FAIT FOI.
 *
 * Les boutons de notation restent cliquables indefiniment dans l'historique
 * Telegram du client — le workflow qui les emet le documente lui-meme. Rien
 * n'empechait donc de rejouer un vieux bouton et de reecrire une note des mois
 * apres : un 5/5 devenait un 1/5, ou l'inverse, sans trace et sans que le
 * gerant l'apprenne. Le contraire d'un avis.
 *
 * La garde est portee par le `.is('note_client', null)` de la mise a jour, et
 * non par une lecture prealable : une lecture suivie d'une ecriture laisserait
 * passer deux clics simultanes. Une seule instruction, donc un seul verrou.
 *
 * Ce choix rend la note DEFINITIVE, y compris pour une faute de frappe du
 * client. C'est assume : l'avis appartient au moment ou il est donne. Pour
 * autoriser une correction breve, il suffirait de remplacer la condition par
 * une fenetre de temps sur la date de notation.
 */
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
  const note = Number(corps.note);

  if (!reference) {
    return NextResponse.json({ error: 'reference requise' }, { status: 400 });
  }
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return NextResponse.json({ error: 'note attendue entre 1 et 5' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  // `.is('note_client', null)` est la garde : seule une commande pas encore
  // notee est touchee. Deux clics simultanes ne peuvent donc pas se doubler,
  // le filtre etant evalue par la base au moment de l'ecriture.
  const { data, error } = await sb
    .from('commandes')
    .update({ note_client: note })
    .eq('reference', reference)
    .is('note_client', null)
    .select('id');

  if (error) {
    console.error(`Note client — ecriture impossible (${reference}) :`, error.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  if (data && data.length > 0) {
    return NextResponse.json({ ok: true, reference, lignes: data.length, etat: 'enregistree' });
  }

  // Zero ligne touchee recouvre desormais DEUX cas, et les confondre ferait
  // chercher une panne la ou il n'y en a pas. On paie une seconde lecture,
  // mais seulement sur ce chemin-la.
  const { data: existantes, error: erreurLecture } = await sb
    .from('commandes')
    .select('note_client')
    .eq('reference', reference)
    .limit(1);

  if (erreurLecture) {
    console.error(`Note client — relecture impossible (${reference}) :`, erreurLecture.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  // La commande n'existe pas ici : elle peut ne vivre que dans la feuille du
  // marchand. Ce n'est pas une panne, et l'appelant ne doit pas echouer.
  if (!existantes || existantes.length === 0) {
    return NextResponse.json({ ok: true, reference, lignes: 0, etat: 'commande_inconnue' });
  }

  // Deja notee : un bouton rejoue. On le dit, on n'ecrase pas.
  console.log(
    `Note client — ${reference} deja notee ${existantes[0].note_client}/5, rejeu a ${note}/5 ignore.`,
  );
  return NextResponse.json({
    ok: true,
    reference,
    lignes: 0,
    etat: 'deja_notee',
    note_existante: existantes[0].note_client,
  });
}
