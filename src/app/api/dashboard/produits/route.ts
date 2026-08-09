import { readHeaders, appendRow } from '@/lib/googleSheets';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Menu temporairement indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('produits')
    .select('reference, id, nom, categorie, prix, description, disponible, photo_url, stock, stock_initial, seuil_alerte, menu_du_jour')
    .eq('boutique_id', m.boutiqueId)
    .order('nom', { ascending: true });

  if (error) {
    console.error(`Produits — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Menu temporairement indisponible' }, { status: 503 });
  }

  const produits = (data ?? []).map(p => ({
    id: String(p.reference ?? p.id),
    nom: String(p.nom ?? ''),
    categorie: String(p.categorie ?? 'Divers'),
    prix: Number(p.prix ?? 0),
    description: String(p.description ?? ''),
    disponible: p.disponible !== false,
    image: String(p.photo_url ?? ''),
    stock: p.stock ?? null,
    stock_initial: p.stock_initial ?? null,
    seuil_alerte: p.seuil_alerte ?? null,
    menu_du_jour: p.menu_du_jour === true,
  }));

  return Response.json({ boutique_id: m.id, produits });
}

export async function POST(req: Request) {
  const { nom, categorie, prix, description, disponible, image, stock, seuil_alerte } = await req.json();
  if (!nom) return Response.json({ error: 'Nom requis' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const reference = `P${Date.now()}`;
  const stockNum = stock === null || stock === undefined || stock === '' ? null : Number(stock);
  const seuilNum = seuil_alerte === null || seuil_alerte === undefined || seuil_alerte === '' ? null : Number(seuil_alerte);

  // ---- 1. Supabase fait foi.
  // La vitrine (route menu) et le tableau de bord (GET ci-dessus) lisent tous
  // deux `produits` : un plat ecrit seulement dans la feuille n'existe pour
  // personne. L'ordre etait inverse jusqu'ici — la feuille bloquait
  // l'enregistrement, et l'echec de la copie Supabase n'etait que journalise.
  const sb = getSupabaseAdmin();
  if (!sb) {
    return Response.json({ error: 'Enregistrement impossible, reessayez' }, { status: 503 });
  }

  const { error: errSupabase } = await sb.from('produits').upsert(
    {
      boutique_id: m.boutiqueId,
      reference,
      nom: String(nom),
      categorie: String(categorie || 'Divers'),
      prix: Number(prix) || 0,
      description: String(description || ''),
      disponible: Boolean(disponible),
      photo_url: String(image || '') || null,
      stock: stockNum,
      stock_initial: stockNum,
      seuil_alerte: seuilNum,
    },
    { onConflict: 'boutique_id,reference' },
  );

  if (errSupabase) {
    console.error(`Produits — enregistrement Supabase refuse (${m.id}) :`, errSupabase);
    return Response.json({ error: 'Enregistrement impossible, reessayez' }, { status: 503 });
  }

  // ---- 2. Miroir feuille, jamais bloquant.
  try {
    const payload: Record<string, string> = {
      id: reference,
      nom: String(nom),
      categorie: String(categorie || 'Divers'),
      prix: String(prix ?? ''),
      description: String(description || ''),
      disponible: disponible ? 'TRUE' : 'FALSE',
      image: String(image || ''),
      stock: stockNum === null ? '' : String(stockNum),
      stock_initial: stockNum === null ? '' : String(stockNum),
      seuil_alerte: seuilNum === null ? '' : String(seuilNum),
    };
    const headers = await readHeaders(`${m.sheetMenu}!A1:Z1`, m.sheetId);
    await appendRow(`${m.sheetMenu}!A:Z`, headers.map(h => payload[h] ?? ''), m.sheetId);
  } catch (e) {
    // Le produit est en base : le marchand le voit, la vitrine le vend.
    console.error(`Produits — miroir ${m.sheetMenu} impossible (${m.id}) :`, e);
  }

  return Response.json({ ok: true, boutique_id: m.id, reference });
}

/** Mise a jour stock / seuil / disponibilite d'un produit existant. */
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const { reference, stock, seuil_alerte, disponible } = await req.json();
  if (!reference) return Response.json({ error: 'Reference requise' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Menu temporairement indisponible' }, { status: 503 });

  // Construction de l'objet de mise à jour avec typage explicite
  const patch: {
    stock?: number | null;
    seuil_alerte?: number | null;
    disponible?: boolean;
  } = {};

  if (stock !== undefined) patch.stock = stock === null || stock === '' ? null : Number(stock);
  if (seuil_alerte !== undefined) patch.seuil_alerte = seuil_alerte === null || seuil_alerte === '' ? null : Number(seuil_alerte);
  if (disponible !== undefined) patch.disponible = Boolean(disponible);

  const { error } = await sb
    .from('produits')
    .update(patch)
    .eq('boutique_id', m.boutiqueId)
    .eq('reference', String(reference));

  if (error) {
    console.error(`Produits — mise a jour impossible (${m.id}) :`, error);
    return Response.json({ error: 'Mise a jour impossible' }, { status: 503 });
  }

  return Response.json({ ok: true });
}