/**
 * Encaissement Mobile Money via CinetPay.
 *
 * ⚠ NE PAS REECRIRE CE CONTRAT. Verifie le 14 aout 2026 contre deux
 * implementations reelles independantes et 431 depots publics : l'hote, les
 * noms de champs et la lecture de la reponse sont bons. Ce qui bloque est
 * ailleurs — `api-checkout.cinetpay.com` repond NXDOMAIN sur tous les types
 * d'enregistrement, depuis Cloudflare qui fait autorite sur la zone. Le
 * sous-domaine a disparu de leur zone, comme `docs.cinetpay.com`, ce qui
 * explique que leur propre lien de documentation soit mort.
 *
 * `api.cinetpay.com` existe et expose une ancienne API v1 par methode. Ce
 * n'est PAS le produit Checkout : ne pas y migrer.
 *
 * Pour savoir si c'est retabli : `dns.google/resolve?name=api-checkout
 * .cinetpay.com&type=A`, `Status=0` = revenu. Puis derouler
 * `/api/internal/billing/diagnostic`.
 *
 * Pourquoi CinetPay plutot que Stripe : Stripe n'accepte pas les entreprises
 * etablies en Cote d'Ivoire, et les marchands d'ici n'ont pas de carte. Une
 * seule integration couvre Orange Money, MTN, Moov, Wave et les cartes.
 *
 * Pourquoi du prepaye et non de l'abonnement : aucun de ces operateurs
 * n'offre de mandat de prelevement recurrent fiable pour un petit marchand.
 * On vend donc des periodes, et on relance avant l'echeance.
 */

import { lookup } from 'node:dns/promises';

/**
 * Hote de l'API, change le 14 aout 2026 sur indication du support CinetPay,
 * qui a renvoye le gerant vers `panel.cinetpay.net`.
 *
 * Ce qui est ETABLI par sondage : `api.cinetpay.net` est vivant, et il repond
 * 404 sur une route inconnue mais 422 sur une route existante — ce qui permet
 * de cartographier sa surface sans clé. Deux routes seulement existent :
 * `/v1/payment` et `/v1/transfer`.
 *
 * Ce qui NE L'EST PAS : qu'il s'agisse bien du Checkout. Il authentifie avant
 * de lire la requete (`1002 INVALID_TOKEN` sur tout POST, corps vide compris),
 * donc seule une vraie clé peut le prouver — par la sonde
 * `/api/internal/billing/diagnostic`.
 *
 * ⚠ ET SURTOUT : `/v1/payment/check` N'EXISTE PAS sur cet hote. La
 * verification, seule chose qui ouvre les droits, n'a donc pas de route connue.
 * `verifierPaiement` rend « indetermine » dans ce cas, et le webhook laisse la
 * reference EN ATTENTE — jamais « echoue ». Tant que la bonne route n'est pas
 * connue, un paiement reel ne sera pas enterre, mais il n'ouvrira rien non
 * plus. C'est la question a poser a CinetPay.
 */
const BASE = 'https://api.cinetpay.net/v1';

export type ResultatVerification = {
  /** Vrai seulement si le prestataire confirme un paiement accepte. */
  accepte: boolean;
  /**
   * Le prestataire n'a pas repondu, ou pas repondu un statut.
   *
   * A distinguer absolument d'un refus. Un refus est une reponse : la
   * transaction n'a pas abouti, le dossier est clos. Un indetermine veut dire
   * qu'on NE SAIT PAS — endpoint absent, panne reseau, corps illisible — et
   * l'argent peut tres bien avoir ete preleve. Classer ce cas en « echoue »
   * enterre un paiement encaisse.
   */
  indetermine: boolean;
  /** Montant reellement encaisse, en FCFA. A confronter a l'attendu. */
  montant: number | null;
  operateur: string | null;
  /** Statut brut du prestataire, journalise tel quel en cas de litige. */
  statutBrut: string | null;
};

function config(): { apikey: string; site_id: string } | null {
  const apikey = process.env.CINETPAY_API_KEY?.trim();
  const site_id = process.env.CINETPAY_SITE_ID?.trim();
  if (!apikey || !site_id) return null;
  return { apikey, site_id };
}

/**
 * Le paiement est-il utilisable sur ce deploiement ?
 *
 * Volontairement tolerant : un deploiement sans cles doit continuer a servir
 * le tableau de bord, pas tomber au demarrage. Meme principe que les cles
 * VAPID.
 */
export function cinetpayConfigure(): boolean {
  return config() !== null;
}

/**
 * Ouvre une transaction et rend l'URL de paiement a presenter au marchand.
 *
 * `reference` est NOTRE identifiant : c'est lui qui reviendra dans la
 * notification et qui sert de cle d'idempotence.
 */
