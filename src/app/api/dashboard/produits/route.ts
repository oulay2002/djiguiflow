import { readSheet, readHeaders, appendRow } from '@/lib/googleSheets';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

// Valeurs héritées signifiant « indisponible ». Un filtre strict sur 'TRUE'
// masquait tous les produits saisis avant l'uniformisation.
const INDISPONIBLE = new Set(['non', 'no', 'false', '0', 'épuisé', 'epuise', '']);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  let rows: Record<string, string>[];
  try {
    rows = await readSheet(`${m.sheetMenu}!A:Z`, m.sheetId);
  } catch (e) {
    console.error(`Produits — lecture ${m.sheetMenu} impossible :`, e);
    return Response.json({ error: 'Menu temporairement indisponible' }, { status: 503 });
  }

  const produits = rows
    .filter(r => r.nom)
    .map(r => ({
      id: String(r.id || ''),
      nom: String(r.nom || ''),
      categorie: String(r.categorie || 'Divers'),
      prix: Number(String(r.prix ?? '').replace(/\D/g, '')) || 0,
      description: String(r.description || ''),
      disponible: !INDISPONIBLE.has(String(r.disponible ?? '').trim().toLowerCase()),
      image: String(r.image || ''),
    }));

  return Response.json({ boutique_id: m.id, produits });
}

export async function POST(req: Request) {
  const { nom, categorie, prix, description, disponible, image, boutique_id } = await req.json();
  if (!nom) return Response.json({ error: 'Nom requis' }, { status: 400 });

  const m = await resoudreMarchand(boutique_id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  const payload: Record<string, string> = {
    id: `P${Date.now()}`,
    nom: String(nom),
    categorie: String(categorie || 'Divers'),
    prix: String(prix ?? ''),
    description: String(description || ''),
    // TRUE/FALSE et pas oui/non : c'est la convention lue par la page
    // boutique et par les workflows n8n (Alerte Stock, Cerveau Zahara).
    // Avec « oui », le produit n'apparaissait jamais côté client.
    disponible: disponible ? 'TRUE' : 'FALSE',
    image: String(image || ''),
  };

  try {
    const headers = await readHeaders(`${m.sheetMenu}!A1:Z1`, m.sheetId);
    await appendRow(`${m.sheetMenu}!A:Z`, headers.map(h => payload[h] ?? ''), m.sheetId);
  } catch (e) {
    console.error(`Produits — écriture ${m.sheetMenu} impossible :`, e);
    return Response.json({ error: 'Enregistrement impossible, réessayez' }, { status: 503 });
  }

  return Response.json({ ok: true, boutique_id: m.id });
}
