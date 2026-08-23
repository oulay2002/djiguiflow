import { readHeaders, readSheet, appendRow, updateCells } from '@/lib/googleSheets';
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
  const { nom, categorie, prix, description, disponible, image, stock, seuil_alerte, groupe, couleur } = await req.json();
  if (!nom) return Response.json({ error: 'Nom requis' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  // LA REFERENCE NE DOIT PAS POUVOIR SE REPETER.
  //
  // Elle ne valait que l'horodatage a la milliseconde, et l'ecriture est un
  // `upsert` sur `(boutique_id, reference)` : deux articles crees dans la meme
  // milliseconde — ce que fait la saisie de plusieurs coloris d'un coup — se
  // seraient ECRASES l'un l'autre, sans erreur, le marchand ne voyant qu'un
  // seul de ses deux coloris apparaitre.
  const reference = `P${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
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
      // LA DECLINAISON. Deux articles de meme `groupe`, dans une meme boutique,
      // sont le meme article en plusieurs coloris : la vitrine n'en fait qu'une
      // carte. Vides, ils ne changent rien — l'article s'affiche seul.
      groupe: String(groupe ?? '').trim() || null,
      couleur: String(couleur ?? '').trim() || null,
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

/**
 * Mise a jour d'un produit existant : sa fiche autant que son stock.
 *
 * POURQUOI LA FICHE, ET PAS SEULEMENT LE STOCK. Le marchand pouvait creer un
 * produit et regler son stock, jamais corriger son nom, son prix ni sa photo.
 * Une faute de frappe etait donc definitive — et elle ne se contente pas
 * d'etre laide : le prix et la photo sont rattaches au produit PAR SON NOM
 * dans les rapports hebdomadaires, et les ventes d'un plat renomme se
 * retrouvent comptees en deux. Constate le 18 aout chez zahara, ou
 * « Soupe du Pêecheur » et « Soupe du Pêcheur » vivaient cote a cote.
 *
 * Chaque champ est optionnel : on ne touche que ce qui est envoye. Un formulaire
 * qui ne modifie qu'un prix ne doit pas effacer une description.
 */
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const corps = await req.json();
  const { reference, stock, seuil_alerte, disponible } = corps;
  const { nom, categorie, prix, description, image, groupe, couleur } = corps;
  if (!reference) return Response.json({ error: 'Reference requise' }, { status: 400 });

  // Un nom vide viderait la fiche et casserait tout rapprochement avec les
  // commandes passees. On refuse plutot que d'accepter et de le regretter.
  if (nom !== undefined && !String(nom).trim()) {
    return Response.json({ error: 'Le nom ne peut pas être vide' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Menu temporairement indisponible' }, { status: 503 });

  const patch: {
    stock?: number | null;
    seuil_alerte?: number | null;
    disponible?: boolean;
    nom?: string;
    categorie?: string;
    prix?: number;
    description?: string;
    photo_url?: string | null;
    groupe?: string | null;
    couleur?: string | null;
  } = {};

  if (stock !== undefined) patch.stock = stock === null || stock === '' ? null : Number(stock);
  if (seuil_alerte !== undefined) patch.seuil_alerte = seuil_alerte === null || seuil_alerte === '' ? null : Number(seuil_alerte);
  if (disponible !== undefined) patch.disponible = Boolean(disponible);
  // Une chaine vide EFFACE la declinaison, elle ne l'ignore pas : c'est ainsi
  // qu'un marchand detache un coloris devenu un article a part entiere.
  if (groupe !== undefined) patch.groupe = String(groupe).trim() || null;
  if (couleur !== undefined) patch.couleur = String(couleur).trim() || null;
  if (nom !== undefined) patch.nom = String(nom).trim();
  if (categorie !== undefined) patch.categorie = String(categorie || 'Divers');
  if (prix !== undefined) patch.prix = Number(prix) || 0;
  if (description !== undefined) patch.description = String(description || '');
  if (image !== undefined) patch.photo_url = String(image || '') || null;

  const { error } = await sb
    .from('produits')
    .update(patch)
    .eq('boutique_id', m.boutiqueId)
    .eq('reference', String(reference));

  if (error) {
    console.error(`Produits — mise a jour impossible (${m.id}) :`, error);
    return Response.json({ error: 'Mise a jour impossible' }, { status: 503 });
  }

  // ---- Miroir feuille, jamais bloquant.
  //
  // C'EST LA FEUILLE QUE LIT L'ASSISTANTE, pas Supabase. Une correction qui ne
  // toucherait que la base laisserait le bot proposer l'ancien nom et l'ancien
  // prix a tous les clients : le marchand croirait avoir corrige, et rien
  // n'aurait change pour ceux qui commandent.
  //
  // L'echec reste silencieux, comme a la creation : le produit est corrige en
  // base, la vitrine le vend juste, et une feuille indisponible ne doit pas
  // faire echouer la modification.
  try {
    const onglet = m.sheetMenu;
    const headers = await readHeaders(`${onglet}!A1:Z1`, m.sheetId);
    const lignes = await readSheet(`${onglet}!A:Z`, m.sheetId);
    const index = lignes.findIndex((l) => String(l.id ?? '').trim() === String(reference));

    if (index >= 0) {
      const ancienne = lignes[index];
      const valeur = (cle: string, neuf: unknown, transforme?: (v: unknown) => string) =>
        neuf === undefined ? String(ancienne[cle] ?? '') : (transforme ? transforme(neuf) : String(neuf ?? ''));

      const ligne = headers.map((h) => {
        switch (h) {
          case 'nom': return valeur('nom', nom, (v) => String(v).trim());
          case 'categorie': return valeur('categorie', categorie, (v) => String(v || 'Divers'));
          case 'prix': return valeur('prix', prix, (v) => String(Number(v) || 0));
          case 'description': return valeur('description', description);
          case 'image': return valeur('image', image);
          case 'disponible': return valeur('disponible', disponible, (v) => (v ? 'TRUE' : 'FALSE'));
          case 'stock': return valeur('stock', patch.stock, (v) => (v === null ? '' : String(v)));
          case 'seuil_alerte': return valeur('seuil_alerte', patch.seuil_alerte, (v) => (v === null ? '' : String(v)));
          default: return String(ancienne[h] ?? '');
        }
      });

      // +2 : une ligne d'en-tete, et Sheets compte a partir de 1.
      await updateCells(`${onglet}!A${index + 2}:Z${index + 2}`, [ligne], m.sheetId);
    }
  } catch (e) {
    console.error(`Produits — miroir ${m.sheetMenu} impossible (${m.id}) :`, e);
  }

  return Response.json({ ok: true });
}