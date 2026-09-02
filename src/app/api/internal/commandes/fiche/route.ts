import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Une commande, par sa reference — pour les workflows de livraison.
 *
 * POURQUOI ELLE EXISTE. « Acceptation Livraison » retrouvait la commande dans
 * l'onglet Google Sheets du marchand. Des que la prise de commande a cesse
 * d'ecrire dans cet onglet, la recherche est revenue vide : le livreur
 * appuyait sur « J'accepte » et PLUS RIEN ne se passait — ni itineraire, ni
 * frais, ni notification au client. Constate le 21 aout 2026, au premier essai
 * reel du decouplage.
 *
 * ELLE REND LES NOMS DE LA FEUILLE, PAS CEUX DE LA BASE. `order_id` et non
 * `reference`, `customer_name` et non `client_nom`. Ce n'est pas de la
 * negligence : une quinzaine d'expressions n8n lisent ces noms-la. Les traduire
 * ici, en un seul endroit, evite de reecrire — et de casser — quinze
 * expressions dans cinq workflows.
 */
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

  const reference = String(corps.order_id ?? corps.reference ?? '').trim();
  if (!reference) return Response.json({ error: 'order_id requis' }, { status: 400 });

  // LA BOUTIQUE EST EXIGEE, ET C'EST TOUT L'OBJET DE CE BLOC.
  //
  // Cette route lit par `reference`, qui est une cle GLOBALE : elle ne dit pas
  // a qui la commande appartient. Sans le filtre ci-dessous, un appel portant
  // la reference d'un autre marchand rendait son client — nom, telephone,
  // adresse, point GPS, chat_id — et surtout son `jeton_suivi`, c'est-a-dire
  // la cle qui permet de CONFIRMER OU D'ANNULER sa commande. Une seule route
  // faisait donc oracle a jetons sur toute la plateforme.
  //
  // Le secret partage ne suffisait pas a l'en proteger : il dit que l'appelant
  // est n8n, il ne dit pas POUR QUEL MARCHAND n8n appelle. Or une seule
  // instance n8n sert tous les marchands, et le cloisonnement ne tenait qu'a
  // ce qu'aucun de ses workflows ne se trompe jamais de reference. Une
  // propriete de securite ne doit pas dependre d'une chaine qui ne se trompe
  // pas — voir `commandes/a-noter`, qui bornait deja, et dont ceci reprend
  // exactement l'idiome.
  //
  // Tous les appelants avaient DEJA le slug sous la main : « Acceptation
  // Livraison » le resout dans « Config marchand » des son entree. Il n'etait
  // simplement pas transmis.
  const boutiqueRef = String(corps.boutique ?? corps.slug ?? corps.boutique_id ?? '').trim();
  if (!boutiqueRef) return Response.json({ error: 'boutique requise' }, { status: 400 });

  const marchand = await resoudreMarchand(boutiqueRef);
  if (!marchand) return Response.json({ error: 'Boutique introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select('id, reference, jeton_suivi, client_nom, client_telephone, client_adresse, latitude, longitude, instructions, total, canal, chat_id, statut, statut_livraison, nom_livreur, frais_livraison, created_at')
    .eq('reference', reference)
    .eq('boutique_id', marchand.boutiqueId)
    .maybeSingle();

  if (error) {
    console.error(`Fiche commande — lecture impossible (${reference}) :`, error.message);
    return Response.json({ error: 'Lecture impossible' }, { status: 503 });
  }

  // Rien trouve : on rend un tableau vide, exactement comme le faisait la
  // lecture de la feuille. Les branches qui suivent savent deja ne rien faire
  // d'un resultat vide ; un 404 les ferait lever pour une commande simplement
  // inconnue.
  //
  // UNE REFERENCE APPARTENANT A UNE AUTRE BOUTIQUE ATTERRIT ICI, et c'est la
  // bonne reponse : « je ne connais pas cette commande » plutot que « elle
  // existe mais ailleurs ». La seconde apprendrait a qui cherche que la
  // reference est valide quelque part.
  if (!data) return Response.json([]);

  const { data: articles } = await sb
    .from('commande_items')
    .select('nom_produit, quantite, prix_unitaire')
    .eq('commande_id', data.id);

  return Response.json([
    {
      order_id: data.reference,
      // Le jeton qui rend le lien de suivi indevinable. n8n en a besoin pour
      // construire le lien qu'il envoie au client : une reference se devine,
      // et deviner permettait d'annuler la commande d'un inconnu.
      jeton_suivi: data.jeton_suivi ?? '',
      customer_name: data.client_nom ?? '',
      phone: data.client_telephone ?? '',
      address: data.client_adresse ?? '',
      // LE POINT, ET POURQUOI IL EST ICI.
      //
      // Le client peut donner sa position depuis la page de confirmation
      // depuis le 17 aout. Mesure du 24 aout : zero position capturee, et
      // surtout — meme capturee, elle n'allait NULLE PART. Cette route est
      // celle que lit « Acceptation Livraison » pour composer le message du
      // livreur, et elle ne rendait pas le point. Il mourait en base.
      //
      // NULL est rendu tel quel, jamais 0 : « on ne sait pas ou est la
      // porte » ne doit pas se confondre avec un point au large du golfe de
      // Guinee. C'est l'appelant qui decide quoi faire de l'absence.
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      instructions: data.instructions ?? '',
      total_price: Number(data.total ?? 0),
      canal: data.canal ?? '',
      chat_id: data.chat_id ?? '',
      status: data.statut ?? '',
      statut_livraison: data.statut_livraison ?? '',
      nom_livreur: data.nom_livreur ?? '',
      frais_livraison: data.frais_livraison ?? null,
      items: JSON.stringify(
        (articles ?? []).map((a) => ({
          plat: a.nom_produit,
          quantité: a.quantite,
          prix_unitaire: a.prix_unitaire,
        })),
      ),
    },
  ]);
}
