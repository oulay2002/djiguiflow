import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le secret d'entree du marchand, verifie ici plutot que dans n8n.
 *
 * Le fournisseur (wasender) signe chaque webhook avec un secret propre au
 * marchand. Le comparer dans un noeud n8n obligeait a ecrire un secret en dur
 * dans le workflow, donc a n'en avoir qu'un pour tout le monde : le webhook
 * d'un marchand acceptait les messages de n'importe quel autre. La fiche est
 * le bon endroit — c'est le seul appel qui connait deja de quel marchand on
 * parle, et le secret n'a plus a quitter la base.
 *
 * `webhook_secret_hash` a NULL vaut « marchand pas encore migre » : on sert la
 * fiche sans second facteur, comme avant. La route reste protegee par
 * SYNC_SECRET dans tous les cas.
 */
function secretWebhookValide(recu: string | null, empreinteAttendue: unknown): boolean {
  const attendu = String(empreinteAttendue ?? '').trim();
  if (!attendu) return true;
  if (!recu) return false;

  const a = Buffer.from(createHash('sha256').update(recu, 'utf8').digest('hex'), 'utf8');
  const b = Buffer.from(attendu, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ error: 'slug requis' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  let data: unknown = null;

  // 1) par ID uuid (si le slug en est un)
  if (UUID_RE.test(slug)) {
    const r = await sb.from('boutiques').select('*').eq('id', slug).maybeSingle();
    data = r.data;
  }

  // 2) par slug exact
  if (!data) {
    const r = await sb.from('boutiques').select('*').eq('slug', slug).maybeSingle();
    data = r.data;
  }

  // 3) par nom (contient)
  if (!data) {
    const r = await sb
      .from('boutiques')
      .select('*')
      .ilike('nom', `%${slug}%`)
      .maybeSingle();
    data = r.data;
  }

  if (!data) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 });

  const fiche = data as { webhook_secret_hash?: string | null };
  if (!secretWebhookValide(req.headers.get('x-webhook-secret'), fiche.webhook_secret_hash)) {
    console.warn(`Fiche — secret webhook invalide pour « ${slug} »`);
    return NextResponse.json({ error: 'Secret webhook invalide' }, { status: 401 });
  }

  // L'empreinte ne ressort jamais : n8n n'a aucune raison de la connaitre.
  const publique = { ...fiche };
  delete publique.webhook_secret_hash;
  return NextResponse.json(publique);
}