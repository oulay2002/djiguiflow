import { readHeaders, appendRow } from '@/lib/googleSheets';
import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Menu temporairement indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('produits')
    .select('reference, id, nom, categorie, prix, description, disponible, photo_url, stock_initial, seuil_alerte, menu_du_jour')
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
    stock_initial: p.stock_initial ?? null,
    seuil_alerte: p.seuil_alerte ?? null,
    menu_du_jour: p.menu_du_jour === true,
  }));

  return Response.json({ boutique_id: m.id, produits });
}

export async function POST(req: Request) {
  const { nom, categorie, prix, description, disponible, image, boutique_id } = await req.json();
  if (!nom) return Response.json({ error: 'Nom requis' }, { status: 400 });

  const m = await resoudreMarchand(boutique_id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const reference = `P${Date.now()}`;

  // Double ecriture : Google Sheets reste la source de verite tant que n8n
  // n'ecrit pas dans Supabase. L'echec de la feuille est donc bloquant,
  // celui de Supabase ne l'est pas.
  try {
    const payload: Record<string, string> = {
      id: reference,
      nom: String(nom),
      categorie: String(categorie || 'Divers'),
      prix: String(prix ?? ''),
      description: String(description || ''),
      // TRUE/FALSE et pas oui/non : convention lue par la page boutique et
      // par les workflows n8n (Alerte Stock, Cerveau Zahara).
      disponible: disponible ? 'TRUE' : 'FALSE',
      image: String(image || ''),
    };
    const headers = await readHeaders(`${m.sheetMenu}!A1:Z1`, m.sheetId);
    await appendRow(`${m.sheetMenu}!A:Z`, headers.map(h => payload[h] ?? ''), m.sheetId);
  } catch (e) {
    console.error(`Produits — écriture Sheets impossible (${m.id}) :`, e);
    return Response.json({ error: 'Enregistrement impossible, réessayez' }, { status: 503 });
  }

  const sb = getSupabaseAdmin();
  if (sb) {
    const { error } = await sb.from('produits').upsert(
      {
        boutique_id: m.boutiqueId,
        reference,
        nom: String(nom),
        categorie: String(categorie || 'Divers'),
        prix: Number(prix) || 0,
        description: String(description || ''),
        disponible: Boolean(disponible),
        photo_url: String(image || '') || null,
      },
      { onConflict: 'boutique_id,reference' },
    );
    // Non bloquant : la feuille fait foi, la copie Supabase peut etre rejouee.
    if (error) console.error(`Produits — copie Supabase echouee (${m.id}) :`, error);
  }

  return Response.json({ ok: true, boutique_id: m.id });
}
