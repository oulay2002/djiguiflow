import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Branche le bot Telegram d'un marchand sur son propre webhook.
 *
 * Un bot Telegram porte un jeton, donc un marchand. Le noeud « Telegram
 * Trigger » de n8n lie un workflow a une credential : un marchand de plus
 * imposait un workflow de plus, a la main. On fait l'inverse — c'est le bot du
 * marchand qui vient viser une URL portant son slug, exactement comme le
 * webhook wasender. Un seul routeur sert alors tout le monde.
 *
 * Le `secret_token` est tire ici, jamais montre a l'appelant : Telegram le
 * renverra dans l'en-tete `X-Telegram-Bot-Api-Secret-Token` de chaque mise a
 * jour, et seule son empreinte est conservee, cote base. Un marchand ne peut
 * donc pas se faire passer pour un autre.
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
  const url = String(corps.url ?? '').trim();
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });
  if (!/^https:\/\/\S+$/.test(url)) {
    return NextResponse.json({ error: 'url https requise' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  // Le jeton du bot sort du Vault et ne va nulle part ailleurs qu'a Telegram.
  const lecture = (await sb.rpc(
    'jeton_canal' as never,
    { p_boutique: slug, p_canal: 'telegram' } as never,
  )) as { data: string | null; error: { message: string } | null };

  if (lecture.error) {
    console.error(`Telegram — lecture du jeton impossible (${slug}) :`, lecture.error.message);
    return NextResponse.json({ error: 'Jeton illisible' }, { status: 502 });
  }

  const jeton = String(lecture.data ?? '').trim();
  if (!jeton) {
    return NextResponse.json(
      { error: `Aucun jeton telegram pour ${slug} : le marchand doit d'abord connecter son bot.` },
      { status: 424 },
    );
  }

  // Telegram n'accepte que A-Z a-z 0-9 _ - dans le secret_token.
  const secretToken = randomBytes(32).toString('base64url');

  let reponseTelegram: { ok?: boolean; description?: string };
  try {
    const res = await fetch(`https://api.telegram.org/bot${jeton}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: false,
      }),
    });
    reponseTelegram = (await res.json()) as { ok?: boolean; description?: string };
  } catch (e) {
    console.error(`Telegram — setWebhook injoignable (${slug}) :`, e);
    return NextResponse.json({ error: 'Telegram injoignable' }, { status: 502 });
  }

  if (!reponseTelegram.ok) {
    console.error(`Telegram — setWebhook refuse (${slug}) :`, reponseTelegram.description);
    return NextResponse.json(
      { error: 'setWebhook refusé', raison: reponseTelegram.description ?? '' },
      { status: 502 },
    );
  }

  // L'empreinte n'est posee qu'apres l'acceptation de Telegram : sinon on
  // rejetterait les mises a jour encore signees par l'ancien secret.
  const pose = (await sb.rpc(
    'definir_secret_webhook_telegram' as never,
    { p_slug: slug, p_secret: secretToken } as never,
  )) as { error: { message: string } | null };

  if (pose.error) {
    console.error(`Telegram — empreinte non posee (${slug}) :`, pose.error.message);
    return NextResponse.json({ error: 'Empreinte non enregistrée' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, slug, url });
}
