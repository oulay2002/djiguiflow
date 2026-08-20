import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Contexte d'une boutique, pour les workflows n8n.
 *
 * n8n Cloud ne peut pas joindre Supabase en connexion directe : l'hote est
 * joignable en IPv6 uniquement et le reseau de n8n n'a pas de route IPv6
 * (`connect ENETUNREACH`). Passer par cette route en HTTPS contourne le
 * probleme, et surtout elle ne renvoie jamais de jeton : ceux-ci resteraient
 * sinon dans les donnees d'execution que n8n conserve.
 *
 * On resout par boutique (slug ou uuid), par session WhatsApp, ou par
 * commande — selon ce que l'appelant connait.
 */

type Contexte = {
  boutique_id: string;
  slug: string;
  nom: string;
  sheet_commandes: string | null;
  sheet_menu: string | null;
  groupe_livreurs: string | null;
  telephone: string | null;
  /**
   * Chat Telegram du gerant. Sans lui, les workflows qui previennent le
   * marchand n'avaient d'autre choix que WhatsApp : celui qui ne tient que
   * Telegram n'apprenait jamais qu'une commande venait d'arriver.
   */
  telegram_marchand: string | null;
};

/**
 * Ce que la fiche ne dit pas : de quels canaux le marchand dispose REELLEMENT.
 *
 * « Nouvelle Commande → Marchand » prevenait sur WhatsApp ET sur Telegram, sans
 * demander. Un marchand qui n'a pas connecte WhatsApp — c'est-a-dire tout
 * nouvel inscrit — declenchait donc une alerte technique A CHAQUE COMMANDE,
 * alors qu'il etait parfaitement prevenu par Telegram. Cette noyade finit par
 * masquer les vraies pannes.
 *
 * On ne touche pas aux fonctions `canaux_par_*` pour autant : trois signatures
 * a migrer pour deux booleens, c'est cher paye. Une seconde lecture suffit.
 */
type Equipement = { whatsapp_connecte: boolean; telegram_connecte: boolean };

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

  const boutique = String(corps.boutique ?? corps.boutique_id ?? '').trim();
  const session = String(corps.session ?? corps.sessionId ?? '').trim();
  const commande = String(corps.commande ?? corps.commande_id ?? '').trim();

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Service indisponible' }, { status: 503 });

  // Ordre volontaire : le plus precis d'abord.
  const [fonction, argument] = commande
    ? (['canaux_par_commande', { p_commande: commande }] as const)
    : session
      ? (['canaux_par_session', { p_session_id: session }] as const)
      : boutique
        ? (['canaux_par_slug', { p_slug: boutique }] as const)
        : ([null, null] as const);

  if (!fonction) {
    return Response.json(
      { error: 'boutique, session ou commande requis' },
      { status: 400 },
    );
  }

  // Le nom vient de tuples `as const` : il est deja une union de litteraux, et
  // le compilateur verifie donc qu'il designe une fonction declaree. Seule la
  // forme des arguments, variable selon la branche, echappe encore.
  const reponse = (await sb.rpc(fonction, argument as never)) as {
    data: Contexte[] | null;
    error: { message: string } | null;
  };

  if (reponse.error) {
    console.error(`Contexte — resolution impossible (${fonction}) :`, reponse.error.message);
    return Response.json({ error: 'Resolution impossible' }, { status: 503 });
  }

  const contexte = reponse.data?.[0];
  if (!contexte) {
    // 404 et non 200 avec un objet vide : un workflow doit pouvoir distinguer
    // « boutique inconnue » de « boutique sans groupe de livreurs ».
    return Response.json({ error: 'Boutique introuvable' }, { status: 404 });
  }

  // Un echec de cette lecture ne doit pas priver l'appelant de son contexte :
  // on retombe sur « equipe des deux », c'est-a-dire le comportement d'avant.
  let equipement: Equipement = { whatsapp_connecte: true, telegram_connecte: true };
  try {
    const { data: fiche } = await sb
      .from('boutiques')
      .select('wasender_secret_id, telegram_secret_id')
      .eq('id', contexte.boutique_id)
      .maybeSingle();

    if (fiche) {
      equipement = {
        whatsapp_connecte: Boolean(fiche.wasender_secret_id),
        telegram_connecte: Boolean(fiche.telegram_secret_id),
      };
    }
  } catch (e) {
    console.error(`Contexte — equipement illisible (${contexte.slug}) :`, e);
  }

  return Response.json({ ...contexte, ...equipement });
}
