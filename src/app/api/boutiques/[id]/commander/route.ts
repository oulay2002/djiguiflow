import { readSheet, readHeaders, appendRow } from '@/lib/googleSheets';
import { getMarchand, prefixeReference, type Marchand } from '@/lib/marchands';
import { resoudreBoutiqueUuid } from '@/lib/boutiques';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { secretWebhookN8n } from '@/lib/secretN8n';

/**
 * Prise de commande depuis la boutique en ligne.
 *
 * Supabase fait foi. C'est l'inverse de ce que faisait cette route jusqu'ici :
 * elle ecrivait dans Google Sheets puis esperait que n8n reporte la commande
 * dans Supabase, en avalant l'erreur si n8n ne repondait pas. Or le tableau de
 * bord, les statistiques et le suivi client lisent tous Supabase — une
 * commande restee en feuille etait donc encaissee mais invisible du marchand.
 *
 * Desormais : si l'ecriture Supabase echoue, la commande est refusee. Un
 * client qui voit une erreur et recommence coute moins cher qu'un client qui
 * croit avoir commande et que personne ne livre.
 *
 * La feuille reste ecrite, en miroir et sans pouvoir bloquer : les workflows
 * n8n la lisent encore.
 */

type LigneCommande = {
  produitId: string | null;
  plat: string;
  quantite: number;
  prixUnitaire: number;
};

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Donne un prix et un nom a chaque ligne du panier.
 *
 * Supabase d'abord, la feuille en repli pour ce qui n'y est pas encore : la
 * table `produits` n'est pas garantie complete pour tous les marchands tant
 * que la migration n'est pas finie, et un plat introuvable disparaitrait
 * silencieusement du panier.
 */
