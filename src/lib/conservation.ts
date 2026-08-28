/**
 * Combien de temps la plateforme garde une donnée personnelle — et pourquoi.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * Rien n'effaçait jamais rien. Un numéro de téléphone collecté aujourd'hui y
 * serait encore dans dix ans, sans que personne l'ait décidé — par simple
 * absence de décision.
 *
 * Le régulateur ivoirien, l'ARTCI, tient la conservation illimitée pour un
 * manquement en soi : on ne garde une donnée que le temps nécessaire à la
 * raison pour laquelle on l'a prise. Ces durées sont donc la première pièce
 * d'un protocole de protection — avant tout document, parce qu'un document
 * décrit alors que celles-ci agissent.
 *
 * ELLES SONT POSÉES MAINTENANT PARCE QUE C'EST GRATUIT. Soixante-trois
 * commandes, quatre paniers, un livreur : effacer se prouve en une seconde.
 * Dans six mois, sur des milliers de lignes appartenant à de vrais marchands,
 * la même règle devient une migration qu'on n'ose plus lancer.
 *
 * ── CE QU'ON EFFACE, ET CE QU'ON GARDE ─────────────────────────────────────
 *
 * Une commande n'est pas seulement une donnée personnelle : c'est aussi la
 * comptabilité du marchand. On ne la SUPPRIME donc pas, on l'ANONYMISE — le
 * montant, la date et les articles restent, le nom, le téléphone, l'adresse et
 * la position s'en vont. Le marchand garde son chiffre d'affaires ; le client
 * n'est plus dans la base.
 *
 * Un panier abandonné, lui, appartient à quelqu'un qui N'A JAMAIS COMMANDÉ.
 * Il n'y a aucune comptabilité à préserver, et c'est le traitement le plus
 * exposé de toute la plateforme : on y garde le nom et le numéro d'une
 * personne dans le seul but de la démarcher. Il se supprime, entièrement.
 */

/**
 * ── L'EXCEPTION QUI COMPTE PLUS QUE LES RÈGLES ─────────────────────────────
 *
 * `relances_stop` NE S'EFFACE JAMAIS.
 *
 * Une personne qui a écrit STOP a exprimé un refus. Effacer ce refus au nom de
 * la minimisation le retournerait contre elle : la liste vidée, plus rien
 * n'empêcherait de la démarcher à nouveau — et elle devrait redemander ce
 * qu'elle avait déjà demandé.
 *
 * Une règle de conservation ne doit jamais effacer la trace d'un droit exercé.
 * C'est la seule donnée qu'on garde SANS limite, et elle se réduit à un numéro
 * et une date : le strict nécessaire pour honorer le refus.
 */
export const CONSERVATION_STOP_ILLIMITEE = true;

/**
 * Paniers non convertis : 30 jours.
 *
 * La relance d'abandon vise les heures qui suivent, jamais les semaines. Passé
 * un mois, ce numéro ne sert plus à rien — il ne reste qu'un risque.
 */
export const JOURS_PANIER_ABANDONNE = 30;

/**
 * Commandes : 12 mois avant anonymisation.
 *
 * Assez long pour un litige, une réclamation ou un exercice comptable ; assez
 * court pour qu'on ne détienne pas l'adresse de quelqu'un des années après lui
 * avoir livré un plat.
 */
export const MOIS_AVANT_ANONYMISATION = 12;

/**
 * Traces de relance : 90 jours.
 *
 * Elles existent pour tenir la règle « une relance par personne et par mois ».
 * Trois mois couvrent largement cette fenêtre ; au-delà, garder le numéro ne
 * sert plus le frein, il ne fait que grossir ce qu'on détient.
 */
export const JOURS_TRACE_RELANCE = 90;

/**
 * Ce qu'une commande anonymisée ne porte plus.
 *
 * `chat_id` EN FAIT PARTIE, et ce n'est pas évident : ce n'est pas un nom, mais
 * c'est l'adresse WhatsApp ou Telegram par laquelle on joint la personne. La
 * laisser reviendrait à dire « nous avons effacé son identité » tout en gardant
 * de quoi lui écrire.
 *
 * `instructions` aussi : « sonnez chez la voisine du 2e » désigne un domicile
 * aussi sûrement qu'une adresse.
 */
/**
 * `client_nom`, `client_telephone` et `client_adresse` sont NOT NULL en base :
 * ils se VIDENT, ils ne s'annulent pas. Les autres acceptent `null`.
 * Verifie au schema, pas suppose.
 */
export const CHAMPS_A_EFFACER = [
  'client_nom',
  'client_telephone',
  'client_adresse',
  'chat_id',
  'instructions',
  'latitude',
  'longitude',
  'position_livreur',
] as const;

/** Ce qu'on écrit à la place, pour que l'écran ne montre pas un trou muet. */
export const NOM_ANONYME = 'Client (données effacées)';

/**
 * Les statuts qui closent une commande.
 *
 * TROIS ENDROITS EN DÉPENDENT : la purge nocturne, l'effacement demandé par un
 * client, et la règle ci-dessous. Recopiée, cette liste divergerait — et la
 * divergence se paierait en commandes anonymisées alors qu'elles sont encore en
 * cours, ou jamais anonymisées parce qu'un statut manque à une copie.
 */
export const STATUTS_CLOS = ['livree', 'annulee', 'abandonnee'] as const;

/**
 * Une commande est-elle prête à être anonymisée ?
 *
 * ELLE DOIT ÊTRE CLOSE, pas seulement ancienne. Une commande vieille de treize
 * mois encore « en attente » est une anomalie qu'il faut regarder, pas une
 * donnée à effacer : l'anonymiser ferait disparaître le moyen de la comprendre.
 */
export function peutEtreAnonymisee(a: {
  created_at: unknown;
  statut: unknown;
  client_nom: unknown;
}, maintenant = new Date()): boolean {
  const ne = Date.parse(String(a.created_at ?? ''));
  if (!Number.isFinite(ne)) return false;

  const limite = new Date(maintenant);
  limite.setMonth(limite.getMonth() - MOIS_AVANT_ANONYMISATION);
  if (ne > limite.getTime()) return false;

  const statut = String(a.statut ?? '').trim().toLowerCase();
  if (!(STATUTS_CLOS as readonly string[]).includes(statut)) return false;

  // Déjà anonymisée : on ne repasse pas dessus, sinon chaque balayage
  // rapporterait le même travail comme s'il venait d'être fait.
  return String(a.client_nom ?? '') !== NOM_ANONYME;
}
