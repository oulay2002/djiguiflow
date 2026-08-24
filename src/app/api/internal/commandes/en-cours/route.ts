import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { filtreAppariementChat } from '@/lib/appariementChat';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * La commande courante d'un client, lue dans Supabase.
 *
 * POURQUOI CETTE ROUTE EXISTE. L'assistante ecrivait la commande dans un
 * onglet Google Sheets, puis la RELISAIT depuis ce meme onglet pour demander
 * confirmation au client. Tant que l'ecriture y restait, la lecture devait y
 * rester aussi : c'est ce couple qui obligeait chaque marchand a posseder un
 * classeur, et qui a rendu l'assistante muette chez le deuxieme inscrit.
 *
 * CE QU'ELLE REND, ET POURQUOI SI PEU. Une seule commande — la plus recente de
 * ce client dans cette boutique, et seulement si elle vient d'etre validee. La
 * relecture de la feuille filtrait deja ainsi (`chat_id` + `status = validee`) :
 * on ne dispatche que la commande QUI VIENT D'ETRE CONFIRMEE, jamais une autre
 * du meme client. Une commande validee mais jamais partie — il en traine —
 * repartait sinon chez les livreurs des que le client reecrivait au bot.
 *
 * LA BORNE DE TEMPS EST LA MEME QUE CELLE DE LA FEUILLE : douze heures. Elle
 * n'est pas decorative — c'est elle qui empeche une vieille commande de
 * ressusciter des semaines plus tard.
 */

/** Au-dela, la commande n'est plus « celle qu'on vient de confirmer ». */
const HEURES_DE_FRAICHEUR = 12;

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const chatId = String(corps.chat_id ?? corps.destinataire ?? '').trim();
  const boutiqueRef = String(corps.boutique ?? corps.slug ?? corps.boutique_id ?? '').trim();

  if (!chatId) return Response.json({ error: 'chat_id requis' }, { status: 400 });
  if (!boutiqueRef) return Response.json({ error: 'boutique requise' }, { status: 400 });

  const marchand = await resoudreMarchand(boutiqueRef);
  if (!marchand) return Response.json({ error: 'Boutique introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const depuis = new Date(Date.now() - HEURES_DE_FRAICHEUR * 3_600_000).toISOString();

  // LE CLIENT S'IDENTIFIE PAR SON `chat_id`, JAMAIS PAR SON TELEPHONE. Deux
  // clients peuvent donner le meme numero — une famille, un commerce — et le
  // telephone se saisit, donc se trompe. Le chat_id, lui, est l'identifiant de
  // la conversation d'ou vient le message.
  const { data, error } = await sb
    .from('commandes')
    .select('id, reference, jeton_suivi, client_nom, client_telephone, client_adresse, instructions, total, canal, chat_id, statut, created_at')
    .eq('boutique_id', marchand.boutiqueId)
    // Egalite stricte OU cle des 8 derniers chiffres : un meme client a
    // porte jusqu'a TROIS chat_id chez la meme boutique. Voir
    // appariementChat.ts — la regle y vit seule, pour ne pas diverger.
    .or(filtreAppariementChat(chatId))
    .eq('statut', 'en_attente')
    .gt('created_at', depuis)
    // PAS CELLES QUI SONT DEJA PARTIES. La relecture de la feuille ecartait
    // toute ligne portant un nom de livreur ou un statut de livraison : sans
    // cela, un client qui reecrit dans les douze heures relancerait une
    // demande de confirmation sur une commande deja en cours de livraison.
    .is('nom_livreur', null)
    .or('statut_livraison.is.null,statut_livraison.eq.,statut_livraison.eq.en attente')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(`Commande en cours — lecture impossible (${marchand.id}) :`, error.message);
    return Response.json({ error: 'Lecture impossible' }, { status: 503 });
  }

  const commande = data?.[0];

  // 200 avec `trouve: false` plutot qu'un 404 : n8n distingue mal un « rien a
  // faire » d'une panne, et un 404 ferait lever une branche qui n'a rien de
  // fautif. Le client n'a simplement pas de commande a confirmer.
  if (!commande) {
    return Response.json({ ok: true, trouve: false });
  }

  // Les articles, dans la forme que le message de confirmation attend.
  // L'`id` vient de la lecture ci-dessus : pas de second aller-retour pour
  // retrouver une ligne qu'on tient deja.
  const { data: articles } = await sb
    .from('commande_items')
    .select('nom_produit, quantite, prix_unitaire')
    .eq('commande_id', commande.id);

  return Response.json({
    ok: true,
    trouve: true,
    order_id: commande.reference,
    // Meme raison que dans `fiche` : sans lui, n8n ne peut construire qu'un
    // lien devinable.
    jeton_suivi: commande.jeton_suivi ?? '',
    customer_name: commande.client_nom ?? '',
    phone: commande.client_telephone ?? '',
    address: commande.client_adresse ?? '',
    instructions: commande.instructions ?? '',
    total_price: Number(commande.total ?? 0),
    canal: commande.canal ?? '',
    chat_id: commande.chat_id ?? '',
    items: JSON.stringify(
      (articles ?? []).map((a) => ({
        nom: a.nom_produit,
        quantite: a.quantite,
        prix: a.prix_unitaire,
      })),
    ),
  });
}
