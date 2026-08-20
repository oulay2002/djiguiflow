import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Qui est le livreur qui vient d'accepter une course ?
 *
 * n8n ne connait du livreur que son identifiant Telegram, celui que porte le
 * clic sur « J'accepte ». Cette route rend le nom et le numero saisis par le
 * marchand dans son tableau de bord, pour que le client sache qui lui apporte
 * sa commande et puisse le joindre.
 *
 * ELLE NE DOIT JAMAIS FAIRE ECHOUER SON APPELANT. Un livreur non rattache est
 * un cas normal — il n'a pas encore ouvert son lien d'invitation — et le client
 * doit etre prevenu de son depart quoi qu'il arrive. La reponse dit donc
 * `trouve: false` avec un code 200, plutot que 404 : cote n8n, un 404 est une
 * erreur qui teint l'execution en rouge et masque les vraies pannes.
 *
 * Le `telegram_id` est cherche DANS la boutique appelante. Un identifiant
 * Telegram est mondial : sans ce cloisonnement, le livreur d'un marchand
 * serait annonce aux clients d'un autre.
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

  const slug = String(corps.boutique ?? '').trim();
  const telegramId = String(corps.telegram_id ?? '').trim();

  if (!slug || !telegramId) {
    return NextResponse.json({ error: 'boutique et telegram_id requis' }, { status: 400 });
  }

  const marchand = await resoudreMarchand(slug);
  if (!marchand) {
    return NextResponse.json({ error: 'Marchand introuvable' }, { status: 404 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('livreurs')
    .select('nom, telephone, vehicule_type, statut')
    .eq('boutique_id', marchand.boutiqueId)
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error) {
    console.error(`Livreurs — lecture impossible (${slug}/${telegramId}) :`, error.message);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 });
  }

  // ---- LE CLIENT NE DOIT JAMAIS RESTER SANS PERSONNE A APPELER.
  //
  // Un livreur non rattache est un cas NORMAL et frequent : il rejoint le
  // groupe Telegram du marchand sans jamais ouvrir son lien d'invitation, et
  // n'existe donc dans aucun annuaire. Le client recevait alors « Livreur :
  // Jean Paul » — un prenom, parfois orne d'emojis, et rien pour joindre qui
  // que ce soit si sa commande tarde.
  //
  // Le numero de la boutique est un repli legitime : il est deja public sur la
  // vitrine, et c'est le marchand qui repond de sa livraison.
  const telephoneBoutique = String(marchand.whatsapp ?? '').trim();

  if (!data) {
    return NextResponse.json({ ok: true, trouve: false, telephone_boutique: telephoneBoutique });
  }

  return NextResponse.json({
    ok: true,
    trouve: true,
    telephone_boutique: telephoneBoutique,
    nom: String(data.nom ?? ''),
    // Le numero est rendu tel que le marchand l'a saisi. Le reformater est le
    // meilleur moyen de casser un numero qui marchait.
    telephone: String(data.telephone ?? ''),
    vehicule: String(data.vehicule_type ?? ''),
    statut: String(data.statut ?? ''),
  });
}
