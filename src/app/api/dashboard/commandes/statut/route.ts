import { readSheet, readHeaders, updateCells } from '@/lib/googleSheets';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { Marchand } from '@/lib/marchands';
import { canalDeReponse, envoyerMessage } from '@/lib/canaux';

/**
 * Avancement d'une commande par le marchand.
 *
 * Supabase fait foi. Cette route lisait auparavant la feuille entiere avant
 * toute chose et renvoyait 503 des que Google Sheets refusait — un quota
 * sature empechait donc le marchand de passer une commande en « livree »
 * alors que son tableau de bord, qui lit Supabase, fonctionnait parfaitement.
 * La feuille est desormais mise a jour apres coup, en miroir, sans pouvoir
 * bloquer l'action.
 */

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const STATUTS_LIVRAISON: Record<string, string> = {
  acceptee: 'acceptée',
  route: 'en route',
  livree: 'livrée',
};

const STATUTS_METIER: Record<string, string> = {
  acceptee: 'en_preparation',
  route: 'en_livraison',
  livree: 'livree',
};

/** A, B, … Z, AA, AB… */
function lettreColonne(idx: number): string {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Reporte le statut dans la feuille du marchand.
 *
 * Ne leve jamais : les workflows n8n lisent encore la feuille, mais le
 * marchand, lui, lit Supabase. Un echec ici ne doit pas lui refuser l'action.
 */
async function refleterDansFeuille(
  m: Marchand,
  orderId: string,
  statutLivraison: string,
  action: string,
  maintenant: string,
): Promise<'ok' | 'absente' | 'echec'> {
  try {
    const entetes = await readHeaders(`${m.sheetCommandes}!A1:Z1`, m.sheetId);
    const lignes = await readSheet(`${m.sheetCommandes}!A:Z`, m.sheetId);

    const i = lignes.findIndex((r) => String(r.order_id || '').trim() === orderId);
    if (i === -1) return 'absente';

    const numeroLigne = i + 2; // +1 en-tete, +1 index 1-based
    const colonne = (nom: string) => {
      const idx = entetes.indexOf(nom);
      return idx >= 0 ? lettreColonne(idx) : null;
    };

    const cStatut = colonne('statut_livraison');
    if (cStatut) {
      await updateCells(`${m.sheetCommandes}!${cStatut}${numeroLigne}`, [[statutLivraison]], m.sheetId);
    }
    if (action === 'acceptee') {
      const c = colonne('heure_prise_en_charge');
      if (c) await updateCells(`${m.sheetCommandes}!${c}${numeroLigne}`, [[maintenant]], m.sheetId);
    }
    if (action === 'livree') {
      const c = colonne('heure_livraison');
      if (c) await updateCells(`${m.sheetCommandes}!${c}${numeroLigne}`, [[maintenant]], m.sheetId);
    }
    return 'ok';
  } catch (e) {
    console.error(`Statut ${orderId} — miroir ${m.sheetCommandes} impossible :`, e);
    return 'echec';
  }
}

export async function POST(req: Request) {
  const { order_id, action, boutique_id } = await req.json();
  if (!order_id || !action) return Response.json({ error: 'Params manquants' }, { status: 400 });

  const acces = await exigerAccesMarchand(req, boutique_id);
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const reference = String(order_id).trim();
  const statutLivraison = STATUTS_LIVRAISON[action] || action;
  const statutMetier = STATUTS_METIER[action];
  const maintenant = new Date().toISOString();

  const sb: Admin | null = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Service indisponible' }, { status: 503 });

  // ---- 1. Supabase : la commande avance ici, ou nulle part.
  const { data: commande, error: errLecture } = await sb
    .from('commandes')
    .select('id, client_nom, client_telephone, client_adresse, chat_id, canal')
    .eq('boutique_id', m.boutiqueId)
    .eq('reference', reference)
    .maybeSingle();

  if (errLecture) {
    console.error(`Statut ${reference} — lecture Supabase impossible :`, errLecture);
    return Response.json({ error: 'Base temporairement indisponible' }, { status: 503 });
  }
  if (!commande) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

  const { error: errEcriture } = await sb
    .from('commandes')
    .update({
      ...(statutMetier ? { statut: statutMetier } : {}),
      statut_livraison: statutLivraison,
      ...(action === 'acceptee' ? { heure_prise_en_charge: maintenant } : {}),
      ...(action === 'livree' ? { heure_livraison: maintenant } : {}),
    })
    .eq('id', commande.id);

  if (errEcriture) {
    console.error(`Statut ${reference} — mise a jour refusee :`, errEcriture);
    return Response.json({ error: 'Mise a jour impossible, reessayez' }, { status: 503 });
  }

  // ---- 2. Miroir feuille, jamais bloquant.
  const miroir = await refleterDansFeuille(m, reference, statutLivraison, action, maintenant);

  // ---- 3. Notification WhatsApp au client.
  //
  // L'envoi partait vers `N8N_NOTIF_CLIENT_URL`, qui pointe sur le webhook
  // `notif-client`. Or ce chemin n'existe pas : verifie le 12 aout 2026, il
  // repond 404. Chaque « commande acceptee », « en route » et « livree »
  // partait donc dans le vide, et `fetch` ne rejetant pas sur un code
  // d'erreur, la route annoncait quand meme un envoi reussi.
  //
  // On passe desormais par le meme chemin sortant que tout le reste du
  // produit, sans detour par n8n : la boutique resout son propre jeton cote
  // serveur, et l'echec, lui, se voit.
  // La regle vit dans `canaux.ts`, avec son pourquoi et ses tests.
  const { canal: canalClient, destinataire } = canalDeReponse({
    canal: commande.canal,
    chatId: commande.chat_id,
    telephone: commande.client_telephone,
  });

  let notif = 'none';

  if (destinataire) {
    const nom = commande.client_nom || 'cher client';
    const adresse = commande.client_adresse || 'votre adresse';
    const messages: Record<string, string> = {
      acceptee: `✅ ${nom}, votre commande ${reference} est acceptée. Nous cherchons un livreur pour vous.`,
      route: `🛵 ${nom}, bonne nouvelle : votre commande ${reference} est en route vers ${adresse}.`,
      livree: `🎉 ${nom}, votre commande ${reference} a été livrée ! Merci pour votre confiance. Répondez par un chiffre de 1 à 5 pour noter le service. ⭐`,
    };

    const envoi = await envoyerMessage({
      boutique: m.id,
      canal: canalClient,
      destinataire,
      message: messages[action] || `Votre commande ${reference} avance bien.`,
    });

    if (envoi.ok) {
      notif = 'sent';
    } else {
      notif = `refuse ${canalClient} (${envoi.statut ?? '?'})`;
      console.error(`Notification client ${reference} — envoi refuse :`, envoi.raison);
    }
  }

  return Response.json({ ok: true, boutique_id: m.id, statut: statutLivraison, miroir, notif });
}
