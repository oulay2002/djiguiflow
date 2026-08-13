import { NextResponse } from 'next/server';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ameliorerPhoto } from '@/lib/images/ameliorer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Au-dela, on refuse avant de charger sharp : un telephone ne produit pas 20 Mo. */
const TAILLE_MAX = 20 * 1024 * 1024;

const TYPES_ACCEPTES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/**
 * Recoit la photo brute du marchand, la remet en etat, la range.
 *
 * Le televersement se faisait jusqu'ici du navigateur directement vers le
 * Storage : la photo du telephone arrivait telle quelle sur la vitrine. En
 * passant par le serveur, on peut la redresser, la recadrer et surtout la
 * ramener a un poids qu'une connexion mobile ivoirienne accepte de charger.
 */
export async function POST(req: Request) {
  let formulaire: FormData;
  try {
    formulaire = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Envoi illisible.' }, { status: 400 });
  }

  const slug = String(formulaire.get('boutique_id') ?? '').trim();
  const acces = await exigerAccesMarchand(req, slug || null);
  if (!acces.ok) {
    return NextResponse.json({ error: acces.message }, { status: acces.statut });
  }

  const fichier = formulaire.get('fichier');
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
  }

  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json(
      { error: 'Photo trop lourde. Prenez-la à nouveau, ou réduisez-la avant l’envoi.' },
      { status: 413 },
    );
  }

  // On se fie au type declare pour ecarter l'evident, mais c'est sharp qui
  // tranche : un fichier renomme en .jpg le franchirait, et echouerait ensuite
  // proprement au decodage.
  if (fichier.type && !TYPES_ACCEPTES.has(fichier.type)) {
    return NextResponse.json(
      { error: `Format non pris en charge (${fichier.type}).` },
      { status: 415 },
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Stockage indisponible.' }, { status: 503 });

  let amelioree;
  try {
    amelioree = await ameliorerPhoto(Buffer.from(await fichier.arrayBuffer()));
  } catch (e) {
    console.error('Photo — traitement impossible :', e);
    return NextResponse.json(
      { error: "Cette image n'a pas pu être lue. Essayez une autre photo." },
      { status: 422 },
    );
  }

  // Meme convention de chemin qu'avant : le premier segment est l'uuid de la
  // boutique, ce que les policies Storage exigent des ecritures venues du
  // navigateur. On y ecrit ici avec la cle service, mais changer la convention
  // casserait les deux voies.
  const chemin = `${acces.marchand.boutiqueId}/produits/${Date.now()}.webp`;

  const { error } = await sb.storage.from('images').upload(chemin, amelioree.donnees, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('Photo — rangement impossible :', error);
    return NextResponse.json({ error: 'Enregistrement de la photo impossible.' }, { status: 503 });
  }

  const url = sb.storage.from('images').getPublicUrl(chemin).data.publicUrl;

  return NextResponse.json({
    url,
    // Rendus pour que l'ecran puisse dire au marchand ce qu'il vient de gagner.
    // « 4,2 Mo -> 118 Ko » se comprend mieux que « photo optimisee ».
    octetsAvant: amelioree.octetsAvant,
    octets: amelioree.octets,
    largeur: amelioree.largeur,
    hauteur: amelioree.hauteur,
  });
}
