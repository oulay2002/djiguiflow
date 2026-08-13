import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { etatQuota } from '@/lib/billing/quota';

export const dynamic = 'force-dynamic';

/**
 * Donnees des rapports, pour les workflows n8n.
 *
 * Les workflows de reporting calculaient depuis Google Sheets, devenue un
 * miroir best-effort depuis que Supabase fait foi : un rapport pouvait
 * sous-declarer le chiffre d'affaires sans que rien ne le signale. Les
 * calculs vivent maintenant en base, et cette route les expose — n8n Cloud ne
 * pouvant pas ouvrir de connexion Postgres vers Supabase, faute de route IPv6.
 *
 * Tout est groupe par boutique : chaque marchand peut recevoir son rapport.
 * La mise en forme du message reste dans n8n, qui la maitrise mieux.
 */

type Periode = 'jour' | 'semaine';

type ReponseRpc<T> = { data: T[] | null; error: { message: string } | null };

async function appeler<T>(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  fonction: string,
  args: Record<string, string> = {},
): Promise<T[]> {
  const reponse = (await sb.rpc(fonction as never, args as never)) as ReponseRpc<T>;
  if (reponse.error) {
    throw new Error(`${fonction} : ${reponse.error.message}`);
  }
  return reponse.data ?? [];
}

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

  const type = String(corps.type ?? '').trim();
  const periode: Periode = corps.periode === 'semaine' ? 'semaine' : 'jour';

  /**
   * Restriction a une boutique.
   *
   * Les fonctions de rapport calculent sur toute la plateforme et marquent
   * chaque ligne de son `slug` : sans filtre, le tableau de bord Telegram d'un
   * marchand lui montrait le chiffre d'affaires, les meilleurs clients et les
   * telephones de tous les autres. Les rapports globaux (resume quotidien,
   * hebdo) continuent d'appeler sans `boutique` et voient tout.
   */
  const boutique = String(corps.boutique ?? corps.slug ?? '').trim();
  const restreindre = <T>(lignes: T[]): T[] =>
    boutique
      ? lignes.filter((l) => String((l as { slug?: unknown }).slug ?? '').trim() === boutique)
      : lignes;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Service indisponible' }, { status: 503 });

  /**
   * Attache a chaque boutique l'etat du plafond de son proprietaire.
   *
   * C'est le resume quotidien qui portera l'alerte : le marchand le lit deja
   * chaque soir, sur son propre canal. Lui construire un workflow d'alerte
   * separe l'aurait fait sonner une fois de plus pour une information qui a sa
   * place dans le bilan du jour.
   *
   * Le quota se compte par COMPTE, pas par boutique : deux boutiques du meme
   * proprietaire partagent le meme plafond et affichent donc le meme chiffre.
   * On ne calcule qu'une fois par proprietaire.
   */
  async function avecQuota<T extends { slug?: unknown }>(
    client: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
    lignes: T[],
  ): Promise<T[]> {
    if (lignes.length === 0) return lignes;

    const slugs = lignes.map((l) => String(l.slug ?? '').trim()).filter(Boolean);
    if (slugs.length === 0) return lignes;

    const { data: proprietaires } = await client
      .from('boutiques')
      .select('slug, user_id')
      .in('slug', slugs);

    const parSlug = new Map<string, string>();
    for (const b of proprietaires ?? []) {
      if (b.slug && b.user_id) parSlug.set(b.slug, b.user_id);
    }

    const etats = new Map<string, Awaited<ReturnType<typeof etatQuota>>>();
    for (const userId of new Set(parSlug.values())) {
      etats.set(userId, await etatQuota(userId));
    }

    return lignes.map((l) => {
      const userId = parSlug.get(String(l.slug ?? '').trim());
      const etat = userId ? etats.get(userId) : null;
      // Une lecture manquee n'invente pas de chiffres : le resume omettra
      // simplement la ligne du plafond.
      if (!etat || etat.exempt) return l;
      return {
        ...l,
        quota_inclus: etat.quota,
        quota_utilise: etat.utilise,
        quota_restant: etat.restant,
        quota_niveau: etat.niveau,
      };
    });
  }

  try {
    if (type === 'retards') {
      const lignes = restreindre(await appeler(sb, 'rapport_retards'));
      return Response.json({ type, lignes, total: lignes.length });
    }

    if (type === 'stocks') {
      // Seuls les produits sous seuil interessent une alerte : renvoyer le
      // catalogue entier obligerait n8n a le filtrer pour rien.
      const tout = restreindre(await appeler<{ niveau: string }>(sb, 'rapport_stocks'));
      const lignes = tout.filter((p) => p.niveau !== 'ok');
      return Response.json({ type, lignes, total: lignes.length });
    }

    if (type === 'activite') {
      const [boutiques, plats] = await Promise.all([
        appeler<{ slug?: string }>(sb, 'rapport_activite', { p_periode: periode }),
        appeler(sb, 'rapport_top_plats', { p_periode: periode }),
      ]);
      const vues = await avecQuota(sb, restreindre(boutiques));
      return Response.json({ type, periode, boutiques: vues, plats: restreindre(plats), total: vues.length });
    }

    if (type === 'clients') {
      const lignes = restreindre(await appeler(sb, 'rapport_clients', { p_periode: periode }));
      return Response.json({ type, periode, lignes, total: lignes.length });
    }

    // Le tableau de bord Telegram du gerant repond a huit commandes qui
    // piochent chacune dans un jeu different. Un seul aller-retour les sert
    // toutes : la commande est manuelle et rare, la latence importe moins que
    // la simplicite du cablage.
    if (type === 'dashboard') {
      const [jour, semaine, tout, platsJour, platsTout, clients, retards, stocks] =
        await Promise.all([
          appeler(sb, 'rapport_activite', { p_periode: 'jour' }),
          appeler(sb, 'rapport_activite', { p_periode: 'semaine' }),
          appeler(sb, 'rapport_activite', { p_periode: 'tout' }),
          appeler(sb, 'rapport_top_plats', { p_periode: 'jour' }),
          appeler(sb, 'rapport_top_plats', { p_periode: 'tout' }),
          appeler(sb, 'rapport_clients', { p_periode: 'tout' }),
          appeler(sb, 'rapport_retards'),
          appeler<{ niveau: string }>(sb, 'rapport_stocks'),
        ]);

      return Response.json({
        type,
        boutique: boutique || null,
        jour: restreindre(jour),
        semaine: restreindre(semaine),
        tout: restreindre(tout),
        plats_jour: restreindre(platsJour),
        plats_tout: restreindre(platsTout),
        clients: restreindre(clients),
        retards: restreindre(retards),
        stocks: restreindre(stocks).filter((p) => p.niveau !== 'ok'),
      });
    }

    return Response.json(
      { error: "type doit valoir 'retards', 'stocks', 'activite', 'clients' ou 'dashboard'" },
      { status: 400 },
    );
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'erreur inconnue';
    console.error(`Rapports — ${type} impossible :`, raison);
    return Response.json({ error: 'Rapport indisponible' }, { status: 503 });
  }
}