export async function initialiserPaiement(params: {
  reference: string;
  montantFcfa: number;
  description: string;
  urlNotification: string;
  urlRetour: string;
  nomClient: string;
  telephoneClient?: string;
}): Promise<{ url: string } | { erreur: string; injoignable?: boolean }> {
  const c = config();
  if (!c) return { erreur: 'Paiement non configuré sur ce déploiement.' };

  // Le XOF n'a pas de decimale et les operateurs refusent les montants qui ne
  // sont pas des multiples de 5. `montantPrepaye` arrondit deja a la centaine ;
  // on le verifie ici plutot que de laisser le prestataire refuser sans dire
  // pourquoi.
  if (!Number.isInteger(params.montantFcfa) || params.montantFcfa % 5 !== 0) {
    return { erreur: `Montant ${params.montantFcfa} invalide : doit être un entier multiple de 5.` };
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...c,
        transaction_id: params.reference,
        amount: params.montantFcfa,
        currency: 'XOF',
        description: params.description,
        notify_url: params.urlNotification,
        return_url: params.urlRetour,
        channels: 'ALL',
        lang: 'fr',
        customer_name: params.nomClient,
        customer_phone_number: params.telephoneClient ?? '',
      }),
    });
  } catch (e) {
    // Node enveloppe toute panne reseau dans un « fetch failed » sans
    // information, et ce texte remontait TEL QUEL au marchand, en pleine page :
    // il lisait « fetch failed » et concluait que DjiguiFlow etait casse. La
    // cause reelle — ENOTFOUND, certificat, delai — part au journal, ou elle
    // sert a quelqu'un ; lui recoit une phrase qui lui dit quoi faire.
    console.error('CinetPay — prestataire injoignable :', detailErreur(e));
    return { erreur: 'Prestataire injoignable.', injoignable: true };
  }

  const corps = (await reponse.json().catch(() => null)) as
    | { code?: string; message?: string; description?: string; data?: { payment_url?: string } }
    | null;

  const url = corps?.data?.payment_url;
  if (!reponse.ok || !url) {
    // Le message du prestataire est journalise tel quel : c'est lui qui dit
    // « site_id inconnu » ou « montant invalide », et le deviner coute cher.
    console.error('CinetPay — initialisation refusée :', reponse.status, corps);
    return {
      erreur: corps?.description || corps?.message || `Initialisation refusée (${reponse.status}).`,
      // Une panne CHEZ eux n'est pas un refus : le marchand n'a rien a
      // corriger et ne doit pas lire un jargon de prestataire.
      injoignable: reponse.status >= 500,
    };
  }

  return { url };
}

/**
 * Appelle l'initialisation et rend la reponse BRUTE, sans l'interpreter.
 *
 * La documentation de CinetPay est injoignable depuis l'environnement de
 * developpement : impossible d'ecrire le contrat sur pieces. Mais le
 * deploiement Vercel, lui, atteint le prestataire. Cette sonde permet donc de
 * decouvrir le contrat par l'experience — c'est le message d'erreur du
 * prestataire qui dit quel champ manque, et il le dit precisement.
 *
 * `surcharges` s'ecrase sur la charge utile de base : on peut ainsi essayer un
 * autre `channels`, ajouter le bloc client exige par la carte bancaire ou
 * corriger un nom de champ SANS redeployer a chaque tentative.
 *
 * Aucun paiement n'est preleve : l'initialisation ne fait qu'ouvrir un lien.
 */
export type SondeInitialisation = {
  urlAppelee: string;
  /** Ce que le DNS repond pour cet hote, vu depuis le serveur qui appelle. */
  dns: string[] | string;
  /** La charge utile envoyee, secrets remplaces par leur longueur. */
  envoye: Record<string, unknown>;
  statutHttp: number | null;
  corpsBrut: unknown;
  erreurReseau: string | null;
};

/**
 * Ce que le serveur voit du nom d'hote.
 *
 * Un `fetch failed` ne distingue pas « nom introuvable » de « connexion
 * refusee » ni de « certificat invalide ». La resolution DNS tranche le premier
 * cas a elle seule, et elle dit aussi si l'hote n'a qu'une adresse IPv6 —
 * exactement le mur rencontre entre n8n Cloud et Supabase.
 */
