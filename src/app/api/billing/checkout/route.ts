import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getBillingPlan, montantPrepaye, DUREES_PREPAYEES } from '@/lib/billing/plans';
import { isMockBillingMode } from '@/lib/billing/mode';
import { cinetpayConfigure, initialiserPaiement } from '@/lib/billing/cinetpay';

export const runtime = 'nodejs';

/**
 * Ouverture d'un paiement prepaye.
 *
 * Le marchand achete une DUREE, pas un abonnement : le Mobile Money ivoirien
 * ne sait pas prelever tout seul. On enregistre l'intention, on ouvre la
 * transaction chez le prestataire, et c'est sa notification — verifiee — qui
 * ouvrira les droits. Rien n'est accorde ici.
 */

type CorpsRequete = {
  plan?: string;
  mois?: number;
};

/**
 * Ce que lit le marchand quand l'encaissement ne peut pas s'ouvrir — que les
 * cles manquent ou que le prestataire soit injoignable.
 *
 * Les deux cas se ressemblent de son point de vue : il veut payer, il ne peut
 * pas, et il n'y est pour rien. Une seule phrase, definie une seule fois, pour
 * que les deux chemins ne divergent pas.
 */
const PAIEMENT_INDISPONIBLE =
  "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous et nous "
  + 'activons votre formule à la main, sans attendre.';

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

function getAppBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  const origin = request.headers.get('origin')?.trim();
  if (origin) {
    return origin.replace(/\/$/, '');
  }

  const host = request.headers.get('host')?.trim();
  if (!host) {
    return 'http://localhost:3000';
  }

  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function buildSupabaseClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Reference de transaction. Elle voyage chez le prestataire et nous revient :
 * c'est notre cle d'idempotence, elle doit etre unique et sans surprise pour
 * un systeme tiers — d'ou l'alphabet restreint.
 */
function nouvelleReference(): string {
  const hasard = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `DJF-${Date.now()}-${hasard}`;
}

export async function POST(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  const supabase = buildSupabaseClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: 'Configuration Supabase manquante.' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  let corps: CorpsRequete;
  try {
    corps = (await request.json()) as CorpsRequete;
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const plan = getBillingPlan(corps.plan ?? '');
  if (!plan) {
    return NextResponse.json({ error: 'Plan non reconnu.' }, { status: 400 });
  }

  // L'essai gratuit s'ouvre a l'inscription, il ne se vend pas. Sans cette
  // garde, un appel forge sur `essai` traverserait le tunnel pour un montant
  // nul et prolongerait l'acces.
  if (!plan.achetable) {
    return NextResponse.json({ error: `Le plan ${plan.name} ne s'achète pas.` }, { status: 400 });
  }

  // La duree vient du client : elle doit figurer dans le bareme, sinon le
  // montant se calculerait sur une remise inventee.
  const mois = Number(corps.mois ?? 1);
  if (!DUREES_PREPAYEES.some((d) => d.mois === mois)) {
    return NextResponse.json({ error: 'Durée non proposée.' }, { status: 400 });
  }

  const montant = montantPrepaye(plan, mois);
  if (montant <= 0) {
    return NextResponse.json({ error: 'Montant invalide.' }, { status: 400 });
  }

  const baseUrl = getAppBaseUrl(request);
  const reference = nouvelleReference();

  if (isMockBillingMode()) {
    return NextResponse.json({
      url: `${baseUrl}/dashboard/paiements?success=1&reference=${reference}&mock=1`,
      reference,
      montant,
    });
  }

  if (!cinetpayConfigure()) {
    // Ce texte s'affiche tel quel au marchand, en pleine page. « Paiement non
    // configure sur ce deploiement » etait exact et inutile : il ne lui disait
    // ni que ca allait s'ouvrir, ni quoi faire en attendant, et le laissait
    // penser que la panne venait de lui.
    return NextResponse.json({ error: PAIEMENT_INDISPONIBLE }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });
  }

  // L'intention est enregistree AVANT d'ouvrir la transaction : si le
  // prestataire encaisse et que nous n'avons pas trace la reference, sa
  // notification arriverait sur une commande inconnue et l'argent serait
  // encaisse sans acces ouvert.
  const { error: erreurInsert } = await admin.from('paiements').insert({
    reference,
    user_id: user.id,
    plan_key: plan.key,
    mois,
    montant_fcfa: montant,
    statut: 'en_attente',
  });

  if (erreurInsert) {
    console.error('Checkout — enregistrement de l intention impossible :', erreurInsert);
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 503 });
  }

  const resultat = await initialiserPaiement({
    reference,
    montantFcfa: montant,
    description: `DjiguiFlow ${plan.name} — ${mois} mois`,
    urlNotification: `${baseUrl}/api/billing/cinetpay/notification`,
    urlRetour: `${baseUrl}/dashboard/paiements?reference=${reference}`,
    nomClient: user.email ?? 'Marchand DjiguiFlow',
  });

  if ('erreur' in resultat) {
    await admin.from('paiements').update({ statut: 'echoue' }).eq('reference', reference);

    // Prestataire injoignable, ou en panne chez lui : le marchand n'a rien a
    // corriger. Il lisait jusqu'ici le message brut de la couche reseau —
    // « fetch failed » — en pleine page, ce qui lui faisait croire que le
    // defaut venait de DjiguiFlow ou de lui.
    if (resultat.injoignable) {
      return NextResponse.json({ error: PAIEMENT_INDISPONIBLE }, { status: 503 });
    }

    // Un vrai refus, lui, se dit tel quel : « montant invalide », « site_id
    // inconnu » nomment la cause, et la deviner couterait cher.
    return NextResponse.json({ error: resultat.erreur }, { status: 502 });
  }

  return NextResponse.json({ url: resultat.url, reference, montant });
}
