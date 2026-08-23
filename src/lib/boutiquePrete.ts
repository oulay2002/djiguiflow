/**
 * Une boutique peut-elle recevoir une commande ?
 *
 * SORTIE DE LA ROUTE POUR ETRE EPROUVEE. La regle vivait en ligne dans
 * `commander/route.ts`, au milieu des freins, de la tarification et du stock :
 * la tester demandait de simuler tout le reste, donc personne ne la testait.
 * Elle a casse le banc de chaine des son premier passage.
 *
 * Un test qui RECOPIE la regle ne prouverait rien ; celui qui accompagne ce
 * fichier appelle la meme fonction que la production.
 */

export type EtatBranchement = {
  /** Boutique d'essai : sa chaine s'arrete avant n8n. */
  essai?: boolean | null;
  /** Salon vers lequel tout message est detourne. Marqueur du banc de chaine. */
  bancTelegramId?: string | null;
  /** Jeton wasender au coffre. */
  wasenderSecretId?: string | null;
  /** Jeton Telegram au coffre. */
  telegramSecretId?: string | null;
  /** Groupe Telegram des livreurs. */
  groupeLivreurs?: string | null;
};

export type VerdictBranchement =
  | { peutVendre: true }
  | { peutVendre: false; manque: ('canal_client' | 'groupe_livreurs')[] };

const rempli = (v: unknown) => Boolean(String(v ?? '').trim());

/**
 * DEUX MARQUEURS DE BANC, ET IL EN FAUT DEUX.
 *
 * `essai` couvre le banc multi-marchand, qui s'arrete AVANT n8n.
 *
 * Il ne couvre PAS le banc de chaine : celui-la porte `essai = false` EXPRES,
 * pour que la chaine s'execute en entier, et se protege autrement — par
 * `banc_telegram_id`, qui detourne tout message sortant vers le salon de
 * veille. N'avoir teste que `essai` l'a casse des le premier passage : HTTP 409,
 * plus aucune execution n8n.
 */
export function estBoutiqueDeBanc(etat: EtatBranchement): boolean {
  return etat.essai === true || rempli(etat.bancTelegramId);
}

/**
 * « Branchee » veut dire deux choses, et rien de plus : un canal pour parler au
 * CLIENT, un groupe pour lancer un LIVREUR. Ce sont exactement les `BLOQUANTS`
 * du diagnostic.
 *
 * PAS LE CATALOGUE. Une boutique sans article est deja invisible ; l'ecarter
 * ici la ferait disparaitre pendant qu'elle remplit sa vitrine.
 */
export function boutiquePeutVendre(etat: EtatBranchement): VerdictBranchement {
  if (estBoutiqueDeBanc(etat)) return { peutVendre: true };

  const manque: ('canal_client' | 'groupe_livreurs')[] = [];
  if (!rempli(etat.wasenderSecretId) && !rempli(etat.telegramSecretId)) {
    manque.push('canal_client');
  }
  if (!rempli(etat.groupeLivreurs)) manque.push('groupe_livreurs');

  return manque.length ? { peutVendre: false, manque } : { peutVendre: true };
}
