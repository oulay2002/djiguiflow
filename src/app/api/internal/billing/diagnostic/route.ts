import { NextResponse } from 'next/server';
import { cinetpayConfigure, sonderInitialisation } from '@/lib/billing/cinetpay';
import {
  geniuspayBacASable,
  geniuspayClesCoherentes,
  geniuspayConfigure,
} from '@/lib/billing/geniuspay';
import { isMockBillingMode } from '@/lib/billing/mode';
import { paiementConfigure, prestataireActif } from '@/lib/billing/prestataire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ce que le deploiement en cours voit de sa configuration de paiement, et de
 * quoi decouvrir le contrat de CinetPay sans sa documentation.
 *
 * Meme raison d'etre que le diagnostic push : apres cinq redeploiements passes
 * a deviner pourquoi les cles VAPID n'arrivaient pas, on ne devine plus. Mais
 * ici s'ajoute un probleme distinct — `docs.cinetpay.com` et
 * `api-checkout.cinetpay.com` sont injoignables depuis l'environnement de
 * developpement, alors que ce deploiement les atteint. Le POST sert donc de
 * sonde : il envoie une initialisation reelle et rend la reponse BRUTE, y
 * compris le message d'erreur qui nomme le champ manquant.
 *
 * Aucun paiement n'est preleve : une initialisation n'ouvre qu'un lien.
 *
 * Aucune valeur secrete n'est rendue, jamais — seulement des NOMS et des
 * LONGUEURS. Et la route reste derriere le meme secret partage que le reste
 * de /api/internal.
 */

function autorise(req: Request): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
}

function deploiement() {
  return {
    // Une variable posee sur Production reste invisible a une fonction qui
    // tourne en preview : c'est exactement ce qui avait coute six allers-retours
    // sur les cles VAPID.
    environnement: process.env.VERCEL_ENV ?? '(hors Vercel)',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branche: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    // Propre a CHAQUE deploiement : c'est la seule valeur qui prouve qu'un
    // redeploiement a bien atteint ce domaine, le commit ne bougeant pas
    // quand on redeploie sans nouveau code.
    urlUnique: process.env.VERCEL_URL ?? null,
  };
}

export async function GET(req: Request) {
  if (!autorise(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const longueur = (v: string | undefined) => (v === undefined ? null : v.length);

  // Les noms seuls : de quoi reperer un `CINETPAY_APIKEY` mal orthographie ou
  // un `CINETPAY_SITE_ID ` avec une espace finale, invisibles dans l'interface
  // de Vercel.
  // GENIUSPAY manquait a ce filtre : le diagnostic ne montrait donc AUCUNE
  // variable du prestataire reellement en service, et une faute de frappe sur
  // `GENIUSPAY_API_SECRET` y restait invisible — l'inverse de ce que cette
  // route existe pour faire.
  const nomsVus = Object.keys(process.env)
    .filter((n) => {
      const N = n.toUpperCase();
      return N.includes('CINETPAY') || N.includes('GENIUSPAY') || N.includes('BILLING');
    })
    .sort();

  return NextResponse.json({
    deploiement: deploiement(),
    mode: {
      BILLING_MODE: process.env.BILLING_MODE ?? null,
      NEXT_PUBLIC_BILLING_MODE: process.env.NEXT_PUBLIC_BILLING_MODE ?? null,
      // La question qui compte : le tunnel encaisse-t-il vraiment, ou
      // ouvre-t-il l'acces sans qu'un franc circule ?
      simule: isMockBillingMode(),
    },
    variablesVues: nomsVus,
    longueurs: {
      CINETPAY_API_KEY: longueur(process.env.CINETPAY_API_KEY),
      CINETPAY_SITE_ID: longueur(process.env.CINETPAY_SITE_ID),
      // Ne sert pas a parler au prestataire mais a verifier que c'est bien lui
      // qui nous parle : elle signe la notification de paiement. Son absence
      // n'empeche donc rien d'encaisser — voir la note du webhook.
      CINETPAY_SECRET_KEY: longueur(process.env.CINETPAY_SECRET_KEY),
      GENIUSPAY_API_KEY: longueur(process.env.GENIUSPAY_API_KEY),
      GENIUSPAY_API_SECRET: longueur(process.env.GENIUSPAY_API_SECRET),
    },
    // Qui encaisse sur CE deploiement. Sans cette ligne, il fallait deviner
    // lequel des deux prestataires repondait, alors que c'est la premiere
    // question qu'on se pose devant un paiement qui n'aboutit pas.
    prestataire: {
      actif: prestataireActif(),
      geniuspayConfigure: geniuspayConfigure(),
      geniuspayBacASable: geniuspayBacASable(),
      // null quand on ne peut pas conclure : la documentation de GeniusPay ment
      // sur le prefixe des cles, donc l'incoherence n'est pas toujours decidable.
      geniuspayClesCoherentes: geniuspayClesCoherentes(),
      cinetpayConfigure: cinetpayConfigure(),
    },
    // Repondait sur CINETPAY seul : avec GeniusPay en service et CinetPay non
    // configure, cette ligne annoncait « false » alors que la plateforme
    // encaissait parfaitement. Un diagnostic qui se trompe envoie chercher la
    // panne au mauvais endroit, ce qui est pire que pas de diagnostic.
    pretAEncaisser: paiementConfigure() && !isMockBillingMode(),
    commentSonder:
      'POST sur cette meme route, avec un corps JSON optionnel {"surcharges": {...}} ' +
      'pour essayer d autres champs sans redeployer.',
  });
}

/**
 * Envoie une initialisation reelle et rend la reponse telle quelle.
 *
 * Le corps accepte `surcharges` : un objet fusionne par-dessus la charge utile
 * de base. C'est ce qui permet d'essayer un `channels` restreint, d'ajouter le
 * bloc client qu'exige peut-etre la carte bancaire, ou de corriger un nom de
 * champ — chaque essai coutant un appel, et non un redeploiement.
 */
export async function POST(req: Request) {
  if (!autorise(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: { surcharges?: Record<string, unknown>; url?: string } = {};
  try {
    const brut = await req.text();
    if (brut.trim()) corps = JSON.parse(brut) as typeof corps;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const surcharges =
    corps.surcharges && typeof corps.surcharges === 'object' ? corps.surcharges : {};

  // `url` permet d'essayer un autre hote sans redeployer. Indispensable quand
  // l'appel echoue avant meme d'etre parti : la premiere hypothese est alors
  // que le nom d'hote est faux.
  const sonde = await sonderInitialisation(surcharges, corps.url);

  // Toujours 200 : c'est un rapport d'observation, pas un verdict. Repondre en
  // erreur ferait croire que la sonde a echoue alors qu'elle a parfaitement
  // rempli son role — rapporter le refus du prestataire.
  return NextResponse.json({ deploiement: deploiement(), sonde });
}
