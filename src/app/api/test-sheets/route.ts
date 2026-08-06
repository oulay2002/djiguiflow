import { readSheet } from '@/lib/googleSheets';
import { resoudreMarchand } from '@/lib/marchands';

// Sonde de diagnostic : vérifie que l'accès Google Sheets fonctionne.
// Elle renvoyait la dernière ligne COMPLÈTE (nom, téléphone, adresse du
// client) sur une URL publique non authentifiée. Elle ne renvoie plus que
// des compteurs, et se tait hors développement.
export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Indisponible' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  try {
    const rows = await readSheet(`${m.sheetCommandes}!A:Z`, m.sheetId);
    return Response.json({
      ok: true,
      boutique_id: m.id,
      feuille: m.sheetCommandes,
      nb: rows.length,
      colonnes: Object.keys(rows[0] ?? {}),
    });
  } catch (e) {
    return Response.json({ ok: false, erreur: String(e) }, { status: 503 });
  }
}