async function tariferPanier(
  m: Marchand,
  panier: unknown,
  sb: Admin | null,
  boutiqueUuid: string | null,
): Promise<LigneCommande[]> {
  const demandes = (Array.isArray(panier) ? panier : [])
    .map((l) => ({
      id: String((l as { id?: unknown })?.id ?? '').trim(),
      quantite: Math.max(1, Number((l as { quantite?: unknown })?.quantite) || 1),
    }))
    .filter((l) => l.id);

  if (!demandes.length) return [];

  const resolues = new Map<string, LigneCommande>();

  if (sb && boutiqueUuid) {
    const { data, error } = await sb
      .from('produits')
      .select('id, nom, prix, reference')
      .eq('boutique_id', boutiqueUuid);

    if (error) {
      console.error('Panier — lecture produits Supabase impossible :', error);
    }

    // La vitrine publie `reference ?? id` comme identifiant public (voir la
    // route menu). Un marchand dont les produits n'ont pas encore de
    // reference envoie donc des uuid : accepter les deux cles est ce qui
    // permet a Rose MonDE de commander, ce que la correspondance par
    // reference seule ne permettait pas.
    const parCle = new Map<string, NonNullable<typeof data>[number]>();
    for (const p of data ?? []) {
      const ref = String(p.reference ?? '').trim();
      if (ref) parCle.set(ref, p);
      parCle.set(String(p.id), p);
    }

    for (const demande of demandes) {
      const p = parCle.get(demande.id);
      if (!p) continue;

      resolues.set(demande.id, {
        produitId: p.id,
        plat: String(p.nom ?? ''),
        quantite: demande.quantite,
        prixUnitaire: Number(p.prix) || 0,
      });
    }
  }

  const manquants = demandes.filter((d) => !resolues.has(d.id));
  if (manquants.length) {
    try {
      const menu = await readSheet(`${m.sheetMenu}!A:I`, m.sheetId);
      for (const d of manquants) {
        const p = menu.find((x) => x.id === d.id);
        if (!p) continue;
        resolues.set(d.id, {
          produitId: null,
          plat: String(p.nom ?? ''),
          quantite: d.quantite,
          // La feuille ecrit les prix en « 2 500 FCFA » : on ne garde que les
          // chiffres.
          prixUnitaire: Number(String(p.prix).replace(/\D/g, '')) || 0,
        });
      }
    } catch (e) {
      console.error(`Panier — repli menu ${m.sheetMenu} impossible :`, e);
    }
  }

  // L'ordre du panier du client est conserve.
  return demandes
    .map((d) => resolues.get(d.id))
    .filter((l): l is LigneCommande => Boolean(l));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const m = await getMarchand(id);
  if (!m) return Response.json({ error: 'Marchand introuvable' }, { status: 404 });

  // Un corps tronque ou un content-type inattendu ne doit pas rendre un 500 :
  // c'est un client qui a mal envoye, pas le serveur qui a casse.
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'Requête illisible' }, { status: 400 });
  const { nom, tel, adresse, instructions, panier } = body as {
    nom?: unknown; tel?: unknown; adresse?: unknown;
    instructions?: unknown; panier?: unknown;
  };

  const sb = getSupabaseAdmin();
  const boutiqueUuid = sb ? await resoudreBoutiqueUuid(sb, m) : null;

  const lignes = await tariferPanier(m, panier, sb, boutiqueUuid);
  if (!lignes.length) return Response.json({ error: 'Panier vide' }, { status: 400 });

  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);

  let phone = String(tel || '').replace(/\D/g, '');
  if (!phone.startsWith('225')) phone = '225' + phone;
  const order_id = `${prefixeReference(m.id)}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // ---- 1. Supabase : c'est ici que la commande existe ou n'existe pas.
  if (sb) {
    if (!boutiqueUuid) {
      console.error(`Commande ${order_id} — boutique ${m.id} absente de Supabase`);
      return Response.json(
        { error: 'Cette boutique ne peut pas recevoir de commande pour le moment' },
        { status: 503 },
      );
    }

    const { data: creee, error } = await sb
      .from('commandes')
      .insert({
        boutique_id: boutiqueUuid,
        reference: order_id,
        client_nom: String(nom || 'Client'),
        client_telephone: phone,
        client_adresse: String(adresse || ''),
        instructions: String(instructions || ''),
        chat_id: phone,
        total,
        // `canal` dit COMMENT JOINDRE le client, pas d'ou vient la commande.
        // Il a longtemps valu 'app', que ni `/api/canaux/envoyer` ni le routeur
        // de « Envoyer reponse client » ne connaissent : les cinq notifications
        // de livraison — acceptee, partie, en route, livree, demande de note —
        // echouaient toutes en « Envoi impossible », sans que rien ne le
        // signale. Le livreur et le gerant, eux, etaient bien prevenus, ce qui
        // rendait la panne invisible. Un client de la vitrine laisse son
        // numero : c'est sur WhatsApp qu'on le joint.
        canal: 'whatsapp',
        statut: 'en_attente',
      })
      .select('id')
      .single();

    if (error || !creee) {
      console.error(`Commande ${order_id} — insertion Supabase refusee :`, error);
      return Response.json(
        { error: 'Commande non enregistree, merci de reessayer' },
        { status: 503 },
      );
    }

    const { error: errArticles } = await sb.from('commande_items').insert(
      lignes.map((l) => ({
        commande_id: creee.id,
        produit_id: l.produitId,
        nom_produit: l.plat,
        quantite: l.quantite,
        prix_unitaire: l.prixUnitaire,
      })),
    );

    if (errArticles) {
      // Une commande sans article afficherait un total sans contenu et
      // enverrait le livreur sans savoir quoi livrer. On la retire plutot que
      // de laisser cette incoherence en base.
      console.error(`Commande ${order_id} — articles refuses, annulation :`, errArticles);
      await sb.from('commandes').delete().eq('id', creee.id);
      return Response.json(
        { error: 'Commande non enregistree, merci de reessayer' },
        { status: 503 },
      );
    }
  } else {
    // Environnement sans cle service_role (preview, local). On n'echoue pas :
    // c'est une configuration absente, pas une ecriture qui rate.
    console.warn(
      `Commande ${order_id} — Supabase non configure, ecriture en feuille seule`,
    );
  }

  // ---- 2. Miroir Google Sheets, jamais bloquant.
  const articlesFeuille = lignes.map((l) => ({
    plat: l.plat,
    quantité: l.quantite,
    prix_unitaire: l.prixUnitaire,
  }));

  const payload: Record<string, string> = {
    chat_id: phone,
    customer_name: String(nom || 'Client'),
    phone,
    address: String(adresse || ''),
    instruction: String(instructions || ''),
    items: JSON.stringify(articlesFeuille),
    total_price: String(total),
    status: 'validee',
    order_id,
    timestamp: new Date().toISOString(),
    nom_livreur: '',
    heure_prise_en_charge: '',
    statut_livraison: '',
    position_livreur: '',
    heure_livraison: '',
    // Meme valeur qu'en base, et pour la meme raison : c'est cette colonne que
    // « Acceptation Livraison » relit pour savoir ou joindre le client, et son
    // aiguillage compare a 'whatsapp'. Les deux ecritures doivent rester
    // d'accord, sinon la feuille et Supabase racontent deux histoires.
    canal: 'whatsapp',
  };

  try {
    const headers = await readHeaders(`${m.sheetCommandes}!A1:Z1`, m.sheetId);
    await appendRow(`${m.sheetCommandes}!A:Z`, headers.map((h) => payload[h] ?? ''), m.sheetId);
  } catch (e) {
    // La commande est deja en base : le miroir peut echouer sans consequence
    // pour le marchand, qui la voit dans son tableau de bord.
    console.error(`Commande ${order_id} — miroir ${m.sheetCommandes} impossible :`, e);
  }

  // ---- 3. Webhook generique (avec boutique_id pour n8n)
  const n8nUrl = process.env.N8N_COMMANDE_APP_URL;
  if (n8nUrl) {
    try {
      await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Un seul secret pour tous les webhooks n8n, lu au coffre Supabase.
          // Voir `secretN8n.ts` pour la rotation.
          'x-djiguiflow-secret': await secretWebhookN8n(),
        },
        body: JSON.stringify({
          boutique_id: m.id,
          boutique_nom: m.nom,
          order_id,
          customer_name: String(nom || 'Client'),
          phone,
          address: String(adresse || ''),
          items: JSON.stringify(articlesFeuille),
          total_price: String(total),
          sheetCommandes: m.sheetCommandes,
          // Sans ce champ, le workflow n8n retombait sur le groupe de
          // livreurs de Zahara : une commande passee chez un autre marchand
          // alertait les livreurs de Zahara et n'atteignait jamais les siens.
          // Le repli a ete supprime cote n8n, ce champ est donc obligatoire.
          groupeLivreurs: m.groupeLivreurs,
        }),
      });
    } catch {
      // n8n injoignable : la commande est en base, le marchand la voit.
    }
  }

  // ---- 4. Demande de confirmation au client (anti-retours)
  const confUrl = process.env.N8N_CONFIRMATION_URL;
  if (confUrl) {
    try {
      await fetch(confUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Un seul secret pour tous les webhooks n8n, lu au coffre Supabase.
          // Voir `secretN8n.ts` pour la rotation.
          'x-djiguiflow-secret': await secretWebhookN8n(),
        },
        body: JSON.stringify({
          type: 'demande',
          reference: order_id,
          phone,
          nom: String(nom || 'Client'),
          total: String(total),
          boutique_id: m.boutiqueId,
        }),
      });
    } catch { /* non bloquant */ }
  }

  return Response.json({ ok: true, order_id });
}
