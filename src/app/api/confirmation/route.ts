import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type LigneItem = { nom_produit: string | null; quantite: number | null };

type Ligne = {
  reference: string;
  confirmation_statut: string | null;
  boutique_id: string;
  client_nom: string | null;
  client_telephone: string | null;
  chat_id: string | null;
  client_adresse: string | null;
  total: number | null;
  canal: string | null;
  commande_items: LigneItem[] | null;
};

function pageHtml(emoji: string, titre: string, detail: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${titre}</title></head><body style="font-family:system-ui,sans-serif;background:#f7f0e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="background:#fff;border-radius:24px;padding:40px;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(49,35,20,.12)"><div style="font-size:48px">${emoji}</div><h1 style="font-size:22px;margin:16px 0 8px;color:#0f172a">${titre}</h1><p style="color:#64748b;margin:0">${detail}</p><p style="margin-top:24px;font-size:13px;color:#94a3b8">DjiguiFlow 🍽️</p></div></body></html>`;
}

export async function GET(req: Request) {
  const html = (e: string, t: string, d: string, code = 200) =>
    new Response(pageHtml(e, t, d), { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get('ref') || '').trim();
  const r = (searchParams.get('r') || '').toLowerCase();
  if (!ref || (r !== 'oui' && r !== 'non')) return html('❌', 'Lien invalide', 'Ce lien de confirmation est incomplet.', 400);

  const sb = getSupabaseAdmin();
  if (!sb) return html('⏳', 'Service indisponible', 'Réessayez dans quelques secondes.', 503);

  const { data, error } = await sb
    .from('commandes')
    .select(
      'reference, confirmation_statut, boutique_id, client_nom, client_telephone, chat_id,' +
        ' client_adresse, total, canal, commande_items(nom_produit, quantite)',
    )
    .ilike('reference', ref)
    .maybeSingle();

  if (error || !data) return html('❌', 'Commande introuvable', 'Vérifiez le lien reçu.', 404);

  const ligne = data as unknown as Ligne;

  if (ligne.confirmation_statut === 'confirmee' || ligne.confirmation_statut === 'refusee') {
    return html('ℹ️', 'Déjà répondu', `Cette commande a déjà été ${ligne.confirmation_statut === 'confirmee' ? 'confirmée ✅' : 'annulée ❌'}.`);
  }

  const statut = r === 'oui' ? 'confirmee' : 'refusee';
  const { error: errUpd } = await sb
    .from('commandes')
    .update({ confirmation_statut: statut, confirmation_heure: new Date().toISOString() } as never)
    .eq('reference', ligne.reference);
  if (errUpd) return html('⏳', 'Erreur technique', 'Réessayez dans quelques secondes.', 503);

  const n8n = process.env.N8N_CONFIRMATION_URL;
  if (n8n) {
    try {
      const telClient = ligne.client_telephone || ligne.chat_id || '';
      await fetch(n8n, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: statut,
          reference: ligne.reference,
          boutique_id: ligne.boutique_id,
          customer_name: ligne.client_nom ?? 'Client',
          phone: telClient,
          address: ligne.client_adresse ?? '',
          items: (ligne.commande_items ?? []).map(i => `${i.quantite ?? 1}× ${i.nom_produit ?? 'Article'}`),
          total_price: Number(ligne.total ?? 0),
          canal: String(ligne.canal ?? 'whatsapp').toLowerCase(),
          chat_id: ligne.chat_id || telClient,
          destinataire: telClient,
        }),
      });
    } catch { /* non bloquant */ }
  }

  return statut === 'confirmee'
    ? html('✅', 'Commande confirmée !', 'Le commerçant prépare votre commande. Merci !')
    : html('❌', 'Commande annulée', 'Le commerçant a été prévenu. Aucune somme ne sera due.');
}