import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { secretWebhookN8n } from '@/lib/secretN8n';
import { DELAI_WEBHOOK, delai } from '@/lib/reseau';

export const dynamic = 'force-dynamic';

type LigneItem = { nom_produit: string | null; quantite: number | null; prix_unitaire: number | null };
type LigneCommande = {
  reference: string | null;
  client_nom: string | null;
  client_telephone: string | null;
  chat_id: string | null;
  client_adresse: string | null;
  total: number | null;
  /** Ce que le client règle au LIVREUR. Jamais compris dans `total`. */
  frais_livraison: number | null;
  created_at: string | null;
  canal: string | null;
  nom_livreur: string | null;
  statut_livraison: string | null;
  heure_prise_en_charge: string | null;
  heure_livraison: string | null;
  confirmation_statut: string | null;
  confirmation_heure: string | null;
  commande_items: LigneItem[] | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select(
      'reference, client_nom, client_telephone, chat_id, client_adresse, total, created_at, canal,' +
        ' frais_livraison,' +
        ' nom_livreur, statut_livraison, heure_prise_en_charge, heure_livraison,' +
        ' confirmation_statut, confirmation_heure,' +
        ' commande_items(nom_produit, quantite, prix_unitaire)',
    )
    .eq('boutique_id', m.boutiqueId)
    .neq('statut', 'panier')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Commandes — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Commandes temporairement indisponibles' }, { status: 503 });
  }

  const commandes = ((data ?? []) as unknown as LigneCommande[]).map(c => ({
    order_id: c.reference ?? '',
    customer_name: c.client_nom ?? '',
    phone: c.client_telephone || c.chat_id || '',
    address: c.client_adresse ?? '',
    items: JSON.stringify(
      (c.commande_items ?? []).map(i => ({
        plat: i.nom_produit ?? '',
        quantité: i.quantite ?? 1,
        prix_unitaire: i.prix_unitaire ?? 0,
      })),
    ),
    total_price: Number(c.total ?? 0),
    // NULL conserve : « pas encore annonce » ne se confond pas avec « offerte ».
    frais_livraison: c.frais_livraison === null || c.frais_livraison === undefined
      ? null
      : Number(c.frais_livraison),
    timestamp: c.created_at ?? '',
    canal: String(c.canal ?? '').toLowerCase(),
    nom_livreur: c.nom_livreur ?? '',
    statut_livraison: c.statut_livraison || 'en attente',
    heure_prise_en_charge: c.heure_prise_en_charge ?? '',
    heure_livraison: c.heure_livraison ?? '',
    confirmation_statut: c.confirmation_statut ?? null,
    confirmation_heure: c.confirmation_heure ?? null,
  }));

  return Response.json({ boutique_id: m.id, commandes });
}

/** Relance la demande de confirmation au client (rappelle n8n). */
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const { reference, action } = await req.json() as { reference?: string; action?: string };
  if (!reference || action !== 'relancer') {
    return Response.json({ error: 'Action invalide' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select('reference, client_telephone, chat_id, client_nom, total')
    .eq('boutique_id', m.boutiqueId)
    .eq('reference', reference)
    .maybeSingle();

  if (error || !data) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

  // Remet le statut à null (pour que le badge redevienne "à confirmer")
  //
  // SON ECHEC INTERDIT LA RELANCE. Sans ce controle, on redemandait une
  // confirmation au client pendant que la base portait encore l'ancienne
  // reponse — parfois `refusee`. Le client recevait alors « confirmez votre
  // commande » pour une commande qu'il venait d'annuler, et sa nouvelle reponse
  // se heurtait a un etat qui n'avait pas bouge.
  const { error: errRemise } = await sb
    .from('commandes')
    .update({ confirmation_statut: null, confirmation_heure: null })
    .eq('reference', reference);

  if (errRemise) {
    console.error(`Relance ${reference} — remise a zero impossible :`, errRemise.message);
    return Response.json({ error: 'Relance impossible, réessayez' }, { status: 503 });
  }

  const n8n = process.env.N8N_CONFIRMATION_URL;
  if (n8n) {
    try {
      await fetch(n8n, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Un seul secret pour tous les webhooks n8n, lu au coffre Supabase.
          // Voir `secretN8n.ts` pour la rotation.
          'x-djiguiflow-secret': await secretWebhookN8n(),
        },
        body: JSON.stringify({
          type: 'demande',
          reference,
          // UN CHAT_ID N'EST PAS UN NUMERO DE TELEPHONE.
          //
          // Le repli `|| data.chat_id` envoyait l'identifiant de conversation
          // Telegram dans le champ `phone`. En bout de chaine, la
          // synchronisation l'ecrivait comme numero du client : le marchand
          // lisait « 1724402569 » dans sa fiche et composait un numero qui
          // n'existe pas. Meme famille que le chat_id ecrase par le telephone,
          // dans l'autre sens.
          //
          // Vide vaut mieux que faux : la confirmation se transmet par le
          // canal, pas par ce champ.
          phone: data.client_telephone || '',
          nom: data.client_nom ?? 'Client',
          total: String(data.total ?? 0),
          boutique_id: m.boutiqueId,
        }),
      signal: delai(DELAI_WEBHOOK),
    });
    } catch (e) {
      console.error('Relance n8n impossible :', e);
      return Response.json({ error: 'Relance impossible' }, { status: 503 });
    }
  }

  return Response.json({ ok: true });
}