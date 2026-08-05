import { readSheet } from '@/lib/googleSheets';

export async function GET() {
  const rows = await readSheet('Commandes_Zahara!A:Z');
  const commandes = rows
    .filter(r => (r.order_id || '').trim() !== '' || (r.customer_name || '').trim() !== '')
    .reverse();
  return Response.json(commandes);
}