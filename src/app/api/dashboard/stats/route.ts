import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type Ligne = {
  total: number | null;
  created_at: string | null;
  canal: string | null;
  statut: string | null;
  statut_livraison: string | null;
  note_client: number | null;
  commande_items: { nom_produit: string | null; quantite: number | null }[] | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Statistiques temporairement indisponibles' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select('total, created_at, canal, statut, statut_livraison, note_client, commande_items(nom_produit, quantite)')
    .eq('boutique_id', m.boutiqueId)
    // Un panier en collecte n'est pas une vente : l'inclure gonflait le CA.
    .neq('statut', 'panier')
    // Ni une commande dont la confirmation n'est jamais revenue.
    .neq('statut', 'abandonnee')
    // NI UNE COMMANDE ANNULEE, et ce n'etait pas le cas.
    //
    // Cet ecran comptait les annulations dans « Ventes du jour », alors que la
    // page Analyses les excluait deja : deux ecrans, deux chiffres, et aucun
    // moyen pour le marchand de savoir lequel croire. Une annulation gonflait
    // aussi « en cours », qui vaut `total - livrees` : une commande annulee y
    // etait presentee comme une commande a preparer.
    .neq('statut', 'annulee');

  if (error) {
    console.error(`Stats — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Statistiques temporairement indisponibles' }, { status: 503 });
  }

  const commandes = (data ?? []) as unknown as Ligne[];
  const jour = (iso: string | null) => String(iso ?? '').slice(0, 10);
  const aujourdHui = new Date().toISOString().slice(0, 10);

  const caTotal = commandes.reduce((s, c) => s + Number(c.total ?? 0), 0);
  const cmdJour = commandes.filter(c => jour(c.created_at) === aujourdHui);
  const caJour = cmdJour.reduce((s, c) => s + Number(c.total ?? 0), 0);

  const parCanal: Record<string, number> = {};
  for (const c of commandes) {
    const k = String(c.canal || 'inconnu').toLowerCase();
    parCanal[k] = (parCanal[k] || 0) + 1;
  }

  const livrees = commandes.filter(c => c.statut === 'livree').length;

  const notes = commandes.map(c => Number(c.note_client)).filter(n => n >= 1 && n <= 5);
  const noteMoyenne = notes.length
    ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 10) / 10
    : 0;

  const plats: Record<string, number> = {};
  for (const c of commandes) {
    for (const it of c.commande_items ?? []) {
      const nom = it.nom_produit || 'Divers';
      plats[nom] = (plats[nom] || 0) + (Number(it.quantite) || 1);
    }
  }
  const topPlats = Object.entries(plats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const produitsVendus = Object.values(plats).reduce((a, b) => a + b, 0);

  const serie7j: { jour: string; ca: number; nb: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const cmd = commandes.filter(c => jour(c.created_at) === key);
    serie7j.push({
      jour: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' }),
      ca: cmd.reduce((s, c) => s + Number(c.total ?? 0), 0),
      nb: cmd.length,
    });
  }

  // ---- CE QU'ON A PERDU EN ROUTE, SUR 7 JOURS.
  //
  // Un panier compose, un numero saisi, et puis rien. Le marchand n'avait
  // jusqu'ici aucun moyen de savoir que ces clients-la avaient existe.
  //
  // On se limite a sept jours parce que c'est le chiffre sur lequel on peut
  // encore agir : un panier perdu il y a trois semaines n'apprend plus rien, et
  // le cumul depuis toujours ne ferait que grossir sans jamais rien dire.
  //
  // Lecture separee et non bloquante : cette mesure est un bonus, elle ne doit
  // pas pouvoir priver le marchand de son chiffre d'affaires.
  let paniersPerdus = { nombre: 0, valeur: 0 };
  try {
    const ilYA7Jours = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: paniers } = await sb
      .from('paniers')
      .select('total')
      .eq('boutique_id', m.boutiqueId)
      .is('converti_le', null)
      .gte('maj_le', ilYA7Jours);

    paniersPerdus = {
      nombre: paniers?.length ?? 0,
      valeur: (paniers ?? []).reduce((s, p) => s + Number(p.total ?? 0), 0),
    };
  } catch (e) {
    console.error(`Stats — paniers perdus illisibles (${m.id}) :`, e);
  }

  // ---- LES COMMANDES QUI ATTENDENT UNE REPONSE DU CLIENT.
  //
  // Le pendant WhatsApp du panier abandonne : l'assistante a compris le panier,
  // ecrit la commande et demande confirmation — et le client n'a jamais
  // repondu. Ce sont des ventes a un mot pres, que le marchand ne distinguait
  // pas de ses commandes a preparer.
  let confirmationsAttendues = { nombre: 0, valeur: 0 };
  try {
    const { data: attente } = await sb
      .from('commandes')
      .select('total')
      .eq('boutique_id', m.boutiqueId)
      .eq('confirmation_statut', 'demandee')
      .eq('statut', 'en_attente');

    confirmationsAttendues = {
      nombre: attente?.length ?? 0,
      valeur: (attente ?? []).reduce((s, c) => s + Number(c.total ?? 0), 0),
    };
  } catch (e) {
    console.error(`Stats — confirmations en attente illisibles (${m.id}) :`, e);
  }

  // ---- LA BOUTIQUE EST-ELLE EN ETAT DE VENDRE ?
  //
  // Une boutique peut etre EN LIGNE sans etre BRANCHEE : vitrine visible,
  // commandes acceptees… et personne au bout. Constate en commandant chez un
  // marchand de test le 19 aout 2026 — la commande partait, le client n'etait
  // jamais prevenu faute de canal, les livreurs jamais alertes faute de groupe,
  // et SEUL LE CANAL TECHNIQUE le savait. Le marchand, lui, voyait une commande
  // arriver et croyait tout en ordre.
  //
  // On le lui dit donc chez lui, avec ce qui manque, plutot que de le laisser
  // decouvrir la panne par un client mecontent.
  let configuration: Record<string, boolean> | null = null;
  try {
    const [{ data: fiche }, { count: nbProduits }] = await Promise.all([
      sb
        .from('boutiques')
        .select('wasender_secret_id, telegram_secret_id, groupe_livreurs')
        .eq('id', m.boutiqueId)
        .maybeSingle(),
      sb
        .from('produits')
        .select('id', { count: 'exact', head: true })
        .eq('boutique_id', m.boutiqueId)
        .eq('disponible', true),
    ]);

    configuration = {
      // Sans canal, aucune notification ne part au client : ni confirmation,
      // ni livreur en route, ni demande d'avis.
      canalClient: Boolean(fiche?.wasender_secret_id || fiche?.telegram_secret_id),
      // Sans groupe, la course n'est proposee a personne.
      groupeLivreurs: Boolean(String(fiche?.groupe_livreurs ?? '').trim()),
      // Sans article disponible, la vitrine est vide.
      catalogue: (nbProduits ?? 0) > 0,
    };
  } catch (e) {
    // Un diagnostic illisible ne doit pas priver le marchand de ses chiffres.
    console.error(`Stats — configuration illisible (${m.id}) :`, e);
  }

  return Response.json({
    boutique_id: m.id,
    paniersPerdus,
    confirmationsAttendues,
    configuration,
    caTotal, caJour,
    nbCommandes: commandes.length, nbJour: cmdJour.length,
    livrees, enCours: commandes.length - livrees,
    parCanal, noteMoyenne, nbNotes: notes.length, topPlats,
    serie7j, produitsVendus,
    panierMoyen: commandes.length ? Math.round(caTotal / commandes.length) : 0,
  });
}
