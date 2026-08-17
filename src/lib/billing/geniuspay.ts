/**
 * Encaissement Mobile Money via GeniusPay.
 *
 * POURQUOI CELUI-CI PLUTOT QUE CINETPAY. CinetPay n'est pas bloque par son
 * contrat mais par son infrastructure : `api-checkout.cinetpay.com` repond
 * NXDOMAIN, et sur l'hote de repli `api.cinetpay.net` la route de VERIFICATION
 * n'existe pas. Or la verification est la seule chose qui ouvre des droits :
 * sans elle, un paiement reel ne peut pas etre honore en surete. Voir
 * `cinetpay.ts`, qui reste en place et n'est pas a supprimer.
 *
 * GeniusPay documente sa verification — `GET /payments/{reference}` — et offre
 * un bac a sable ou les transactions sont simulees. Toute la chaine se prouve
 * donc sans engager un franc.
 *
 * CE QU'IL FAUT SAVOIR AVANT DE LIRE LE CODE
 *
 * 1. GeniusPay est un META-AGREGATEUR : sept passerelles derriere lui, dont
 *    CinetPay lui-meme, Wave et PawaPay. C'est un intermediaire de plus entre
 *    le marchand et son argent — d'ou le soin mis a distinguer ce qu'il
 *    AFFIRME de ce qu'on ne sait pas.
 *
 * 2. LA REFERENCE N'EST PAS LA NOTRE. GeniusPay emet la sienne, `MTX-XXXXXXXX`,
 *    et c'est elle, et elle seule, qui interroge la verification. La notre part
 *    dans `metadata` et revient telle quelle dans les reponses et les webhooks.
 *    Les confondre rendrait toute verification impossible : c'est le piege
 *    principal de cette integration.
 *
 * 3. En omettant `payment_method`, on obtient la page de paiement hebergee de
 *    GeniusPay, ou le marchand choisit lui-meme Wave, Orange Money, MTN ou sa
 *    carte. C'est ce qu'on veut : aucun moyen de paiement a maintenir chez
 *    nous, et la liste suit leurs ajouts sans redeploiement.
 *
 * Tarif annonce : 1 % + 100 XOF par transaction REUSSIE, sans abonnement, plus
 * les frais de la passerelle choisie. La reponse porte `fees` et `net_amount` :
 * on les journalise, c'est le seul moyen de verifier la facture.
 */

const BASE = 'https://geniuspay.ci/api/v1/merchant';

/** Delai large : une passerelle Mobile Money africaine met parfois plusieurs secondes. */
const DELAI_MS = 20000;

export type ResultatVerification = {
  /** Vrai seulement si GeniusPay confirme une transaction terminee. */
  accepte: boolean;
  /**
   * On NE SAIT PAS. A distinguer absolument d'un refus.
   *
   * Un refus est une reponse : la transaction n'a pas abouti, le dossier est
   * clos. Un indetermine — reseau coupe, corps illisible, ou statut `pending`
   * et `processing` — veut dire que l'argent peut tres bien avoir ete preleve.
   * Classer ce cas en « echoue » enterre un paiement encaisse.
   */
  indetermine: boolean;
  /** Montant reellement encaisse, en XOF. A confronter a l'attendu. */
  montant: number | null;
  operateur: string | null;
  /** Statut brut du prestataire, journalise tel quel en cas de litige. */
  statutBrut: string | null;
  /** Frais preleves et montant net credite, pour verifier la facture. */
  frais: number | null;
  net: number | null;
  /**
   * `sandbox` ou `live`, tel que GeniusPay le declare.
   *
   * Expose exprès : une transaction de bac a sable ne doit JAMAIS ouvrir un
   * acces payant, et c'est a l'appelant de le refuser en connaissance de cause.
   */
  environnement: string | null;
  /** Notre propre reference, telle qu'elle etait partie dans `metadata`. */
  referenceInterne: string | null;
};

function config(): { cle: string; secret: string } | null {
  const cle = process.env.GENIUSPAY_API_KEY?.trim();
  const secret = process.env.GENIUSPAY_API_SECRET?.trim();
  if (!cle || !secret) return null;
  return { cle, secret };
}

