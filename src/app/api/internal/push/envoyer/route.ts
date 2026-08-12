import { NextResponse } from 'next/server';
import { resoudreMarchand } from '@/lib/marchands';
import { envoyerPushBoutique } from '@/lib/push';

export const dynamic = 'force-dynamic';

type Corps = {
  /** Slug ou uuid de la boutique a prevenir. */
  boutique?: string;
  titre?: string;
  corps?: string;
  url?: string;
  tag?: string;
};

/**
 * Point d'entree de n8n pour faire sonner le telephone du marchand.
 *
 * Meme garde que les autres routes /api/internal/* : le secret partage
 * `x-sync-secret`. Sans elle, n'importe qui pourrait faire vibrer le
 * telephone de n'importe quel marchand avec le texte de son choix.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: Corps;
  try {
    corps = (await req.json()) as Corps;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const titre = corps.titre?.trim();
  const texte = corps.corps?.trim();
  if (!titre || !texte) {
    return NextResponse.json({ error: 'titre et corps requis.' }, { status: 400 });
  }

  const marchand = await resoudreMarchand(corps.boutique ?? null);
  if (!marchand) {
    return NextResponse.json({ error: 'Marchand introuvable.' }, { status: 404 });
  }

  const resultat = await envoyerPushBoutique(marchand.boutiqueId, {
    titre,
    corps: texte,
    url: corps.url,
    tag: corps.tag,
  });

  // Toujours 200 quand la demande etait valide, meme sans destinataire : un
  // marchand qui n'a pas installe l'application n'est pas une panne, et un
  // 4xx ferait clignoter le workflow n8n en rouge a chaque commande.
  return NextResponse.json({ ok: true, ...resultat });
}
