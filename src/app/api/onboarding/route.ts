import { NextResponse } from 'next/server';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// GET : renvoyer la fiche actuel du marchand connecté
export async function GET(req: Request) {
  const acces = await exigerAccesMarchand(req);
  if (!acces.ok) return NextResponse.json({ error: acces.message }, { status: acces.statut });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('boutiques')
    .select('*')
    .eq('id', acces.marchand.boutiqueId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH : mettre à jour la fiche (WhatsApp, Telegram, groupe, sheets)
export async function PATCH(req: Request) {
  const acces = await exigerAccesMarchand(req);
  if (!acces.ok) return NextResponse.json({ error: acces.message }, { status: acces.statut });

  const body = await req.json();
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  // Whitelist des champs modifiables
  const autorises = [
    'telephone', 'telegram_marchand', 'groupe_livreurs',
    'sheet_commandes', 'sheet_menu', 'sheet_notes'
  ];
  const updates: Record<string, unknown> = {};
  for (const k of autorises) {
    if (k in body && typeof body[k] === 'string') {
      updates[k] = body[k].trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('boutiques')
    .update(updates as never)
    .eq('id', acces.marchand.boutiqueId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, boutique: data });
}