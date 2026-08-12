import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { envoyerMessage } from '@/lib/canaux';

/**
 * Avancement d'une livraison, et notification du client.
 *
 * Ce travail etait fait par un declencheur Postgres, `on_update_livraison`,
 * qui appelait un webhook n8n. Trois defauts a cet arrangement, tous trois
 * constates le 12 aout 2026 : le declencheur est invisible a qui lit le code
 * — au point que j'ai archive le workflow qu'il alimentait en le croyant
 * orphelin ; il echoue en silence, sans que rien ne remonte ; et il exige un
 * secret partage, celui-la meme dont la rotation a mis toute la chaine en 403.
 *
 * L'ecran ecrivait par ailleurs le statut directement depuis le navigateur,
 * sans verifier que la livraison appartenait bien a la boutique de l'appelant.
 */

export const dynamic = 'force-dynamic';

const STATUTS = new Set(['assignee', 'en_cours', 'livree', 'annulee']);

/** Ce que le client lit, selon l'etape. Rien pour les etapes qui ne le concernent pas. */
const MESSAGES: Record<string, (nom: string, ref: string) => string | null> = {
  en_cours: (nom, ref) => `🛵 ${nom}, votre commande ${ref} est en route.`,
  livree: (nom, ref) =>
    `🎉 ${nom}, votre commande ${ref} a été livrée. Merci pour votre confiance !\n` +
    `Répondez par un chiffre de 1 à 5 pour noter le service. ⭐`,
  annulee: (nom, ref) => `❌ ${nom}, votre commande ${ref} a été annulée. Aucune somme ne sera due.`,
  assignee: () => null,
};

export async function POST(req: Request) {
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps) return Response.json({ error: 'Requête illisible' }, { status: 400 });

  const livraisonId = String(corps.livraison_id ?? '').trim();
  const statut = String(corps.statut ?? '').trim();
  const slug = String(corps.boutique ?? '').trim();

  if (!livraisonId || !STATUTS.has(statut)) {
    return Response.json({ error: 'livraison_id et statut valides requis' }, { status: 400 });
  }

  const acces = await exigerAccesMarchand(req, slug);
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  // La livraison doit relever de la boutique de l'appelant. L'ecran ecrivait
  // sans ce controle : un marchand connecte pouvait faire avancer la livraison
  // d'un autre.
  const { data: livraison } = await sb
    .from('livraisons')
    .select('id, statut, commande_id, commandes(reference, client_nom, client_telephone, chat_id, boutique_id)')
    .eq('id', livraisonId)
    .maybeSingle();

  const commande = (livraison as { commandes?: Record<string, unknown> } | null)?.commandes;
  if (!livraison || !commande) {
    return Response.json({ error: 'Livraison introuvable' }, { status: 404 });
  }
  if (String(commande.boutique_id ?? '') !== m.boutiqueId) {
    return Response.json({ error: 'Livraison hors de votre boutique' }, { status: 403 });
  }

  const { error: errMaj } = await sb
    .from('livraisons')
    .update({
      statut,
      date_livraison: statut === 'livree' ? new Date().toISOString() : null,
    } as never)
    .eq('id', livraisonId);

  if (errMaj) {
    console.error(`Livraison ${livraisonId} — mise a jour refusee :`, errMaj);
    return Response.json({ error: 'Mise à jour impossible, réessayez' }, { status: 503 });
  }

  // Le statut metier de la commande suit celui de la livraison : sans cela le
  // tableau de bord et le suivi client racontent deux histoires differentes.
  const statutCommande: Record<string, string> = {
    en_cours: 'en_livraison',
    livree: 'livree',
    annulee: 'annulee',
  };
  // Passe par une constante locale : `commande_id` est nullable, et le
  // retrecissement de type ne survit pas a la traversee de l'appel.
  const commandeId = livraison.commande_id;
  if (statutCommande[statut] && commandeId) {
    await sb
      .from('commandes')
      .update({ statut: statutCommande[statut] } as never)
      .eq('id', commandeId);
  }

  // ---- Prevenir le client. Un message perdu n'annule pas l'avancement, mais
  // il est rendu a l'appelant : l'ecran doit pouvoir le dire.
  const reference = String(commande.reference ?? '');
  const nom = String(commande.client_nom ?? 'Bonjour');
  const destinataire = String(commande.client_telephone ?? commande.chat_id ?? '').trim();
  const texte = MESSAGES[statut]?.(nom, reference) ?? null;

  let notif = 'aucune';
  if (texte && destinataire) {
    const envoi = await envoyerMessage({
      boutique: m.id,
      canal: 'whatsapp',
      destinataire,
      message: texte,
    });
    notif = envoi.ok ? 'sent' : `refuse (${envoi.statut ?? '?'})`;
    if (!envoi.ok) console.error(`Livraison ${reference} — client non prevenu :`, envoi.raison);
  } else if (texte) {
    notif = 'aucun numéro';
  }

  return Response.json({ ok: true, reference, statut, notif });
}
