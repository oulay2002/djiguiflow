import { NextResponse } from 'next/server';
import { cinetpayConfigure, sonderInitialisation } from '@/lib/billing/cinetpay';
import {
  geniuspayBacASable,
  geniuspayClesCoherentes,
  geniuspayConfigure,
} from '@/lib/billing/geniuspay';
import { isMockBillingMode } from '@/lib/billing/mode';
import { paiementConfigure, prestataireActif } from '@/lib/billing/prestataire';

/**
 * Peut-on encaisser de l'ARGENT REEL, ici, maintenant ?
 *
 * Trois conditions, et chacune s'est deja trouvee en defaut :
 *  - un prestataire configure ;
 *  - pas de mode simule ;
 *  - et surtout : des cles de PRODUCTION. Une cle de bac a sable laisse la
 *    chaine entiere fonctionner — 200, ligne de paiement creee, montant juste —
 *    et n'encaisse rien.
 */
function encaissementReel(): { ok: boolean; motif: string | null } {
  if (!paiementConfigure()) {
    return { ok: false, motif: 'aucun prestataire configure' };
  }
  if (isMockBillingMode()) {
    return { ok: false, motif: 'mode simule (BILLING_MODE=mock)' };
  }
  if (prestataireActif() === 'geniuspay' && geniuspayBacASable()) {
    return {
      ok: false,
      motif:
        'la cle GeniusPay est une cle de BAC A SABLE : le marchand recoit une ' +
        'URL de paiement simulee et aucun franc n est encaisse',
    };
  }
  if (geniuspayClesCoherentes() === false) {
    return { ok: false, motif: 'les deux cles GeniusPay ne sont pas du meme monde' };
  }
  return { ok: true, motif: null };
}

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
    // `BILLING_MODE` NE CHOISIT RIEN. `prestataireActif()` prend GeniusPay des
    // qu'il est configure, quoi que dise cette variable. Elle se lit pourtant
    // comme un interrupteur — le 22 aout elle valait « cinetpay » pendant que
    // GeniusPay encaissait. On le dit plutot que de laisser croire.
    billingModeIgnore:
      Boolean(process.env.BILLING_MODE) &&
      process.env.BILLING_MODE !== prestataireActif() &&
      !isMockBillingMode(),
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
      // LE DRAPEAU QUI DECIDE SI UN FAUX PAIEMENT OUVRE UN VRAI ACCES, et qui
      // n'etait rapporte nulle part. `encaissement.ts` refuse une transaction
      // de bac a sable sauf si elle vaut exactement « 1 » ; c'est donc le
      // reglage le plus dangereux de toute la facturation, et le seul qu'on ne
      // pouvait pas lire sans ouvrir Vercel.
      // La VALEUR posee, et son EFFET REEL — qui n'est pas le meme en
      // production, ou le drapeau est ignore. Rapporter la valeur seule
      // laisserait croire a une porte ouverte qui ne l'est plus.
      accepteBacASableDemande: process.env.GENIUSPAY_ACCEPTE_SANDBOX === '1',
      accepteBacASableEffectif:
        process.env.GENIUSPAY_ACCEPTE_SANDBOX === '1' &&
        process.env.VERCEL_ENV !== 'production',
    },
    // ELLE MESURAIT « DES CLES EXISTENT », PAS « L'ARGENT ARRIVERA ».
    //
    // Constate le 22 aout 2026 : la ligne annoncait `true` alors que la cle
    // GeniusPay active etait une cle de BAC A SABLE. Un vrai marchand cliquant
    // « s'abonner » recevait une URL contenant `SANDBOX_` — verifie de bout en
    // bout. Aucun franc ne pouvait etre encaisse, et le diagnostic disait que
    // tout allait bien.
    //
    // Un feu vert qui mesure autre chose que ce qu'on lui demande est pire
    // qu'un feu absent : on ne va pas verifier ce qui est deja vert.
    pretAEncaisser: encaissementReel().ok,
    // Quand ce n'est pas pret, DIRE POURQUOI. « false » sans motif envoie
    // chercher au hasard.
    pourquoi: encaissementReel().motif,
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
  // LA SONDE N'INTERROGE QUE CINETPAY. Le 22 aout 2026 elle rendait
  // `INVALID_TOKEN` — un vrai refus, mais de CinetPay, qui n'encaisse plus rien
  // depuis que GeniusPay est configure. Un exploitant devant ce resultat conclut
  // que les paiements sont casses alors que le prestataire actif n'a meme pas
  // ete appele.
  //
  // Ecrire une sonde GeniusPay demanderait de creer un vrai paiement chez lui,
  // ce qui n'est pas anodin. En attendant, la sonde DIT qui elle a interroge et
  // si c'est bien celui qui encaisse — un resultat qu'on sait mal interpreter
  // est plus dangereux qu'un resultat absent.
  const sonde = await sonderInitialisation(surcharges, corps.url);
  const actif = prestataireActif();

  // Toujours 200 : c'est un rapport d'observation, pas un verdict. Repondre en
  // erreur ferait croire que la sonde a echoue alors qu'elle a parfaitement
  // rempli son role — rapporter le refus du prestataire.
  return NextResponse.json({
    deploiement: deploiement(),
    prestataireSonde: 'cinetpay',
    prestataireActif: actif,
    sondeLeBonPrestataire: actif === 'cinetpay',
    ...(actif !== 'cinetpay'
      ? {
          avertissement:
            `Cette sonde a interroge CinetPay, mais c'est ${actif ?? 'aucun prestataire'} ` +
            'qui encaisse. Le resultat ci-dessous ne dit RIEN de la chaine reelle.',
        }
      : {}),
    sonde,
  });
}