async function resoudre(hote: string): Promise<string[] | string> {
  try {
    const adresses = await lookup(hote, { all: true });
    return adresses.map((a) => `${a.address} (IPv${a.family})`);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return `échec DNS${code ? ` (${code})` : ''} : ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Deplie la cause reelle d'une erreur de `fetch`.
 *
 * Node enveloppe tout dans un « fetch failed » sans information. Le diagnostic
 * vit dans `error.cause` : ENOTFOUND, ECONNREFUSED, un code de certificat ou un
 * depassement de delai appellent chacun une correction differente.
 */
function detailErreur(e: unknown): string {
  if (!(e instanceof Error)) return String(e);

  const cause = (e as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return `${e.message} — cause : ${code ? `${code} ` : ''}${cause.message}`.trim();
  }

  return e.message;
}

export async function sonderInitialisation(
  surcharges: Record<string, unknown> = {},
  urlSurchargee?: string,
): Promise<SondeInitialisation> {
  // L'URL est surchargeable pour pouvoir essayer un autre hote sans
  // redeployer : si le nom actuel ne resout pas, c'est la premiere chose
  // qu'on voudra tester.
  const url = urlSurchargee?.trim() || `${BASE}/payment`;

  let hote = '';
  try {
    hote = new URL(url).hostname;
  } catch {
    return {
      urlAppelee: url,
      dns: 'URL invalide',
      envoye: {},
      statutHttp: null,
      corpsBrut: null,
      erreurReseau: 'URL invalide.',
    };
  }

  const dns = await resoudre(hote);
  const c = config();

  if (!c) {
    return {
      urlAppelee: url,
      dns,
      envoye: {},
      statutHttp: null,
      corpsBrut: null,
      erreurReseau: 'Clés absentes de ce déploiement.',
    };
  }

  const charge: Record<string, unknown> = {
    ...c,
    transaction_id: `DJF-SONDE-${Date.now()}`,
    amount: 100,
    currency: 'XOF',
    description: 'Sonde technique DjiguiFlow',
    notify_url: 'https://www.djiguiflow.com/api/billing/cinetpay/notification',
    return_url: 'https://www.djiguiflow.com/dashboard/paiements',
    channels: 'ALL',
    lang: 'fr',
    customer_name: 'Sonde',
    customer_phone_number: '',
    ...surcharges,
  };

  // Ce qu'on montre de la charge utile. Les deux secrets ne sortent jamais :
  // leur longueur suffit a reconnaitre une valeur collee avec ses guillemets
  // ou tronquee, comme pour les cles VAPID.
  const envoye: Record<string, unknown> = {
    ...charge,
    apikey: `(${String(c.apikey).length} caractères)`,
    site_id: `(${String(c.site_id).length} caractères)`,
  };

  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(charge),
    });
  } catch (e) {
    return {
      urlAppelee: url,
      dns,
      envoye,
      statutHttp: null,
      corpsBrut: null,
      erreurReseau: detailErreur(e),
    };
  }

  // Le corps est rendu tel quel, texte compris : un prestataire qui repond en
  // HTML ou en texte plat dit souvent l'essentiel, et le forcer en JSON
  // effacerait justement le message qu'on est venu chercher.
  const texte = await reponse.text().catch(() => '');
  let corpsBrut: unknown = texte;
  try {
    corpsBrut = JSON.parse(texte);
  } catch {
    /* pas du JSON : on garde le texte */
  }

  return {
    urlAppelee: url,
    dns,
    envoye,
    statutHttp: reponse.status,
    corpsBrut,
    erreurReseau: null,
  };
}

/**
 * Demande au prestataire l'etat REEL d'une transaction.
 *
 * C'est le seul point de verite. La notification qu'il poste sur notre
 * webhook n'est PAS une preuve : n'importe qui peut la forger, et son corps
 * ne doit jamais decider d'un acces payant. On l'utilise uniquement comme un
 * signal « va verifier cette reference ».
 */
export async function verifierPaiement(reference: string): Promise<ResultatVerification> {
  const inconnu = (statutBrut: string): ResultatVerification => ({
    accepte: false,
    indetermine: true,
    montant: null,
    operateur: null,
    statutBrut,
  });

  const c = config();
  if (!c) return inconnu('CLES_ABSENTES');

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/payment/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, transaction_id: reference }),
    });
  } catch (e) {
    console.error(`CinetPay — vérification de ${reference} injoignable :`, detailErreur(e));
    return inconnu('INJOIGNABLE');
  }

  // Une route absente n'est pas un refus. Elle le devenait : un 404 ne porte
  // aucun `data.status`, le statut tombait a null, `accepte` a faux, et le
  // paiement etait classe « echoue ». Un marchand ayant reellement payé se
  // serait vu refuser son acces, sans que rien ne le signale.
  if (!reponse.ok) {
    console.error(
      `CinetPay — vérification de ${reference} : HTTP ${reponse.status} sur ${BASE}/payment/check.`
      + ' Route de vérification introuvable ou en panne — le paiement reste EN ATTENTE.',
    );
    return inconnu(`HTTP_${reponse.status}`);
  }

  const corps = (await reponse.json().catch(() => null)) as
    | { data?: { status?: string; amount?: number | string; payment_method?: string } }
    | null;

  const statut = corps?.data?.status ?? null;

  // Repondu, mais sans statut : contrat different de celui qu'on attend. On ne
  // conclut rien plutot que de conclure « refusé ».
  if (!statut) {
    console.error(`CinetPay — vérification de ${reference} : réponse sans statut.`, corps);
    return inconnu('SANS_STATUT');
  }

  const montantBrut = corps?.data?.amount;
  const montant =
    montantBrut === undefined || montantBrut === null ? null : Number(montantBrut);

  return {
    accepte: statut === 'ACCEPTED',
    indetermine: false,
    montant: Number.isFinite(montant) ? montant : null,
    operateur: corps?.data?.payment_method ?? null,
    statutBrut: statut,
  };
}
