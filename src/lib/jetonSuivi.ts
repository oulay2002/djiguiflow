/**
 * La regle du jeton de suivi, en un seul endroit.
 *
 * POURQUOI ELLE EXISTE. `/api/suivi` et `/api/confirmation` n'exigeaient
 * aucune preuve autre que la reference de commande. Or les references de
 * production ne sont pas imprevisibles : la base porte des compteurs
 * sequentiels (`ATT-1000000006`) et des formes batie sur le telephone du
 * client (`APP-<telephone>-<horodatage unix en secondes>`). Avec le numero
 * d'un client, balayer une journee ne demandait que 86 400 essais — pour
 * obtenir son nom et son adresse de domicile, et, par le POST de confirmation,
 * ANNULER sa commande.
 *
 * POURQUOI DANS UN FICHIER A PART. Les deux routes doivent appliquer
 * exactement la meme regle, et la phase 4 consistera a en changer UNE ligne :
 * `JETON_EXIGE`. Recopiee dans deux routes, cette regle finirait par diverger,
 * et la moitie de la protection serait perdue sans que rien ne le dise.
 */
import { timingSafeEqual } from 'node:crypto';

/**
 * Le jeton est-il OBLIGATOIRE ?
 *
 * Faux pendant la phase 3, et c'est tout l'objet de cette phase : on tolere
 * l'absence, mais on la COMPTE. Des clients ont en ce moment des liens sans
 * jeton dans leur WhatsApp, pour des commandes en cours — exiger le jeton
 * aujourd'hui casserait leur suivi.
 *
 * Le passer a `true` est la phase 4. Ne le faire QUE lorsque le journal montre
 * qu'aucun acces legitime n'arrive plus sans jeton. Voir `JOURNAL_SANS_JETON`
 * pour le motif a compter.
 */
export const JETON_EXIGE = false;

/**
 * Le prefixe des lignes de journal a compter avant la phase 4.
 *
 * Stable et unique : c'est lui qu'on `grep`. Un libelle qui change d'une route
 * a l'autre rendrait le comptage faux, et l'on trancherait sur un chiffre
 * incomplet.
 */
export const JOURNAL_SANS_JETON = 'ACCES_SANS_JETON';

export type VerdictJeton = 'ok' | 'absent' | 'invalide';

/**
 * Comparaison a duree constante.
 *
 * Un jeton de 128 bits ne tombe pas a une attaque temporelle en pratique, mais
 * comparer en temps constant ne coute rien et retire la question. `length` est
 * compare AVANT : `timingSafeEqual` leve sur des longueurs differentes.
 */
function memeJeton(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Le jeton fourni prouve-t-il qu'il s'agit bien de cette commande ?
 *
 * - `ok`       : jeton fourni et correct.
 * - `absent`   : aucun jeton fourni. Tolere en phase 3, refuse en phase 4.
 * - `invalide` : un jeton a ete fourni et il ne correspond PAS. Toujours
 *                refuse, meme en phase 3 : un jeton faux n'est pas un vieux
 *                lien, c'est une tentative. Le tolerer rendrait le jeton
 *                purement decoratif.
 */
export function verdictJeton(
  fourni: string | null | undefined,
  attendu: string | null | undefined,
): VerdictJeton {
  const f = String(fourni ?? '').trim();
  const a = String(attendu ?? '').trim();

  if (!f) return 'absent';

  // La commande n'a pas de jeton (creee avant la migration) mais l'appelant en
  // presente un : il ne peut pas l'avoir recu de nous. C'est une tentative.
  if (!a) return 'invalide';

  return memeJeton(f, a) ? 'ok' : 'invalide';
}

/**
 * Faut-il refuser cet appel ?
 *
 * Un verdict `invalide` est TOUJOURS refuse. Un verdict `absent` ne l'est
 * qu'en phase 4.
 */
export function jetonRefuse(verdict: VerdictJeton): boolean {
  if (verdict === 'invalide') return true;
  return verdict === 'absent' && JETON_EXIGE;
}

/**
 * LA SECONDE PREUVE : les quatre derniers chiffres du telephone.
 *
 * POURQUOI ELLE EXISTE. La page `/suivi` laisse le client TAPER sa reference.
 * Ce chemin n'a pas de jeton, et la phase 4 le refuserait — or c'est
 * precisement le client qui a perdu son message WhatsApp, celui qui a le plus
 * besoin de suivre sa commande. Le punir serait le contraire du but.
 *
 * CE QU'ELLE VAUT, HONNETEMENT. Quatre chiffres, c'est 10 000 possibilites :
 * ce n'est pas un secret, c'est un OBSTACLE. Il ne tient que parce qu'il est
 * borne — voir `PLAFOND_PREUVES_PAR_COMMANDE`. Sans ce plafond, il tomberait
 * en quelques heures.
 *
 * Le client, lui, connait son numero et le tape du premier coup.
 */
export function verdictTelephone(
  quatreChiffres: string | null | undefined,
  telephoneComplet: string | null | undefined,
): VerdictJeton {
  const saisi = String(quatreChiffres ?? '').replace(/\D/g, '');
  if (!saisi) return 'absent';

  const attendu = String(telephoneComplet ?? '').replace(/\D/g, '');
  // Sans telephone en base, aucune preuve de ce type ne peut etre juste : on
  // refuse plutot que de laisser passer.
  if (attendu.length < 4) return 'invalide';

  return saisi.length === 4 && memeJeton(saisi, attendu.slice(-4)) ? 'ok' : 'invalide';
}

/**
 * Combien de preuves fausses une commande tolere par jour.
 *
 * C'EST CE PLAFOND QUI FAIT TENIR LES QUATRE CHIFFRES. Dix essais par jour et
 * par commande, c'est un millier de jours pour balayer 10 000 possibilites.
 * Le compteur porte la COMMANDE et non l'appelant : une attaque repartie sur
 * cent adresses ne gagne rien.
 *
 * Un client qui connait son numero le tape du premier coup ; les dix essais ne
 * genent que celui qui ne le connait pas.
 */
export const PLAFOND_PREUVES_PAR_COMMANDE = 10;

/**
 * Compte un acces sans jeton, pour pouvoir trancher la phase 4 sur un chiffre.
 *
 * CE QU'ON JOURNALISE, ET POURQUOI. L'age de la commande separe le vieux lien
 * legitime — un client qui suit une commande passee avant la migration — de
 * l'enumeration, qui frappe des references au hasard. L'adresse appelante
 * permet de voir si les acces viennent d'une seule source. La reference, elle,
 * n'y figure PAS : elle ne dirait rien de plus que l'age, et c'est un
 * identifiant de client.
 */
export function journaliserAccesSansJeton(params: {
  route: string;
  appelant: string;
  /** Age de la commande en heures, ou `null` si elle est introuvable. */
  ageHeures: number | null;
}): void {
  const { route, appelant, ageHeures } = params;
  console.warn(
    `${JOURNAL_SANS_JETON} route=${route} appelant=${appelant}`
      + ` age_heures=${ageHeures === null ? 'inconnu' : ageHeures}`,
  );
}

/** L'age d'une commande en heures, arrondi, ou `null` si la date manque. */
export function ageEnHeures(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 3_600_000));
}
