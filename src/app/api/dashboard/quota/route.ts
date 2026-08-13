import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { etatQuota } from '@/lib/billing/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ou en est le marchand de son plafond de commandes.
 *
 * Lecture seule, pour son propre compte : le quota est vendu au compte, et
 * personne n'a a connaitre la consommation d'un autre.
 */
export async function GET(request: Request) {
  const entete = request.headers.get('authorization') ?? '';
  const token = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: 'Configuration Supabase manquante.' }, { status: 500 });
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  const etat = await etatQuota(user.id);
  if (!etat) {
    // On ne bloque pas sur une panne de lecture : l'ecran affichera simplement
    // qu'il ne sait pas, plutot que d'annoncer un faux zero.
    return NextResponse.json({ quota: null, warning: 'Comptage indisponible.' });
  }

  return NextResponse.json({
    quota: {
      plan: etat.plan.key,
      planNom: etat.plan.name,
      inclus: etat.quota,
      utilise: etat.utilise,
      restant: etat.restant,
      niveau: etat.niveau,
      bloque: etat.bloque,
      exempt: etat.exempt,
      fenetreDebut: etat.fenetreDebut,
      fenetreFin: etat.fenetreFin,
    },
  });
}
