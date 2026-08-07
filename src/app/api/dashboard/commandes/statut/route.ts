import { readSheet, readHeaders, updateCells } from '@/lib/googleSheets';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const { order_id, action, boutique_id } = await req.json();
  if (!order_id || !action) return Response.json({ error: 'Params manquants' }, { status: 400 });

  const acces = await exigerAccesMarchand(req, boutique_id);
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  // A, B, … Z, AA, AB… : String.fromCharCode(65 + idx) produisait « [ » puis
  // « \ » dès la 27e colonne et écrivait dans une plage invalide.
  const lettreColonne = (idx: number) => {
    let n = idx + 1;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  let headers: string[];
  let rows: Record<string, string>[];
  try {
    headers = await readHeaders(`${m.sheetCommandes}!A1:Z1`, m.sheetId);
    rows = await readSheet(`${m.sheetCommandes}!A:Z`, m.sheetId);
  } catch (e) {
    console.error(`Statut — lecture ${m.sheetCommandes} impossible :`, e);
    return Response.json({ error: 'Base temporairement indisponible' }, { status: 503 });
  }

  const i = rows.findIndex(r => String(r.order_id || '').trim() === String(order_id).trim());
  if (i === -1) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

  const row = rows[i];
  const rowNum = i + 2;
  const col = (name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? lettreColonne(idx) : null;
  };

  const statuts: Record<string, string> = { acceptee: 'acceptée', route: 'en route', livree: 'livrée' };
  const statut = statuts[action] || action;

  try {
    const cStatut = col('statut_livraison');
    if (cStatut) await updateCells(`${m.sheetCommandes}!${cStatut}${rowNum}`, [[statut]], m.sheetId);

    const maintenant = new Date().toISOString();
    if (action === 'acceptee') {
      const c = col('heure_prise_en_charge');
      if (c) await updateCells(`${m.sheetCommandes}!${c}${rowNum}`, [[maintenant]], m.sheetId);
    }
    if (action === 'livree') {
      const c = col('heure_livraison');
      if (c) await updateCells(`${m.sheetCommandes}!${c}${rowNum}`, [[maintenant]], m.sheetId);
    }
  } catch (e) {
    // Écriture refusée (429 le plus souvent) : on le dit franchement
    // plutôt que de renvoyer ok:true sur une commande non mise à jour.
    console.error(`Statut — écriture ${m.sheetCommandes} impossible :`, e);
    return Response.json({ error: 'Mise à jour impossible, réessayez' }, { status: 503 });
  }

  // Copie Supabase, non bloquante : la feuille fait foi pendant la double
  // ecriture. On y reporte aussi le statut metier, que le dashboard lit.
  const sb = getSupabaseAdmin();
  if (sb) {
    const statutMetier =
      action === 'livree' ? 'livree' : action === 'route' ? 'en_livraison' : 'en_preparation';
    const maintenant = new Date().toISOString();
    const { error } = await sb
      .from('commandes')
      .update({
        statut: statutMetier,
        statut_livraison: statut,
        ...(action === 'acceptee' ? { heure_prise_en_charge: maintenant } : {}),
        ...(action === 'livree' ? { heure_livraison: maintenant } : {}),
      })
      .eq('boutique_id', m.boutiqueId)
      .eq('reference', String(order_id).trim());
    if (error) console.error(`Statut — copie Supabase échouée (${order_id}) :`, error);
  }

  // v9.1 — notifier le client sur WhatsApp via n8n (sans jamais casser le flux)
  let notif = 'none';
  const urlNotif = process.env.N8N_NOTIF_CLIENT_URL;
  const phone = String(row.phone || row.chat_id || '');
  if (urlNotif && phone) {
    const nom = row.customer_name || 'cher client';
    const messages: Record<string, string> = {
      acceptee: `✅ ${nom}, votre commande ${order_id} est acceptée par le restaurant. Nous cherchons un livreur pour vous. 🍽️`,
      route: `🛵 ${nom}, bonne nouvelle : votre commande ${order_id} est en route vers ${row.address || 'votre adresse'}.`,
      livree: `🎉 ${nom}, votre commande ${order_id} a été livrée ! Merci pour votre confiance. Répondez par un chiffre de 1 à 5 pour noter le service. ⭐`,
    };
    try {
      await fetch(urlNotif, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-djiguiflow-secret': process.env.N8N_WEBHOOK_SECRET ?? '',
        },
        body: JSON.stringify({
          boutique_id: m.id,
          phone,
          message: messages[action] || `Votre commande ${order_id} avance bien.`,
          order_id,
        }),
      });
      notif = 'sent';
    } catch { notif = 'failed'; }
  }

  return Response.json({ ok: true, boutique_id: m.id, statut, notif });
}
