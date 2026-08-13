/**
 * Encaissement Mobile Money via CinetPay.
 *
 * ⚠ CODE NON VERIFIE CONTRE LA DOCUMENTATION. Ecrit le 13 aout 2026 alors que
 * `docs.cinetpay.com` etait injoignable depuis l'environnement de
 * developpement (DNS muet, `cinetpay.com` en 403). Le contrat ci-dessous suit
 * l'API v2 telle qu'elle est documentee publiquement, mais AUCUN appel n'a pu
 * etre teste. A valider par un paiement en mode test avant toute mise en
 * production, et a corriger sur pieces si les noms de champs different.
 *
 * Pourquoi CinetPay plutot que Stripe : Stripe n'accepte pas les entreprises
 * etablies en Cote d'Ivoire, et les marchands d'ici n'ont pas de carte. Une
 * seule integration couvre Orange Money, MTN, Moov, Wave et les cartes.
 *
 * Pourquoi du prepaye et non de l'abonnement : aucun de ces operateurs
 * n'offre de mandat de prelevement recurrent fiable pour un petit marchand.
 * On vend donc des periodes, et on relance avant l'echeance.
 */

const BASE = 'https://api-checkout.cinetpay.com/v2';

export type ResultatVerification = {
  /** Vrai seulement si le prestataire confirme un paiement accepte. */
  accepte: boolean;
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
}): Promise<{ url: string } | { erreur: string }> {
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
    return { erreur: e instanceof Error ? e.message : 'Prestataire injoignable.' };
  }

  const corps = (await reponse.json().catch(() => null)) as
    | { code?: string; message?: string; description?: string; data?: { payment_url?: string } }
    | null;

  const url = corps?.data?.payment_url;
  if (!reponse.ok || !url) {
    // Le message du prestataire est journalise tel quel : c'est lui qui dit
    // « site_id inconnu » ou « montant invalide », et le deviner coute cher.
    console.error('CinetPay — initialisation refusée :', reponse.status, corps);
    return { erreur: corps?.description || corps?.message || `Initialisation refusée (${reponse.status}).` };
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
  /** La charge utile envoyee, secrets remplaces par leur longueur. */
  envoye: Record<string, unknown>;
  statutHttp: number | null;
  corpsBrut: unknown;
  erreurReseau: string | null;
};

export async function sonderInitialisation(
  surcharges: Record<string, unknown> = {},
): Promise<SondeInitialisation> {
  const url = `${BASE}/payment`;
  const c = config();

  if (!c) {
    return {
      urlAppelee: url,
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
      envoye,
      statutHttp: null,
      corpsBrut: null,
      erreurReseau: e instanceof Error ? e.message : 'Prestataire injoignable.',
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
  const vide: ResultatVerification = { accepte: false, montant: null, operateur: null, statutBrut: null };

  const c = config();
  if (!c) return vide;

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/payment/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, transaction_id: reference }),
    });
  } catch (e) {
    console.error('CinetPay — vérification injoignable :', e);
    return vide;
  }

  const corps = (await reponse.json().catch(() => null)) as
    | { data?: { status?: string; amount?: number | string; payment_method?: string } }
    | null;

  const statut = corps?.data?.status ?? null;
  const montantBrut = corps?.data?.amount;
  const montant =
    montantBrut === undefined || montantBrut === null ? null : Number(montantBrut);

  return {
    accepte: statut === 'ACCEPTED',
    montant: Number.isFinite(montant) ? montant : null,
    operateur: corps?.data?.payment_method ?? null,
    statutBrut: statut,
  };
}
