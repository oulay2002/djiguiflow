import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { referenceRecevable } from '@/lib/reference';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Marquer qu'un client a bien ete prevenu de l'acceptation de sa commande.
 *
 * POURQUOI UNE ROUTE SEPAREE, ET PAS UNE LIGNE DANS `envoyerMessage`.
 *
 * Le chemin d'envoi est le seul endroit du produit ou une erreur coute la
 * confiance d'un client plutot qu'une ligne de journal : un reessai autour d'un
 * envoi le duplique, et un client a deja recu trois fois le meme message. On
 * n'ajoute donc RIEN a ce chemin. Le marquage arrive apres, par un appel
 * distinct, et son echec ne peut pas declencher un second envoi.
 *
 * Accessoirement, `envoyerMessage` ne saurait pas quoi marquer : le corps que
 * n8n lui transmet porte la boutique, le canal, le destinataire et le message —
 * jamais la reference de la commande.
 *
 * CE QU'ELLE AFFIRME. « La chaine a rendu un verdict positif sur l'envoi », pas
 * « le message est arrive » — personne ne peut affirmer le second.
 *
 * ELLE EST IDEMPOTENTE. `is('client_prevenu_le', null)` : rappelee deux fois,
 * elle garde la premiere heure. Le moment ou l'on a prevenu le client n'est pas
 * le moment ou n8n a reessaye de le dire.
 */

type Corps = { reference?: unknown; boutique?: unknown; slug?: unknown; boutique_id?: unknown };

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  const corps = (await req.json().catch(() => null)) as Corps | null;
  const reference = String(corps?.reference ?? '').trim();
  if (!reference) {
    return Response.json({ error: 'reference manquante' }, { status: 400 });
  }

  // Meme liste blanche que les routes publiques. Voir `@/lib/reference`.
  if (!referenceRecevable(reference)) {
    return Response.json({ error: 'reference invalide' }, { status: 400 });
  }

  // ELLE ECRIT, ET `reference` EST UNE CLE GLOBALE. Sans le filtre de boutique
  // ci-dessous, un appel portant la reference d'un autre marchand marquait SA
  // commande comme « client prevenu » — alors que personne ne l'avait
  // prevenu. Le degat n'est pas une fuite mais un mensonge durable : le
  // marchand voit un client rassure qui ne l'est pas, et la veille cesse de
  // signaler `client_non_prevenu` pour cette commande. Un filet qu'on
  // desarme a distance.
  const boutiqueRef = String(corps?.boutique ?? corps?.slug ?? corps?.boutique_id ?? '').trim();
  if (!boutiqueRef) return Response.json({ error: 'boutique requise' }, { status: 400 });

  const marchand = await resoudreMarchand(boutiqueRef);
  if (!marchand) return Response.json({ error: 'Boutique introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .update({ client_prevenu_le: new Date().toISOString() })
    .eq('reference', reference)
    .eq('boutique_id', marchand.boutiqueId)
    .is('client_prevenu_le', null)
    .select('reference, client_prevenu_le');

  if (error) {
    console.error(`Prevenu ${reference} — marquage impossible :`, error.message);
    return Response.json({ ok: false, erreur: error.message }, { status: 503 });
  }

  // Zero ligne touchee n'est pas une panne : soit la commande etait deja
  // marquee — l'appel est idempotent —, soit la reference n'existe pas. On le
  // DIT plutot que de rendre un succes indistinct, parce qu'une reference
  // inconnue qui reviendrait souvent signalerait un appariement casse.
  return Response.json({
    ok: true,
    reference,
    marquee: (data?.length ?? 0) > 0,
  });
}
