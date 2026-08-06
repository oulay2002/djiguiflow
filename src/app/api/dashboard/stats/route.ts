import { readSheet } from '@/lib/googleSheets';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const m = await resoudreMarchand(searchParams.get('boutique_id'));
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  let commandes: Record<string, string>[];
  try {
    commandes = await readSheet(`${m.sheetCommandes}!A:Z`, m.sheetId);
  } catch (e) {
    console.error(`Stats — lecture ${m.sheetCommandes} impossible :`, e);
    return Response.json({ error: 'Statistiques temporairement indisponibles' }, { status: 503 });
  }

  let notes: Record<string, string>[] = [];
  try { notes = await readSheet(`${m.sheetNotes}!A:Z`, m.sheetId); } catch { notes = []; }

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const nums = (v: unknown) => Number(String(v ?? '').replace(/\D/g, '')) || 0;
  const canalDe = (c: Record<string, string>) => {
    if (String(c.order_id || '').startsWith('APP-')) return 'app';
    return String(c.canal || 'inconnu').trim().toLowerCase();
  };

  const caTotal = commandes.reduce((s, c) => s + nums(c.total_price), 0);
  const cmdJour = commandes.filter(c => String(c.timestamp || '').slice(0, 10) === aujourdHui);
  const caJour = cmdJour.reduce((s, c) => s + nums(c.total_price), 0);

  const parCanal: Record<string, number> = {};
  for (const c of commandes) parCanal[canalDe(c)] = (parCanal[canalDe(c)] || 0) + 1;

  const livrees = commandes.filter(c => /livr/i.test(c.statut_livraison || '')).length;

  const notesVals = notes.map(n => Number(n.note)).filter(n => n >= 1 && n <= 5);
  const noteMoyenne = notesVals.length
    ? Math.round((notesVals.reduce((s, n) => s + n, 0) / notesVals.length) * 10) / 10
    : 0;

  const plats: Record<string, number> = {};
  for (const c of commandes) {
    try {
      for (const it of JSON.parse(c.items || '[]')) {
        const nom = it.plat || it.nom || 'Divers';
        plats[nom] = (plats[nom] || 0) + (Number(it.quantité || it.quantite) || 1);
      }
    } catch { /* items vides */ }
  }
  const topPlats = Object.entries(plats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const produitsVendus = Object.values(plats).reduce((a, b) => a + b, 0);

  const serie7j: { jour: string; ca: number; nb: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const cmd = commandes.filter(c => String(c.timestamp || '').slice(0, 10) === key);
    serie7j.push({
      jour: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' }),
      ca: cmd.reduce((s, c) => s + nums(c.total_price), 0),
      nb: cmd.length,
    });
  }

  return Response.json({
    boutique_id: m.id,
    caTotal, caJour,
    nbCommandes: commandes.length, nbJour: cmdJour.length,
    livrees, enCours: commandes.length - livrees,
    parCanal, noteMoyenne, nbNotes: notesVals.length, topPlats,
    serie7j, produitsVendus,
    panierMoyen: commandes.length ? Math.round(caTotal / commandes.length) : 0,
  });
}