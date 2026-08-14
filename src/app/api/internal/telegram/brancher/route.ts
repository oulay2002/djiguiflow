import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { brancherBotTelegram, urlWebhookTelegram } from '@/lib/telegramBranchement';

export const dynamic = 'force-dynamic';

/**
 * Etat du branchement d'un marchand, sans rien reveler.
 *
 * Quand un bot reste muet, trois questions se posent : de quel bot parle-t-on,
 * vers ou pointe-t-il, et Telegram arrive-t-il a livrer. `getMe` et
 * `getWebhookInfo` y repondent ; le jeton, lui, ne quitte pas le serveur.
 */
export async function GET(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const slug = (new URL(req.url).searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const lecture = await sb.rpc('jeton_canal', { p_boutique: slug, p_canal: 'telegram' });

  const jeton = String(lecture.data ?? '').trim();
  if (!jeton) {
    return NextResponse.json(
      { slug, bot: null, webhook: null, raison: 'aucun jeton telegram pour ce marchand' },
      { status: 424 },
    );
  }

  try {
    const [me, hook] = await Promise.all([
      fetch(`https://api.telegram.org/bot${jeton}/getMe`).then((r) => r.json()),
      fetch(`https://api.telegram.org/bot${jeton}/getWebhookInfo`).then((r) => r.json()),
    ]);

    return NextResponse.json({
      slug,
      bot: me?.result?.username ?? null,
      attendu: urlWebhookTelegram(slug),
      webhook: {
        url: hook?.result?.url ?? '',
        en_attente: hook?.result?.pending_update_count ?? 0,
        secret_pose: Boolean(hook?.result?.has_custom_certificate === false && hook?.result?.url),
        derniere_erreur: hook?.result?.last_error_message ?? null,
      },
    });
  } catch (e) {
    console.error(`Telegram — diagnostic impossible (${slug}) :`, e);
    return NextResponse.json({ error: 'Telegram injoignable' }, { status: 502 });
  }
}

/**
 * Branche le bot Telegram d'un marchand, pour les outils et les scripts.
 *
 * Le marchand, lui, passe par l'onboarding : il colle le jeton de son bot et
 * le branchement se fait dans la foulee. Cette route sert a rebrancher un bot
 * apres coup — changement d'URL du routeur, rotation du secret — sans avoir a
 * redemander son jeton au marchand.
 *
 * La logique vit dans `@/lib/telegramBranchement`, partagee avec l'onboarding.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const slug = String(corps.slug ?? '').trim();
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const url = String(corps.url ?? '').trim() || urlWebhookTelegram(slug);
  if (!/^https:\/\/\S+$/.test(url)) {
    return NextResponse.json({ error: 'url https requise' }, { status: 400 });
  }

  const resultat = await brancherBotTelegram(slug, url);
  if (!resultat.ok) {
    return NextResponse.json({ error: resultat.raison }, { status: resultat.statut });
  }

  return NextResponse.json({ ok: true, slug, url: resultat.url });
}
