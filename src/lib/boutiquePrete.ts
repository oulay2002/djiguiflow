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
  /** `livraison` | `retrait` | `les_deux`. Decide si un livreur est exige. */
  modeRecuperation?: string | null;
};

/**
 * CETTE BOUTIQUE LIVRE-T-ELLE ?
 *
 * Le retrait a ouvert la plateforme a un commerce qui en etait EXCLU : un
 * maquis qui ne fait que de l'a-emporter ne pouvait pas vendre, faute d'un
 * groupe de livreurs qu'il n'aurait jamais rempli.
 *
 * TOUT CE QUI N'EST PAS EXPRESSEMENT « retrait » LIVRE. La colonne vaut
 * 'livraison' par defaut et une contrainte en ferme les valeurs, mais si une
 * valeur inconnue passait un jour, elle ne doit pas SUPPRIMER une exigence :
 * une faute de frappe en base ouvrirait alors la vente a des commandes que
 * personne ne peut porter. L'inconnu retombe donc du cote strict.
 */
export function boutiqueLivre(mode: unknown): boolean {
  return String(mode ?? '').trim() !== 'retrait';
}

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
 * LE GROUPE N'EST EXIGE QUE DE QUI LIVRE. C'est la seule condition qu'une
 * boutique de retrait ne peut pas remplir : elle n'a pas de livreur, elle n'en
 * aura pas, et la lui reclamer revenait a lui interdire de vendre. Le canal
 * client, lui, reste exige de tous — meme en retrait, il faut pouvoir dire au
 * client que sa commande est prete.
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
  if (boutiqueLivre(etat.modeRecuperation) && !rempli(etat.groupeLivreurs)) {
    manque.push('groupe_livreurs');
  }

  return manque.length ? { peutVendre: false, manque } : { peutVendre: true };
}

/**
 * LE CANAL QUE LA VITRINE ECRIT SUR CHAQUE COMMANDE — EN DUR, ET C'EST VOULU.
 *
 * Un client de la vitrine laisse un NUMERO. Telegram ne sait pas ecrire a un
 * numero : il lui faut un `chat_id`, que seul un client ayant deja parle au bot
 * possede. La commande porte donc `whatsapp`, toujours.
 *
 * ── POURQUOI CETTE VALEUR EST SORTIE DE LA ROUTE ───────────────────────────
 *
 * Le controle `vitrineSansCanalClient` ci-dessous repose ENTIEREMENT sur ce
 * fait. Si la route changeait sa valeur sans que la regle le sache, l'alerte
 * deviendrait silencieusement fausse : elle reclamerait un canal dont plus
 * personne ne se sert, et se tairait sur celui qui manque vraiment. Les deux
 * lisent donc la meme constante, et un garde relit le texte de la route.
 */
export const CANAL_DES_COMMANDES_VITRINE = 'whatsapp' as const;

/**
 * CETTE BOUTIQUE POURRA-T-ELLE PREVENIR UN CLIENT DE SA VITRINE ?
 *
 * ── CE QUE `boutiquePeutVendre` NE PEUT PAS VOIR ───────────────────────────
 *
 * Il accepte un canal client « wasender OU telegram », et il a raison pour ce
 * qu'il mesure : le marchand a bien un moyen de parler a quelqu'un.
 *
 * Mais la VITRINE, elle, ne choisit pas. Elle ecrit
 * `CANAL_DES_COMMANDES_VITRINE` sur chaque commande. Une boutique branchee en
 * Telegram SEUL passe donc son verdict, met sa vitrine en ligne, accepte des
 * commandes — et ses cinq notifications de livraison echouent toutes en 424.
 * Mesure du 3 septembre 2026 : c'etait le cas d'une des deux boutiques en
 * service.
 *
 * ── POURQUOI L'ALERTE VIENT AVANT LA COMMANDE ──────────────────────────────
 *
 * `client_non_prevenu` existe et fait son travail, mais APRES coup : il faut
 * qu'un vrai client ait commande et n'ait rien recu. « Tester ma boutique » le
 * dit aussi, a condition que le marchand le lance. Entre les deux, personne ne
 * previent l'exploitant — et le prix de l'attente est un client qui a commande
 * et qu'on laisse sans nouvelles.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 *
 * Il n'empeche RIEN. Bloquer la vente ferait disparaitre le marchand pendant
 * qu'il branche son canal — exactement ce que `boutiquePeutVendre` prend soin
 * de ne pas faire. C'est une alerte a l'exploitant, pas un verrou.
 */
export function vitrineSansCanalClient(
  etat: EtatBranchement & {
    /** `actif` : la vitrine est-elle servie au public en ce moment ? */
    enLigne: boolean;
  },
): boolean {
  // Hors ligne, personne ne peut y commander : il n'y a pas de client a perdre.
  if (!etat.enLigne) return false;
  if (estBoutiqueDeBanc(etat)) return false;

  // LE JETON DU CANAL QUE LA VITRINE ECRIRA, ET LUI SEUL. Accepter le jeton
  // Telegram ici rendrait ce controle identique a `boutiquePeutVendre` — donc
  // inutile, et muet sur le seul cas qu'il existe pour voir.
  return !rempli(etat.wasenderSecretId);
}
