import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { referenceRecevable } from '@/lib/reference';

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
 * LA PREMIERE NOTE FAIT FOI, PASSE UNE HEURE.
 *
 * Les boutons de notation restent cliquables indefiniment dans l'historique
 * Telegram du client — le workflow qui les emet le documente lui-meme. Rien
 * n'empechait donc de rejouer un vieux bouton et de reecrire une note des mois
 * apres : un 5/5 devenait un 1/5, ou l'inverse, sans trace et sans que le
 * gerant l'apprenne. Le contraire d'un avis.
 *
 * L'inverse — figer des le premier clic — punissait la faute de frappe : un
 * client visant 5 et touchant 4 restait avec 4. Une heure de battement
 * rattrape le doigt qui glisse sans rouvrir la porte.
 *
 * La garde est portee par la mise a jour ELLE-MEME, et non par une lecture
 * prealable : une lecture suivie d'une ecriture laisserait passer deux clics
 * simultanes. Une seule instruction, donc un seul verrou.
 *
 * Les commandes notees avant l'ajout de `note_heure` ont un instant inconnu :
 * la condition de fenetre est alors fausse et leur note reste definitive. Leur
 * inventer un horodatage rouvrirait une correction sur des avis anciens.
 */
const FENETRE_CORRECTION_MS = 60 * 60 * 1000;
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

  // Meme liste blanche que les routes publiques : une reference doit avoir la
  // forme d'une reference avant d'atteindre la base. Voir `@/lib/reference`.
  if (!referenceRecevable(reference)) {
    return NextResponse.json({ error: 'reference invalide' }, { status: 400 });
  }
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return NextResponse.json({ error: 'note attendue entre 1 et 5' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const maintenant = new Date();
  const limite = new Date(maintenant.getTime() - FENETRE_CORRECTION_MS).toISOString();

  // La garde : pas encore notee, OU notee il y a moins d'une heure. Le filtre
  // est evalue par la base au moment de l'ecriture, donc deux clics simultanes
  // ne peuvent pas se doubler.
  const { data, error } = await sb
    .from('commandes')
    .update({ note_client: note, note_heure: maintenant.toISOString() })
    .eq('reference', reference)
    .or(`note_client.is.null,note_heure.gte.${limite}`)
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
    .select('note_client, note_heure')
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

  // Notee il y a plus d'une heure : la fenetre de correction est passee. Un
  // vieux bouton rejoue ne reecrit rien, et on le dit plutot que de laisser
  // l'appelant croire son envoi pris en compte.
  const ligne = existantes[0];
  console.log(
    `Note client — ${reference} deja notee ${ligne.note_client}/5`
    + ` (${ligne.note_heure ?? 'instant inconnu'}), rejeu a ${note}/5 hors fenetre, ignore.`,
  );
  return NextResponse.json({
    ok: true,
    reference,
    lignes: 0,
    etat: 'fenetre_close',
    note_existante: ligne.note_client,
    note_heure: ligne.note_heure ?? null,
  });
}
