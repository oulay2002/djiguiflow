import { listerMarchands } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

// Alimente le sélecteur de boutique du dashboard.
// N'expose que le public : ni sheetId, ni groupeLivreurs, ni whatsapp.
export async function GET() {
  try {
    return Response.json({ marchands: await listerMarchands() });
  } catch (e) {
    console.error('Registre marchands — lecture impossible :', e);
    // Liste vide : le dashboard retombe sur le marchand par défaut
    // au lieu de planter.
    return Response.json({ marchands: [] });
  }
}
