import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Decompte le stock d'une commande — une fois, et une seule.
 *
 * POURQUOI CETTE ROUTE EXISTE. Le stock ne se decomptait que sur la vitrine.
 * Une commande prise par l'assistante — c'est-a-dire la majorite d'entre elles —
 * n'y touchait pas : Rose Monde a vendu trois ensembles enfant en affichant
 * toujours 12 sur 12. Le marchand devait refaire son inventaire a la main apres
 * chaque vente, ce qui vide de son sens le suivi de stock.
 *
 * LE VERROU EST DANS L'ECRITURE, PAS DANS UNE LECTURE PREALABLE. On reserve le
 * decompte par un `update … where stock_decremente_le is null` : deux appels
 * simultanes, un reessai de n8n ou deux clics du livreur ne peuvent pas vider le
 * stock deux fois. Lire puis ecrire aurait laisse la fenetre grande ouverte.
 *
 * ON RESERVE AVANT DE DECOMPTER. Si le decompte echoue a mi-parcours, le stock
 * est partiellement a jour et la commande marquee : on ne rejoue pas. C'est
 * volontaire — un stock legerement trop haut se corrige d'un inventaire, un
 * stock decompte deux fois fait refuser des ventes bien reelles.
 */

type Article = {
  nom_produit: string | null;
  quantite: number | null;
  produit_id: string | null;
};

/** Deux ecritures d'un meme nom ne doivent pas designer deux produits. */
const cle = (nom: unknown) =>
  String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const reference = String(corps.reference ?? corps.order_id ?? '').trim();
  if (!reference) return Response.json({ error: 'reference requise' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  // ---- 1. Reserver. C'est cette ecriture qui fait office de verrou.
  const { data: commande, error: errReserve } = await sb
    .from('commandes')
    .update({ stock_decremente_le: new Date().toISOString() })
    .eq('reference', reference)
    .is('stock_decremente_le', null)
    .select('id, boutique_id')
    .maybeSingle();

  if (errReserve) {
    console.error(`Stock ${reference} — reservation impossible :`, errReserve.message);
    return Response.json({ error: 'Reservation impossible' }, { status: 503 });
  }

  // Aucune ligne : soit la commande n'existe pas, soit elle est deja decomptee.
  // Les deux se repondent pareil — il n'y a rien a faire, et surtout rien a
  // signaler comme une erreur : n8n rejoue parfois, c'est normal.
  if (!commande) {
    return Response.json({ ok: true, etat: 'deja_decompte_ou_inconnue', reference });
  }

  // ---- 2. Ce qui a ete commande.
  const { data: articles } = await sb
    .from('commande_items')
    .select('nom_produit, quantite, produit_id')
    .eq('commande_id', commande.id);

  const lignes = (articles ?? []) as Article[];
  if (!lignes.length) {
    return Response.json({ ok: true, etat: 'aucun_article', reference, decomptes: 0 });
  }

  // ---- 3. Retrouver les produits.
  //
  // `produit_id` est vide sur tout ce qui vient de l'assistante : elle ecrit un
  // NOM, pas une reference. On rattache donc par le nom, a l'interieur de la
  // boutique — jamais au-dela, deux enseignes pouvant vendre « Salade Cesar ».
  const { data: produits } = await sb
    .from('produits')
    .select('id, nom, stock')
    .eq('boutique_id', commande.boutique_id);

  const parNom = new Map<string, { id: string; stock: number | null }>();
  for (const p of produits ?? []) {
    parNom.set(cle(p.nom), { id: String(p.id), stock: p.stock === null ? null : Number(p.stock) });
  }

  const decomptes: { produit: string; quantite: number; restant: number | null }[] = [];
  const introuvables: string[] = [];

  for (const l of lignes) {
    const quantite = Math.max(1, Number(l.quantite) || 1);
    const trouve = l.produit_id
      ? { id: l.produit_id, stock: 0 }
      : parNom.get(cle(l.nom_produit));

    if (!trouve) {
      introuvables.push(String(l.nom_produit ?? '(sans nom)'));
      continue;
    }

    // La soustraction se fait DANS la base : le client Supabase ne sait pas
    // ecrire `stock = stock - 2`, et deux commandes simultanees liraient sinon
    // la meme valeur pour n'en decompter qu'une.
    const { data: restant, error } = await sb.rpc('decrementer_stock', {
      p_produit: trouve.id,
      p_quantite: quantite,
    });

    if (error) {
      console.error(`Stock ${reference} — decompte refuse (${l.nom_produit}) :`, error.message);
      introuvables.push(String(l.nom_produit ?? '(sans nom)'));
      continue;
    }

    decomptes.push({
      produit: String(l.nom_produit ?? ''),
      quantite,
      restant: restant === null || restant === undefined ? null : Number(restant),
    });

    // Rattacher l'article a son produit, tant qu'on le tient. La prochaine fois,
    // le rattachement par nom ne sera plus necessaire — et le jour ou le
    // marchand renomme son article, l'historique reste juste.
    if (!l.produit_id) {
      await sb
        .from('commande_items')
        .update({ produit_id: trouve.id })
        .eq('commande_id', commande.id)
        .eq('nom_produit', l.nom_produit ?? '');
    }
  }

  // Un article introuvable n'est pas une panne : le marchand a pu le retirer de
  // son catalogue depuis. On le dit, sans rien casser.
  if (introuvables.length) {
    console.error(`Stock ${reference} — articles non rattaches : ${introuvables.join(', ')}`);
  }

  return Response.json({
    ok: true,
    etat: 'decompte',
    reference,
    decomptes,
    introuvables,
  });
}
