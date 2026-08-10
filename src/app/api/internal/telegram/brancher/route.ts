import { NextResponse } from 'next/server';
import { brancherBotTelegram, urlWebhookTelegram } from '@/lib/telegramBranchement';

export const dynamic = 'force-dynamic';

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
