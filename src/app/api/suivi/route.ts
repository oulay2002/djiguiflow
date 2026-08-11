import { resoudreMarchand, resoudreMarchandParRef } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type LigneItem = { nom_produit: string | null; quantite: number | null; prix_unitaire: number | null };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get('ref') || '').trim().toUpperCase();
  if (!ref) return Response.json({ error: 'Référence requise' }, { status: 400 });

  // 🔑 STRATÉGIE INTELLIGENTE :
  // 1. Si boutique_id fourni → utiliser resoudreMarchand (comportement actuel)
  // 2. Sinon → déduire depuis le préfixe de la référence (multi-marchands)
  const boutiqueIdParam = searchParams.get('boutique_id');
  const m = boutiqueIdParam
    ? await resoudreMarchand(boutiqueIdParam)
    : await resoudreMarchandParRef(ref);

  if (!m) return Response.json({ error: 'Marchand introuvable pour cette référence' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Suivi temporairement indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select(
      'reference, client_nom, client_adresse, total, created_at, nom_livreur, statut_livraison,' +
        ' heure_prise_en_charge, heure_livraison, commande_items(nom_produit, quantite, prix_unitaire)',
    )
    .eq('boutique_id', m.id)
    .ilike('reference', ref)
    .maybeSingle();

  if (error) {
    console.error(`Suivi — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Suivi temporairement indisponible' }, { status: 503 });
  }
  if (!data) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

  const c = data as unknown as {
    reference: string; client_nom: string | null; client_adresse: string | null;
    total: number | null; created_at: string | null; nom_livreur: string | null;
    statut_livraison: string | null; heure_prise_en_charge: string | null;
    heure_livraison: string | null; commande_items: LigneItem[] | null;
  };

  return Response.json({
    boutique_id: m.id,
    nom_boutique: m.nom, // ✅ ajouté
    order_id: c.reference,
    customer_name: c.client_nom ?? '',
    address: c.client_adresse ?? '',
    total_price: String(c.total ?? 0),
    items: (c.commande_items ?? []).map(i => ({ // ✅ plus stringifié
      plat: i.nom_produit ?? '',
      quantité: i.quantite ?? 1,
      prix_unitaire: i.prix_unitaire ?? 0,
    })),
    timestamp: c.created_at ?? '',
    nom_livreur: c.nom_livreur ?? '',
    statut_livraison: c.statut_livraison ?? '',
    heure_prise_en_charge: c.heure_prise_en_charge ?? '',
    heure_livraison: c.heure_livraison ?? '',
  });
}