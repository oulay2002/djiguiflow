import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getBillingPlan } from '@/lib/billing/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Les acces qui arrivent a echeance, et le message a envoyer.
 *
 * En prepaye, rien ne se reconduit tout seul : le Mobile Money ivoirien n'offre
 * aucun mandat recurrent fiable. Sans relance, un marchand perd son acces un
 * matin sans avertissement — la meilleure facon de le perdre lui.
 *
 * On ne relance qu'a des jalons precis plutot que tous les jours. Une relance
 * quotidienne pendant une semaine se fait ignorer, puis detester ; et c'est le
 * jalon qui fait la dedup, sans table d'etat a tenir.
 */
const JALONS = [7, 3, 1, 0] as const;

type Echeance = {
  slug: string;
  nom: string;
  plan: string;
  jours: number;
  expire: boolean;
  message: string;
};

function composerMessage(nom: string, planNom: string, jours: number): string {
  const lien = 'https://www.djiguiflow.com/dashboard/paiements';

  if (jours <= 0) {
    return (
      `⛔ ${nom} — votre accès DjiguiFlow a expiré.\n\n` +
      `Le bot ne prend plus de commande et le tableau de bord est fermé. ` +
      `Vos données sont intactes : tout revient dès le paiement.\n\n${lien}`
    );
  }

  const quand = jours === 1 ? 'demain' : `dans ${jours} jours`;
  return (
    `⏳ ${nom} — votre formule ${planNom} se termine ${quand}.\n\n` +
    `Renouvelez avant l'échéance pour que le bot continue de prendre vos ` +
    `commandes sans interruption. Payable en Mobile Money, avec une remise ` +
    `si vous prenez plusieurs mois.\n\n${lien}`
  );
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });

  // Fenetre large a la lecture, tri fin ensuite : une seule requete plutot que
  // quatre, et le calcul du jalon se fait sur des dates completes.
  const borne = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
  const plancher = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: abonnements, error } = await sb
    .from('subscriptions')
    .select('user_id, plan_key, status, current_period_end')
    .not('current_period_end', 'is', null)
    .gte('current_period_end', plancher)
    .lte('current_period_end', borne);

  if (error) {
    console.error('Echeances — lecture impossible :', error);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 503 });
  }

  const concernes = (abonnements ?? []).filter((a) => {
    if (!a.current_period_end) return false;
    const fin = Date.parse(a.current_period_end);
    if (Number.isNaN(fin)) return false;
    const jours = Math.ceil((fin - Date.now()) / (24 * 60 * 60 * 1000));
    return (JALONS as readonly number[]).includes(Math.max(0, jours));
  });

  if (concernes.length === 0) {
    return NextResponse.json({ echeances: [], total: 0 });
  }

  // Ou joindre chacun. On passe par les boutiques : c'est la qu'est le slug,
  // et c'est le slug que les workflows d'envoi savent router.
  const { data: boutiques } = await sb
    .from('boutiques')
    .select('slug, nom, user_id')
    .in('user_id', concernes.map((a) => a.user_id));

  const echeances: Echeance[] = [];
  const vus = new Set<string>();

  for (const a of concernes) {
    const fin = Date.parse(a.current_period_end!);
    const jours = Math.max(0, Math.ceil((fin - Date.now()) / (24 * 60 * 60 * 1000)));
    const plan = getBillingPlan(a.plan_key ?? '');

    // La premiere boutique du compte porte la relance. L'abonnement est vendu
    // au compte, pas a la boutique : envoyer le meme rappel sur chacune ferait
    // sonner trois fois le meme gerant.
    const sienne = (boutiques ?? []).find((b) => b.user_id === a.user_id && b.slug);
    if (!sienne?.slug || vus.has(a.user_id)) continue;
    vus.add(a.user_id);

    echeances.push({
      slug: sienne.slug,
      nom: String(sienne.nom ?? sienne.slug),
      plan: plan?.key ?? String(a.plan_key ?? ''),
      jours,
      expire: jours <= 0,
      message: composerMessage(String(sienne.nom ?? sienne.slug), plan?.name ?? 'actuelle', jours),
    });
  }

  return NextResponse.json({ echeances, total: echeances.length });
}
