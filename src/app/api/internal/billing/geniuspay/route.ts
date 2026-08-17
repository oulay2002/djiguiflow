import { NextResponse } from 'next/server';
import {
  geniuspayBacASable,
  geniuspayConfigure,
  initialiserPaiement,
  verifierPaiement,
} from '@/lib/billing/geniuspay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ce que le deploiement voit de GeniusPay, et de quoi prouver la chaine.
 *
 * Meme raison d'etre que le diagnostic CinetPay : apres cinq redeploiements
 * passes a deviner pourquoi les cles VAPID n'arrivaient pas, on ne devine plus.
 * Une variable posee sur Production reste invisible a une fonction qui tourne
 * en preview, et rien dans l'interface de Vercel ne le montre.
 *
 * Ici s'ajoute un usage decisif : GeniusPay offre un bac a sable ou les
 * transactions sont SIMULEES. On peut donc derouler l'integration complete —
 * initialisation, page de paiement, verification — sans qu'un franc circule.
 * C'est precisement ce que CinetPay ne permettait pas.
 *
 * Aucune valeur secrete n'est rendue, jamais. Seulement des NOMS, des LONGUEURS
 * et le PREFIXE de la cle publique, qui dit `sandbox` ou `live` — l'information
 * la plus utile du lot, et la seule qu'on ne peut pas deviner autrement.
 */

function autorise(req: Request): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
}

function deploiement() {
  return {
    environnement: process.env.VERCEL_ENV ?? '(hors Vercel)',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branche: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    // Propre a CHAQUE deploiement : la seule valeur qui prouve qu'un
    // redeploiement a bien atteint ce domaine.
    urlUnique: process.env.VERCEL_URL ?? null,
  };
}

/** `pk_sandbox_xxxx` → `pk_sandbox_…`. Le prefixe informe, la cle reste secrete. */
function prefixe(v: string | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^([a-z]{2}_[a-z]+_)/i);
  return m ? `${m[1]}…` : '(format inattendu)';
}

export async function GET(req: Request) {
  if (!autorise(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const longueur = (v: string | undefined) => (v === undefined ? null : v.length);

  // Les noms seuls : de quoi reperer un `GENIUSPAY_APIKEY` mal orthographie ou
  // un nom avec une espace finale, invisibles dans l'interface de Vercel.
  const nomsVus = Object.keys(process.env)
    .filter((n) => n.toUpperCase().includes('GENIUS'))
    .sort();

  const cle = process.env.GENIUSPAY_API_KEY?.trim();
  const secret = process.env.GENIUSPAY_API_SECRET?.trim();

  return NextResponse.json({
    deploiement: deploiement(),
    variablesVues: nomsVus,
    longueurs: {
      GENIUSPAY_API_KEY: longueur(cle),
      GENIUSPAY_API_SECRET: longueur(secret),
    },
    prefixes: {
      GENIUSPAY_API_KEY: prefixe(cle),
      GENIUSPAY_API_SECRET: prefixe(secret),
    },
    configure: geniuspayConfigure(),
    bacASable: geniuspayBacASable(),
    // Un desaccord entre les deux cles trahit un copier-coller partiel : une
    // publique de bac a sable avec une secrete de production authentifie mal, et
    // le message d'erreur ne le dira pas.
    clesCoherentes:
      !cle || !secret
        ? null
        : (cle.startsWith('pk_sandbox_') && secret.startsWith('sk_sandbox_'))
          || (cle.startsWith('pk_live_') && secret.startsWith('sk_live_')),
    commentSonder:
      'POST {"montant": 1000} pour ouvrir une transaction et obtenir sa page de paiement. '
      + 'POST {"reference": "MTX-…"} pour verifier une transaction existante.',
  });
}

/**
 * Deroule la chaine pour de vrai, en bac a sable.
 *
 * Sans corps : ouvre une transaction de 1 000 XOF et rend sa page de paiement.
 * Aucun franc ne circule — une initialisation n'ouvre qu'un lien, et en bac a
 * sable la transaction est simulee de bout en bout.
 *
 * Avec `{"reference": "MTX-…"}` : interroge la verification, celle-la meme qui
 * manque chez CinetPay et sans laquelle aucun acces ne peut etre ouvert en
 * surete.
 */
export async function POST(req: Request) {
  if (!autorise(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  let corps: { montant?: number; reference?: string } = {};
  try {
    const brut = await req.text();
    if (brut.trim()) corps = JSON.parse(brut) as typeof corps;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  if (corps.reference) {
    const verdict = await verifierPaiement(String(corps.reference));
    return NextResponse.json({ deploiement: deploiement(), etape: 'verification', verdict });
  }

  const montant = Number.isFinite(Number(corps.montant)) ? Number(corps.montant) : 1000;
  const reference = `DIAG-${Date.now()}`;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.djiguiflow.com';

  const resultat = await initialiserPaiement({
    reference,
    montantFcfa: montant,
    description: 'Sonde de diagnostic DjiguiFlow',
    urlRetour: `${site}/dashboard/paiements`,
    nomClient: 'Diagnostic DjiguiFlow',
    telephoneClient: '+2250000000000',
  });

  // Toujours 200 : c'est un rapport d'observation, pas un verdict. Repondre en
  // erreur ferait croire que la sonde a echoue alors qu'elle a parfaitement
  // rempli son role — rapporter le refus du prestataire.
  return NextResponse.json({
    deploiement: deploiement(),
    etape: 'initialisation',
    bacASable: geniuspayBacASable(),
    referenceInterne: reference,
    resultat,
  });
}
