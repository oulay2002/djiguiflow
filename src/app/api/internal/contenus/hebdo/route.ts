import { NextResponse } from 'next/server';
import { contenusHebdo } from '@/lib/contenus/hebdo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Les publications de la semaine, une par boutique ayant vendu.
 *
 * Consommee par le workflow hebdomadaire, qui les livre a chaque marchand sur
 * son propre canal — pretes a publier. On ne publie pas a sa place : ni
 * Facebook ni Instagram ne l'autorisent sans une App Review et une connexion
 * OAuth par marchand, et TikTok encore moins. Lui donner le contenu fini,
 * lui-meme le poste, cela ne depend de personne.
 *
 * Garde habituelle de /api/internal : le secret partage.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // L'URL du visuel doit etre absolue et publiquement joignable : c'est
  // WhatsApp et Telegram qui iront la chercher, depuis leurs serveurs.
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || new URL(req.url).origin;

  try {
    const contenus = await contenusHebdo(base);
    return NextResponse.json({ contenus, total: contenus.length });
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'erreur inconnue';
    console.error('Contenus hebdo — composition impossible :', raison);
    return NextResponse.json({ error: 'Contenus indisponibles' }, { status: 503 });
  }
}