/**
 * Le paiement est-il utilisable sur ce deploiement ?
 *
 * Volontairement tolerant : un deploiement sans cles doit continuer a servir le
 * tableau de bord, pas tomber au demarrage. Meme principe que les cles VAPID.
 */
export function geniuspayConfigure(): boolean {
  return config() !== null;
}

/**
 * Le monde auquel appartient une cle : `sandbox`, `live`, ou rien.
 *
 * ⚠ LA DOCUMENTATION DE GENIUSPAY EST FAUSSE SUR CE POINT. Elle annonce
 * `pk_sandbox_…` pour la cle publique et `sk_sandbox_…` pour la secrete. Les
 * cles reellement emises, verifiees le 17 aout 2026, sont `sk_sandbox_…` et
 * `ss_sandbox_…`. Un test sur `pk_` declarait donc la production alors qu'on
 * etait en bac a sable — l'inverse exact de la protection recherchee.
 *
 * On ne lit donc plus le prefixe entier mais le SEGMENT DU MILIEU, qui seul
 * porte le sens, et qui survivra a leur prochain changement de nommage.
 */
function environnementDeCle(valeur: string | undefined): 'sandbox' | 'live' | null {
  const m = (valeur ?? '').trim().match(/^[a-z]{2}_(sandbox|live)_/i);
  return m ? (m[1].toLowerCase() as 'sandbox' | 'live') : null;
}

/**
 * Sommes-nous en bac a sable ? Lu sur la cle, pas devine.
 *
 * Sert a interdire qu'une transaction simulee ouvre un acces reel, et a
 * l'afficher clairement dans le tableau de bord.
 */
export function geniuspayBacASable(): boolean {
  return environnementDeCle(process.env.GENIUSPAY_API_KEY) === 'sandbox';
}

/**
 * Les deux cles appartiennent-elles au meme monde ?
 *
 * Une publique de bac a sable avec une secrete de production authentifie mal, et
 * le message d'erreur du prestataire ne dira jamais pourquoi. `null` quand une
 * cle manque ou n'a pas un format reconnu : on ne prononce pas un verdict qu'on
 * n'a pas les moyens de rendre.
 */
export function geniuspayClesCoherentes(): boolean | null {
  const a = environnementDeCle(process.env.GENIUSPAY_API_KEY);
  const b = environnementDeCle(process.env.GENIUSPAY_API_SECRET);
  if (!a || !b) return null;
  return a === b;
}

