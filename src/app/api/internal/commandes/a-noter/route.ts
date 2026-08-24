import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { filtreAppariementChat } from '@/lib/appariementChat';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Les commandes de ce client qu'il pourrait etre en train de noter.
 *
 * POURQUOI ELLE EXISTE. Sur WhatsApp il n'y a pas de boutons : le client tape
 * « 3 ». Rien ne distingue cette note d'un client qui commande trois beignets,
 * sinon le CONTEXTE — a-t-il ete livre recemment ? Le routeur cherchait ce
 * contexte dans l'onglet Google Sheets du marchand ; depuis que la prise de
 * commande n'y ecrit plus, il ne trouvait rien et la note partait chez
 * l'assistante, qui repondait « votre commande est deja validee ».
 * Constate le 21 aout 2026.
 *
 * ELLE REND LES NOMS DE LA FEUILLE — `order_id`, `heure_livraison`,
 * `statut_livraison` — pour que l'aiguilleur, qui porte deja toute la regle de
 * fenetre et de format, n'ait pas une ligne a changer.
 */

/** Au-dela, un chiffre seul n'est plus une note : c'est une quantite. */
const HEURES_DE_FRAICHEUR = 48;

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

  const chatId = String(corps.chat_id ?? corps.phone ?? corps.destinataire ?? '').trim();
  const boutiqueRef = String(corps.boutique ?? corps.slug ?? corps.boutique_id ?? '').trim();

  if (!chatId) return Response.json([]);
  if (!boutiqueRef) return Response.json({ error: 'boutique requise' }, { status: 400 });

  const marchand = await resoudreMarchand(boutiqueRef);
  if (!marchand) return Response.json({ error: 'Boutique introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const depuis = new Date(Date.now() - HEURES_DE_FRAICHEUR * 3_600_000).toISOString();

  // On ne rend que ce qui peut etre note : livre, recemment, et PAS DEJA NOTE.
  // Sans ce dernier filtre, un client qui tape un chiffre des jours plus tard
  // ecraserait sa propre note precedente.
  const { data, error } = await sb
    .from('commandes')
    .select('reference, statut_livraison, heure_livraison, note_client, created_at')
    .eq('boutique_id', marchand.boutiqueId)
    // Egalite stricte OU cle des 8 derniers chiffres : un meme client a
    // porte jusqu'a TROIS chat_id chez la meme boutique. Voir
    // appariementChat.ts — la regle y vit seule, pour ne pas diverger.
    .or(filtreAppariementChat(chatId))
    .is('note_client', null)
    .gt('created_at', depuis)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(`Commandes a noter — lecture impossible (${marchand.id}) :`, error.message);
    return Response.json([]);
  }

  // Un tableau, comme le rendait la lecture de la feuille : l'aiguilleur
  // applique ensuite SA regle de fenetre, qu'on ne duplique pas ici.
  return Response.json(
    (data ?? []).map((c) => ({
      order_id: c.reference ?? '',
      statut_livraison: c.statut_livraison ?? '',
      heure_livraison: c.heure_livraison ?? '',
    })),
  );
}
