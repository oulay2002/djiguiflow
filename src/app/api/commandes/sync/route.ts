import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const b = await req.json();
  const reference = String(b.reference || b.order_id || '').trim();
  const boutique_id = String(b.boutique_id || '').trim();
  if (!reference || !boutique_id) {
    return Response.json({ error: 'reference et boutique_id requis' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Indisponible' }, { status: 503 });

  /**
   * Ne recopier que ce qui est reellement fourni.
   *
   * Cette route ecrasait chaque champ, meme absent de l'appel : une commande
   * enregistree avec son adresse la perdait des la premiere synchronisation,
   * `String(undefined || '')` valant la chaine vide. Constate le 12 aout 2026
   * sur deux commandes de test — adresse saisie, adresse disparue, et donc une
   * course impossible a livrer.
   *
   * Un champ absent veut dire « je n'en sais rien », pas « efface-le ».
   */
  const siFourni = (valeur: unknown): string | undefined => {
    if (valeur === undefined || valeur === null) return undefined;
    const t = String(valeur).trim();
    return t === '' ? undefined : t;
  };

  const payload: Record<string, unknown> = {};
  const poser = (colonne: string, valeur: string | undefined) => {
    if (valeur !== undefined) payload[colonne] = valeur;
  };

  poser('client_nom', siFourni(b.customer_name ?? b.nom));
  poser('client_telephone', siFourni(b.phone));
  poser('chat_id', siFourni(b.chat_id ?? b.phone));
  poser('client_adresse', siFourni(b.address));
  poser('canal', siFourni(b.canal));

  const total = Number(b.total_price ?? b.total);
  if (Number.isFinite(total) && total > 0) payload.total = total;

  const { data } = await sb
    .from('commandes')
    .select('reference')
    .eq('reference', reference)
    .maybeSingle();

  if (data) {
    // Ni `statut` ni `confirmation_statut` ici : ils appartiennent au cycle de
    // vie reel de la commande. Les forcer remettait a « en attente » une
    // commande deja en livraison, et annulait une confirmation que le client
    // venait de donner — c'est justement cet appel qui suit sa confirmation.
    if (Object.keys(payload).length === 0) {
      return Response.json({ ok: true, reference, maj: 'rien a mettre a jour' });
    }
    const { error } = await sb
      .from('commandes')
      .update(payload as never)
      .eq('reference', reference);
    if (error) return Response.json({ error: 'UPDATE: ' + error.message }, { status: 500 });
  } else {
    // A la creation seulement, l'etat de depart est connu.
    payload.statut = 'en_attente';
    if (!payload.client_nom) payload.client_nom = 'Client';
    if (!payload.canal) payload.canal = 'whatsapp';
    const { error } = await sb
      .from('commandes')
      .insert({ ...payload, reference, boutique_id } as never);
    if (error) return Response.json({ error: 'INSERT: ' + error.message }, { status: 500 });
  }

  // ---- id de la commande (pour les articles)
  const { data: cmd } = await sb
    .from('commandes')
    .select('id')
    .eq('reference', reference)
    .maybeSingle();
  if (!cmd) return Response.json({ error: 'commande introuvable après upsert' }, { status: 500 });

  // ---- articles : tableau d'objets, chaine JSON, ou texte « 2 x Soupe, Pizza »
  //
  // Le decoupage sur les virgules etait applique sans distinction. Une chaine
  // JSON comme [{"name":"Pizza","price":1500,"quantity":1}] se retrouvait donc
  // hachee en fragments — « "price": 1500 » — qui atterrissaient tels quels
  // dans nom_produit. Le bot WhatsApp envoyant ses articles sous cette forme,
  // tous les rapports par plat en etaient fausses.
  type Article = { nom: string; qte: number };

  const depuisObjet = (o: Record<string, unknown>): Article | null => {
    const nom = String(o.nom ?? o.name ?? o.plat ?? '').trim();
    if (!nom) return null;
    const q = Number(o.quantite ?? o.quantity ?? o['quantité'] ?? 1);
    return { nom, qte: Math.max(1, Number.isFinite(q) ? q : 1) };
  };

  const depuisTexte = (s: string): Article => {
    const m = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    return { qte: m ? Math.max(1, parseInt(m[1], 10)) : 1, nom: (m ? m[2] : s).trim() };
  };

  const extraireArticles = (raw: unknown): Article[] => {
    if (Array.isArray(raw)) {
      return raw
        .map((x) =>
          x && typeof x === 'object'
            ? depuisObjet(x as Record<string, unknown>)
            : depuisTexte(String(x)),
        )
        .filter((a): a is Article => Boolean(a?.nom));
    }

    const s = String(raw ?? '').trim();
    if (!s) return [];

    // Une chaine JSON se parse, elle ne se decoupe pas.
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const j: unknown = JSON.parse(s);
        const articles = (Array.isArray(j) ? j : [j])
          .map((x) =>
            x && typeof x === 'object' ? depuisObjet(x as Record<string, unknown>) : null,
          )
          .filter((a): a is Article => Boolean(a));
        if (articles.length) return articles;
      } catch {
        // Pas du JSON valide : on retombe sur la lecture en texte.
      }
    }

    return s.split(',').map((x) => depuisTexte(x.trim())).filter((a) => a.nom);
  };

  const parsed = extraireArticles(b.items);

  if (parsed.length) {
    // prix connus si possible (jamais bloquant)
    let priceMap = new Map<string, number>();
    try {
      const { data: prods } = await sb.from('produits').select('*').eq('boutique_id', boutique_id);
      priceMap = new Map(
        (prods || []).map((p: any) => [
          String(p.nom || '').toLowerCase(),
          Number(p.prix ?? p.prix_unitaire ?? 0) || 0,
        ])
      );
    } catch { /* prix inconnus → 0 */ }

    // idempotence : on remplace les anciens articles
    await sb.from('commande_items').delete().eq('commande_id', cmd.id);

    const rows = parsed.map((p) => ({
      commande_id: cmd.id,
      nom_produit: p.nom,
      quantite: p.qte,
      prix_unitaire: priceMap.get(p.nom.toLowerCase()) ?? 0,
    }));

    const { error: errItems } = await sb.from('commande_items').insert(rows as never);
    if (errItems) return Response.json({ error: 'ITEMS: ' + errItems.message }, { status: 500 });
  }

  return Response.json({ ok: true, reference, articles: parsed.length });
}