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

  const { data, error } = await sb
    .from('commandes')
    .update({ note_client: note })
    .eq('reference', reference)
    .select('id');

  if (error) {
    console.error(`Note client — ecriture impossible (${reference}) :`, error.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  // Zero ligne touchee n'est pas une panne : la commande peut n'exister que
  // dans la feuille. On le dit sans faire echouer l'appelant.
  return NextResponse.json({ ok: true, reference, lignes: data?.length ?? 0 });
}