function entetes(c: { cle: string; secret: string }): Record<string, string> {
  return {
    'X-API-Key': c.cle,
    'X-API-Secret': c.secret,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
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

export type Initialisation =
  | {
      /** Page de paiement a presenter au marchand. */
      url: string;
      /** LA REFERENCE DE GENIUSPAY. A conserver : elle seule permet de verifier. */
      referencePrestataire: string;
      environnement: string | null;
    }
  | { erreur: string; injoignable?: boolean };

/**
 * Ouvre une transaction et rend l'URL de paiement.
 *
 * `reference` est NOTRE identifiant. Il part dans `metadata` et revient tel
 * quel — mais il n'interroge rien : conservez `referencePrestataire`.
 */
export async function initialiserPaiement(params: {
  reference: string;
  montantFcfa: number;
  description: string;
  urlRetour: string;
  urlEchec?: string;
  nomClient: string;
  emailClient?: string;
  telephoneClient?: string;
}): Promise<Initialisation> {
  const c = config();
  if (!c) return { erreur: 'Paiement non configuré sur ce déploiement.' };

  // Minimum impose par GeniusPay. Le dire ici evite un aller-retour reseau et
  // un message d'erreur en anglais chez le marchand.
  if (!Number.isFinite(params.montantFcfa) || params.montantFcfa < 200) {
    return { erreur: 'Le montant doit être d’au moins 200 FCFA.' };
  }

  const corps = {
    amount: Math.round(params.montantFcfa),
    currency: 'XOF',
    // `payment_method` volontairement absent : GeniusPay rend alors sa page de
    // checkout, ou le marchand choisit Wave, Orange Money, MTN ou sa carte.
    description: params.description.slice(0, 500),
    customer: {
      name: params.nomClient,
      ...(params.emailClient ? { email: params.emailClient } : {}),
      ...(params.telephoneClient ? { phone: params.telephoneClient } : {}),
      country: 'CI',
    },
    success_url: params.urlRetour,
    error_url: params.urlEchec ?? params.urlRetour,
    // Notre reference voyage ici, et revient dans les webhooks. C'est par elle
    // qu'on retrouve l'abonnement a ouvrir.
    metadata: { reference: params.reference },
  };

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/payments`, {
      method: 'POST',
      headers: entetes(c),
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    console.error('GeniusPay — initialisation injoignable :', detailErreur(e));
    return { erreur: 'Service de paiement injoignable.', injoignable: true };
  }

  const brut = await reponse.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    console.error(`GeniusPay — réponse illisible (HTTP ${reponse.status}) :`, brut.slice(0, 400));
    return { erreur: 'Réponse du service de paiement illisible.', injoignable: true };
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const url = String(data.checkout_url ?? data.payment_url ?? '').trim();
  const referencePrestataire = String(data.reference ?? '').trim();

  if (!reponse.ok || json.success !== true || !url || !referencePrestataire) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    const message = String(err.message ?? json.message ?? `HTTP ${reponse.status}`);
    console.error(`GeniusPay — initialisation refusée (${params.reference}) :`, message, brut.slice(0, 400));
    return { erreur: `Paiement refusé par le prestataire : ${message}` };
  }

  return {
    url,
    referencePrestataire,
    environnement: data.environment ? String(data.environment) : null,
  };
}

/**
 * Statuts de GeniusPay, ranges en trois familles.
 *
 * `pending` et `processing` ne sont PAS des refus : la transaction est en
 * cours. Les traiter comme un echec fermerait un dossier encore ouvert et
 * enterrerait un paiement sur le point d'aboutir.
 */
const ACCEPTES = new Set(['completed', 'success', 'succeeded']);
const REFUSES = new Set(['failed', 'expired', 'cancelled', 'canceled']);

/**
 * Interroge GeniusPay sur une transaction.
 *
 * @param referencePrestataire La reference `MTX-…` rendue a l'initialisation —
 *   PAS la notre. C'est l'erreur la plus facile a commettre ici.
 */
export async function verifierPaiement(
  referencePrestataire: string,
): Promise<ResultatVerification> {
  const inconnu = (statutBrut: string): ResultatVerification => ({
    accepte: false,
    indetermine: true,
    montant: null,
    operateur: null,
    statutBrut,
    frais: null,
    net: null,
    environnement: null,
    referenceInterne: null,
  });

  const c = config();
  if (!c) return inconnu('CLES_ABSENTES');
  if (!referencePrestataire.trim()) return inconnu('REFERENCE_ABSENTE');

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/payments/${encodeURIComponent(referencePrestataire.trim())}`, {
      method: 'GET',
      headers: entetes(c),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    console.error(`GeniusPay — vérification injoignable (${referencePrestataire}) :`, detailErreur(e));
    return inconnu('INJOIGNABLE');
  }

  const brut = await reponse.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return inconnu(`CORPS_ILLISIBLE_HTTP_${reponse.status}`);
  }

  // Une transaction introuvable N'EST PAS un refus. Elle peut n'avoir jamais
  // ete creee — ou l'avoir ete sous d'autres cles, si l'on vient de basculer du
  // bac a sable a la production. Dans le doute, on laisse en attente.
  if (!reponse.ok || json.success !== true) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    return inconnu(String(err.code ?? `HTTP_${reponse.status}`));
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const statut = String(data.status ?? '').toLowerCase();
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const nombre = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

  if (!statut) return inconnu('SANS_STATUT');

  return {
    accepte: ACCEPTES.has(statut),
    indetermine: !ACCEPTES.has(statut) && !REFUSES.has(statut),
    montant: nombre(data.amount),
    operateur: data.payment_method ? String(data.payment_method) : null,
    statutBrut: statut,
    frais: nombre(data.fees),
    net: nombre(data.net_amount),
    environnement: data.environment ? String(data.environment) : null,
    referenceInterne: metadata.reference ? String(metadata.reference) : null,
  };
}
