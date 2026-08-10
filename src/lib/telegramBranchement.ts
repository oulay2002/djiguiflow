import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Branchement du bot Telegram d'un marchand sur son propre webhook.
 *
 * Un bot Telegram porte un jeton, donc un marchand. Le noeud « Telegram
 * Trigger » de n8n lie un workflow a une credential : un marchand de plus
 * imposait un workflow de plus, a la main. On fait l'inverse — c'est le bot du
 * marchand qui vient viser une URL portant son slug, comme le webhook
 * wasender. Un seul routeur sert alors tout le monde.
 *
 * Le `secret_token` est tire ici et n'est jamais rendu : Telegram le renvoie
 * dans l'en-tete `X-Telegram-Bot-Api-Secret-Token` de chaque mise a jour, et
 * seule son empreinte est conservee. Un marchand ne peut donc pas se faire
 * passer pour un autre.
 */

/** Racine du routeur Telegram n8n ; le slug du marchand y est ajoute. */
export const URL_ROUTEUR_TELEGRAM =
  process.env.N8N_TELEGRAM_WEBHOOK_URL?.trim() ||
  'https://oulai2002.app.n8n.cloud/webhook/c66464e0-8c2a-4c86-8d4f-36e126bfc108/telegram';

export type ResultatBranchement =
  | { ok: true; url: string }
  | { ok: false; raison: string; statut: number };

export function urlWebhookTelegram(slug: string): string {
  return `${URL_ROUTEUR_TELEGRAM.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`;
}

export async function brancherBotTelegram(
  slug: string,
  url = urlWebhookTelegram(slug),
): Promise<ResultatBranchement> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, raison: 'Base indisponible', statut: 503 };

  // Le jeton du bot sort du Vault et ne va nulle part ailleurs qu'a Telegram.
  const lecture = (await sb.rpc(
    'jeton_canal' as never,
    { p_boutique: slug, p_canal: 'telegram' } as never,
  )) as { data: string | null; error: { message: string } | null };

  if (lecture.error) {
    console.error(`Telegram — lecture du jeton impossible (${slug}) :`, lecture.error.message);
    return { ok: false, raison: 'Jeton illisible', statut: 502 };
  }

  const jeton = String(lecture.data ?? '').trim();
  if (!jeton) {
    return {
      ok: false,
      raison: `Aucun jeton telegram pour ${slug} : le bot doit d'abord être enregistré.`,
      statut: 424,
    };
  }

  // Telegram n'accepte que A-Z a-z 0-9 _ - dans le secret_token.
  const secretToken = randomBytes(32).toString('base64url');

  let reponse: { ok?: boolean; description?: string };
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
    reponse = (await res.json()) as { ok?: boolean; description?: string };
  } catch (e) {
    console.error(`Telegram — setWebhook injoignable (${slug}) :`, e);
    return { ok: false, raison: 'Telegram injoignable', statut: 502 };
  }

  if (!reponse.ok) {
    console.error(`Telegram — setWebhook refuse (${slug}) :`, reponse.description);
    return {
      ok: false,
      raison: reponse.description || 'setWebhook refusé',
      statut: 502,
    };
  }

  // L'empreinte n'est posee qu'apres l'acceptation de Telegram : sinon on
  // rejetterait les mises a jour encore signees par l'ancien secret.
  const pose = (await sb.rpc(
    'definir_secret_webhook_telegram' as never,
    { p_slug: slug, p_secret: secretToken } as never,
  )) as { error: { message: string } | null };

  if (pose.error) {
    console.error(`Telegram — empreinte non posee (${slug}) :`, pose.error.message);
    return { ok: false, raison: 'Empreinte non enregistrée', statut: 502 };
  }

  return { ok: true, url };
}
