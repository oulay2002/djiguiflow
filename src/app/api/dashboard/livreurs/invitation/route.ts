import { NextResponse } from 'next/server';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { genererCodeInvitation, lienInvitation, nomBotTelegram } from '@/lib/livreurs';

export const dynamic = 'force-dynamic';

/**
 * Lien d'invitation a envoyer a un livreur.
 *
 * Le marchand transmet ce lien a son livreur — WhatsApp, SMS, peu importe. Le
 * livreur l'ouvre une fois, et sa fiche se rattache toute seule a son compte
 * Telegram. C'est le seul geste de toute la chaine, et il n'est pas pour le
 * marchand.
 *
 * Le code est fabrique ici, cote serveur, et jamais dans le navigateur : le
 * presenter suffit a se declarer livreur de cette boutique.
 *
 * `regenerer` sert au cas ou le livreur change de telephone ou de compte
 * Telegram. Il detache le compte actuel ET tire un nouveau code : l'ancien lien,
 * peut-etre transfere entre-temps, cesse de valoir.
 */
export async function POST(req: Request) {
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps) return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });

  const livreurId = String(corps.livreur_id ?? '').trim();
  const slug = String(corps.boutique ?? '').trim();
  const regenerer = corps.regenerer === true;

  if (!livreurId) {
    return NextResponse.json({ error: 'livreur_id requis' }, { status: 400 });
  }

  const acces = await exigerAccesMarchand(req, slug);
  if (!acces.ok) return NextResponse.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  // La fiche doit relever de la boutique de l'appelant : sans ce controle, un
  // marchand connecte pourrait tirer le lien d'invitation d'un livreur d'autrui
  // et s'y substituer.
  const { data: livreur, error } = await sb
    .from('livreurs')
    .select('id, nom, telegram_id, code_invitation')
    .eq('id', livreurId)
    .eq('boutique_id', m.boutiqueId)
    .maybeSingle();

  if (error) {
    console.error(`Invitation — lecture impossible (${livreurId}) :`, error.message);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 });
  }
  if (!livreur) {
    return NextResponse.json({ error: 'Livreur introuvable' }, { status: 404 });
  }

  if (livreur.telegram_id && !regenerer) {
    return NextResponse.json({
      ok: true,
      rattache: true,
      nom: String(livreur.nom ?? ''),
    });
  }

  let code = String(livreur.code_invitation ?? '').trim();

  if (!code || regenerer) {
    code = genererCodeInvitation();
    const { error: erreurMaj } = await sb
      .from('livreurs')
      .update({
        code_invitation: code,
        ...(regenerer ? { telegram_id: null, rattache_le: null } : {}),
      })
      .eq('id', livreurId)
      .eq('boutique_id', m.boutiqueId);

    if (erreurMaj) {
      console.error(`Invitation — code non enregistre (${livreurId}) :`, erreurMaj.message);
      return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
    }
  }

  // Sans nom de bot, pas de lien possible. On rend le code quand meme et on le
  // dit : c'est une configuration incomplete du marchand, pas une panne, et
  // l'ecran doit pouvoir l'expliquer plutot que d'afficher une erreur muette.
  const bot = await nomBotTelegram(m.id);
  if (!bot) {
    return NextResponse.json({
      ok: false,
      rattache: false,
      code,
      raison: 'Le bot Telegram de la boutique n’est pas encore connecté.',
    });
  }

  return NextResponse.json({
    ok: true,
    rattache: false,
    nom: String(livreur.nom ?? ''),
    bot,
    code,
    lien: lienInvitation(bot, code),
  });
}
