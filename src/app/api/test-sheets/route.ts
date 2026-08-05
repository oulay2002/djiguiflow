import { readSheet } from '@/lib/googleSheets';

export async function GET() {
  const rows = await readSheet('Commandes_Zahara!A:J');
  return Response.json({ ok: true, nb: rows.length, derniere: rows[rows.length - 1] });
}