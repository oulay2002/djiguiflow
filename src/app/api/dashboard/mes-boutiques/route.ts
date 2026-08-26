import { NextResponse } from 'next/server';
import { estAdmin } from '@/lib/adminAuth';
import { listerMarchands } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Registre VU PAR le selecteur du dashboard.
 * - Admin plateforme : toutes les boutiques (il les pilote toutes).
 * - Marchand : uniquement les boutiques qu'il possede.
 * Le registre public (/api/marchands) reste ouvert pour la vitrine ;
 * ici on expose « qui pilote quoi ».
 */
export async function GET(req: Request) {
  const entete = req.headers.get('authorization') ?? '';
  const token = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : '';
  if (!token) return NextResponse.json({ marchands: [] }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ marchands: [] }, { status: 503 });

  const { data, error } = await sb.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return NextResponse.json({ marchands: [] }, { status: 401 });

  const registre = await listerMarchands();

  // Admin : tout le registre
  if (estAdmin(user.email, user.id)) {
    return NextResponse.json({ marchands: registre });
  }

  // Marchand : seulement ses boutiques
  const { data: miennes, error: err } = await sb
    .from('boutiques')
    .select('id')
    .eq('user_id', user.id);
  if (err) return NextResponse.json({ marchands: [] }, { status: 503 });

  const ids = new Set((miennes ?? []).map(b => b.id));
  return NextResponse.json({
    marchands: registre.filter(m => ids.has(m.boutiqueId)),
  });
}