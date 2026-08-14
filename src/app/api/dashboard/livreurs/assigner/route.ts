import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { envoyerMessage } from '@/lib/canaux';

/**
 * Assignation d'une course a un livreur.
 *
 * L'ecran d'assignation ecrivait ces trois lignes directement depuis le
 * navigateur, et personne n'etait prevenu : ni le livreur, qui devait deviner
 * qu'une course lui revenait, ni le client, dont la commande venait pourtant
 * de passer en livraison. Deux workflows n8n existaient pour cela — ils
 * n'avaient jamais ete branches, et sont archives depuis le 12 aout 2026.
 *
 * L'assignation passe donc par le serveur, qui seul peut resoudre le jeton du
 * marchand et joindre ses interlocuteurs. Les ecritures restent identiques a
 * ce que faisait l'ecran ; seules les notifications s'y ajoutent.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps) return Response.json({ error: 'Requête illisible' }, { status: 400 });

  const commandeId = String(corps.commande_id ?? '').trim();
  const livreurId = String(corps.livreur_id ?? '').trim();
  const slug = String(corps.boutique ?? '').trim();
  if (!commandeId || !livreurId) {
    return Response.json({ error: 'commande_id et livreur_id requis' }, { status: 400 });
  }

  const acces = await exigerAccesMarchand(req, slug);
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  // La commande et le livreur doivent appartenir a la boutique de l'appelant :
  // sans ce controle, un marchand connecte pourrait assigner le livreur d'un
  // autre, ou pire, une commande qui ne lui appartient pas.
  const [{ data: commande }, { data: livreur }] = await Promise.all([
    sb.from('commandes')
      .select('id, boutique_id, reference, client_nom, client_telephone, chat_id, client_adresse, total')
      .eq('id', commandeId)
      .maybeSingle(),
    sb.from('livreurs')
      .select('id, boutique_id, nom, telephone')
      .eq('id', livreurId)
      .maybeSingle(),
  ]);

  if (!commande || !livreur) {
    return Response.json({ error: 'Commande ou livreur introuvable' }, { status: 404 });
  }
  if (commande.boutique_id !== livreur.boutique_id) {
    return Response.json({ error: 'Commande et livreur de boutiques différentes' }, { status: 409 });
  }

  // ---- 1. Les trois ecritures, comme les faisait l'ecran.
  const { error: errLivraison } = await sb
    .from('livraisons')
    .insert({ commande_id: commandeId, livreur_id: livreurId, statut: 'assignee' });

  if (errLivraison) {
    console.error(`Assignation ${commande.reference} — livraison refusee :`, errLivraison);
    return Response.json({ error: 'Assignation impossible, réessayez' }, { status: 503 });
  }

  await sb.from('commandes').update({ statut: 'en_livraison' }).eq('id', commandeId);
  await sb.from('livreurs').update({ statut: 'en_livraison' }).eq('id', livreurId);

  // ---- 2. Prevenir, ce qui n'etait jamais fait.
  //
  // Aucun des deux envois ne peut annuler l'assignation : elle est enregistree,
  // et un message perdu ne doit pas faire croire que la course ne l'est pas.
  // En revanche l'echec est rendu a l'appelant, pour que l'ecran le dise.
  const reference = String(commande.reference ?? '');
  // Les commandes d'avant la convention de reference n'en portent pas, et
  // « votre commande  est prise en charge », avec son trou, se lit plus mal
  // que la phrase sans numero.
  const laCommande = reference ? `votre commande ${reference}` : 'votre commande';
  const adresse = String(commande.client_adresse ?? '').trim();
  const total = Number(commande.total ?? 0).toLocaleString('fr-FR');

  const versLivreur = String(livreur.telephone ?? '').trim();
  const versClient = String(commande.client_telephone ?? commande.chat_id ?? '').trim();

  const notifications: Record<string, string> = {};

  if (versLivreur) {
    const envoi = await envoyerMessage({
      boutique: m.id,
      canal: 'whatsapp',
      destinataire: versLivreur,
      message:
        `🛵 Nouvelle course pour vous, ${livreur.nom || 'livreur'}.\n\n` +
        `${reference ? `Commande ${reference}\n` : ''}` +
        `Client : ${commande.client_nom || 'Client'}${versClient ? ` · ${versClient}` : ''}\n` +
        `Adresse : ${adresse || 'à confirmer avec le commerçant'}\n` +
        `Montant : ${total} FCFA`,
    });
    notifications.livreur = envoi.ok ? 'sent' : `refuse (${envoi.statut ?? '?'})`;
    if (!envoi.ok) console.error(`Assignation ${reference} — livreur non prevenu :`, envoi.raison);
  } else {
    notifications.livreur = 'aucun numéro';
  }

  if (versClient) {
    const envoi = await envoyerMessage({
      boutique: m.id,
      canal: 'whatsapp',
      destinataire: versClient,
      // Une course assignee n'est pas une course partie : le depart est
      // annonce par « Demarrer », qui passe la livraison en cours. Les deux
      // messages disaient « part en livraison » — le client le lisait deux fois.
      message:
        `📦 ${commande.client_nom || 'Bonjour'}, ${laCommande} est prise en charge.\n` +
        `${livreur.nom ? `${livreur.nom} s'en occupe` : 'Un livreur s\'en occupe'} et vous préviendra du départ.`,
    });
    notifications.client = envoi.ok ? 'sent' : `refuse (${envoi.statut ?? '?'})`;
    if (!envoi.ok) console.error(`Assignation ${reference} — client non prevenu :`, envoi.raison);
  } else {
    notifications.client = 'aucun numéro';
  }

  return Response.json({ ok: true, reference, notifications });
}
