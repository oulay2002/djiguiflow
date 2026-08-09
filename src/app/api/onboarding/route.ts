import { NextResponse } from 'next/server';
import { estAdmin } from '@/lib/adminAuth';
import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/** Retrouve la boutique du compte connecté (possédée, ou défaut si admin). */
async function ficheDuConnecte(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return { sb: null as never, erreur: 'Base indisponible', statut: 503 };

  const entete = req.headers.get('authorization') ?? '';
  const token = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : '';
  if (!token) return { sb, erreur: 'Authentification requise.', statut: 401 };

  const { data, error } = await sb.auth.getUser(token);
  const utilisateur = data?.user;
  if (error || !utilisateur) return { sb, erreur: 'Session invalide ou expiree.', statut: 401 };

  // 1) La boutique POSSEDÉE par ce compte
  const { data: possedee } = await sb
    .from('boutiques')
    .select('*')
    .eq('user_id', utilisateur.id)
    .maybeSingle();
  if (possedee) return { sb, boutique: possedee, admin: estAdmin(utilisateur.email) };

   // 2) Admin sans boutique propre → boutique par défaut, sinon la 1ère
  if (estAdmin(utilisateur.email)) {
    let def: { id: string } | null = null;

    const marchand = await resoudreMarchand(null);
    if (marchand) {
      const r1 = await sb
        .from('boutiques')
        .select('id')
        .eq('id', marchand.boutiqueId)
        .maybeSingle();
      def = r1.data;
    }

    if (!def) {
      const r2 = await sb
        .from('boutiques')
        .select('id')
        .order('nom')
        .limit(1)
        .maybeSingle();
      def = r2.data;
    }

    if (def) {
      const r3 = await sb.from('boutiques').select('*').eq('id', def.id).maybeSingle();
      if (r3.data) return { sb, boutique: r3.data, admin: true };
    }

  return { sb, erreur: 'Aucune boutique liee a ce compte.', statut: 404 };
}

export async function GET(req: Request) {
  const r = await ficheDuConnecte(req);
  if ('erreur' in r) return NextResponse.json({ error: r.erreur }, { status: r.statut });
  return NextResponse.json(r.boutique);
}

export async function PATCH(req: Request) {
  const r = await ficheDuConnecte(req);
  if ('erreur' in r) return NextResponse.json({ error: r.erreur }, { status: r.statut });

  const body = await req.json();
  const autorises = [
    'telephone', 'telegram_marchand', 'groupe_livreurs',
    'sheet_commandes', 'sheet_menu', 'sheet_notes',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of autorises) {
    if (k in body && typeof body[k] === 'string') updates[k] = body[k].trim();
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Rien a mettre a jour.' }, { status: 400 });
  }

  const { data, error } = await r.sb
    .from('boutiques')
    .update(updates as never)
    .eq('id', r.boutique.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, boutique: data });
}