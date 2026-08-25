import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { filtreAppariementChat } from '@/lib/appariementChat';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Les commandes d'un client, pour l'assistante.
 *
 * ELLE SERT DEUX OUTILS D'UN COUP, parce qu'ils posaient la meme question a la
 * meme feuille :
 *
 *   « suivre_commande »               — ou en est ma commande ?
 *   « Consulter historique commandes » — qu'a-t-il deja commande, et a quelle
 *                                        adresse ?
 *
 * Deux routes auraient duplique la meme lecture et le meme cloisonnement. Le
 * filtre `valides_seulement` suffit a les distinguer.
 *
 * ELLE REND LES NOMS DE LA FEUILLE — `order_id`, `customer_name`,
 * `statut_livraison` — pour que les descriptions d'outils, que le modele lit
 * pour savoir quoi faire du resultat, restent vraies sans etre reecrites.
 */

/** Un historique sert a reconnaitre une habitude, pas a remonter le temps. */
const COMMANDES_MAX = 10;

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

  /**
   * UNE REPONSE VIDE FAIT BOUCLER L'ASSISTANTE. Constate en production.
   *
   * Le 25 aout 2026 a 11h02, un client ecrit a une boutique. Cet outil rend
   * `[]`, que n8n transmet au modele comme une chaine VIDE. Le modele ne peut
   * pas distinguer « ce client n'a jamais commande » — une reponse parfaitement
   * utile — de « ton appel a echoue ». Il conclut qu'il s'est trompe de
   * parametre, INVENTE un identifiant au hasard, rappelle l'outil… vingt-cinq
   * fois, jusqu'a `Max iterations`. La chaine s'arrete, et le client ne recoit
   * RIEN.
   *
   * C'est le motif du defaut silencieux dans sa forme la plus pure : UNE VALEUR
   * VIDE QUI PORTE UN SENS. Le vide ne dit pas ce qu'il veut dire, alors on le
   * dit en toutes lettres.
   *
   * ET ON DISTINGUE LES DEUX SILENCES. « Ce client n'a jamais commande » et
   * « je n'ai pas pu regarder » se ressemblaient tous deux a `[]`. Les
   * confondre ferait affirmer a l'assistante qu'un habitue est un inconnu — au
   * moment precis ou elle devait lui proposer de reprendre sa commande.
   */
  const repondre = (resume: string, commandes: unknown[] = []) =>
    Response.json({ resume, commandes, nombre: commandes.length });

  const chatId = String(corps.chat_id ?? corps.phone ?? corps.destinataire ?? '').trim();
  const boutiqueRef = String(corps.boutique ?? corps.slug ?? corps.boutique_id ?? '').trim();
  const validesSeulement = corps.valides_seulement === true
    || String(corps.valides_seulement ?? '') === '1';

  // Pas de client, pas d'historique — et surtout pas une erreur : l'assistante
  // interroge cet outil des le premier message, y compris pour un inconnu.
  if (!chatId) {
    return repondre(
      'Client non identifie, aucun historique consultable. Poursuivez normalement,'
      + ' et ne dites pas au client qu il n a jamais commande.',
    );
  }
  if (!boutiqueRef) return Response.json({ error: 'boutique requise' }, { status: 400 });

  const marchand = await resoudreMarchand(boutiqueRef);
  if (!marchand) return Response.json({ error: 'Boutique introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  let requete = sb
    .from('commandes')
    .select('id, reference, client_nom, client_telephone, client_adresse, instructions, total, statut, statut_livraison, nom_livreur, position_livreur, heure_prise_en_charge, heure_livraison, created_at')
    // LE CLOISONNEMENT EST ICI, ET IL N'EST PAS NEGOCIABLE. Un meme numero
    // peut ecrire a deux boutiques : sans ce filtre, l'assistante de l'une
    // lirait l'historique de l'autre.
    .eq('boutique_id', marchand.boutiqueId)
    // Egalite stricte OU cle des 8 derniers chiffres : un meme client a
    // porte jusqu'a TROIS chat_id chez la meme boutique. Voir
    // appariementChat.ts — la regle y vit seule, pour ne pas diverger.
    .or(filtreAppariementChat(chatId));

  if (validesSeulement) {
    // « Deja validee » du temps de la feuille : tout ce qui n'est plus un
    // panier en cours de collecte, ni une commande abandonnee.
    requete = requete.not('statut', 'in', '("panier","abandonnee")');
  }

  const { data, error } = await requete
    .order('created_at', { ascending: false })
    .limit(COMMANDES_MAX);

  if (error) {
    console.error(`Commandes client — lecture impossible (${marchand.id}) :`, error.message);
    return repondre(
      'Historique indisponible pour le moment. N affirmez PAS au client qu il n a'
      + ' jamais commande, et ne rappelez pas cet outil : poursuivez la conversation.',
    );
  }

  const lignes = data ?? [];
  if (!lignes.length) {
    return repondre(
      'Aucune commande precedente pour ce client. C est un nouveau client :'
      + ' presentez-lui ce que la boutique propose. Ne rappelez pas cet outil.',
    );
  }

  // Les articles de toutes les commandes en une seule lecture : dix requetes
  // separees pour dix commandes rendraient l'assistante lente a chaque message.
  const { data: articles } = await sb
    .from('commande_items')
    .select('commande_id, nom_produit, quantite, prix_unitaire')
    .in('commande_id', lignes.map((c) => c.id));

  const parCommande = new Map<string, { nom: string; quantite: number; prix: number }[]>();
  for (const a of articles ?? []) {
    const liste = parCommande.get(a.commande_id) ?? [];
    liste.push({
      nom: String(a.nom_produit ?? ''),
      quantite: Number(a.quantite ?? 0),
      prix: Number(a.prix_unitaire ?? 0),
    });
    parCommande.set(a.commande_id, liste);
  }

  return repondre(
    `${lignes.length} commande(s) precedente(s) pour ce client.`,
    lignes.map((c) => ({
      order_id: c.reference ?? '',
      customer_name: c.client_nom ?? '',
      phone: c.client_telephone ?? '',
      address: c.client_adresse ?? '',
      instructions: c.instructions ?? '',
      total_price: Number(c.total ?? 0),
      status: c.statut ?? '',
      statut_livraison: c.statut_livraison ?? '',
      nom_livreur: c.nom_livreur ?? '',
      position_livreur: c.position_livreur ?? '',
      heure_prise_en_charge: c.heure_prise_en_charge ?? '',
      heure_livraison: c.heure_livraison ?? '',
      timestamp: c.created_at ?? '',
      items: JSON.stringify(parCommande.get(c.id) ?? []),
    })),
  );
}
