import { NextResponse } from 'next/server';
import { listerMarchands } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Registre complet des marchands, pour les automatisations.
 *
 * Pendant du GET /api/internal/fiche : meme secret, meme public. La fiche
 * repond pour un marchand que l'on connait deja ; cette route repond quand on
 * doit balayer TOUS les marchands — la normalisation des feuilles n8n, par
 * exemple, qui ne peut pas deviner la liste des slugs.
 *
 * Elle porte les champs d'exploitation (classeur, onglets, groupe de livreurs,
 * numero WhatsApp) que le registre public /api/marchands ne doit pas exposer.
 */
export async function GET(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    return NextResponse.json({ marchands: await listerMarchands() });
  } catch (e) {
    console.error('Registre interne — lecture impossible :', e);
    return NextResponse.json({ error: 'Registre indisponible' }, { status: 503 });
  }
}
