/**
 * LE TEMOIN DU CHEMIN ENTRANT.
 *
 * POURQUOI IL EXISTE. Le secret d'un canal est verifie dans
 * `/api/internal/fiche`, et un refus y rend 401. Cote n8n, ce 401 faisait
 * echouer l'execution : bruyant, mais bruyant POUR TOUT LE MONDE — un inconnu
 * qui POSTe n'importe quoi sur l'URL publique du webhook d'un marchand faisait
 * sonner le salon de veille exactement comme une vraie panne. Le banc de
 * l'assistante laissait la meme trace rouge a chaque passage.
 *
 * On a donc rendu le refus silencieux dans n8n. CE FICHIER EST CE QUI REND CE
 * SILENCE ACCEPTABLE : sans lui, un vrai marchand dont le secret enregistre
 * aurait derive de celui que son fournisseur envoie verrait TOUS les messages
 * de ses clients refuses, et plus rien ne le dirait. Voir la regle
 * `canal-devie` dans la veille des chaines.
 *
 * CE QU'ON COMPTE, ET CE QU'ON NE COMPTE PAS. Deux entiers par boutique et par
 * jour : combien d'appels de canal acceptes, combien refuses. Aucun numero,
 * aucun message, aucune empreinte — la valeur presentee n'est jamais ecrite.
 * La table se purge d'elle-meme a sept jours.
 *
 * UN REFUS SEUL NE PROUVE RIEN. C'est le COUPLE qui parle : des refus AVEC des
 * acceptations, c'est un inconnu qui frappe a une porte qui fonctionne ; des
 * refus SANS aucune acceptation, c'est la porte du marchand qui ne s'ouvre
 * plus. Seul le second cas merite qu'on reveille quelqu'un.
 */

/** Appels de canal acceptes aujourd'hui pour cette boutique. */
export function cleCanalAccepte(slug: string): string {
  return `canal:ok:${slug}`;
}

/** Appels de canal refuses aujourd'hui pour cette boutique, secret invalide. */
export function cleCanalRefuse(slug: string): string {
  return `canal:refus:${slug}`;
}

/**
 * Appels sur un slug qui n'est AUCUNE boutique — et un seul seau pour tous.
 *
 * ── POURQUOI PAS UNE CLE PAR SLUG, COMME LES DEUX AU-DESSUS ────────────────
 *
 * Parce qu'ici le slug vient de l'appelant, et qu'il n'existe pas. Les deux
 * cles ci-dessus sont bornees par le nombre de boutiques ; celle-ci ne le
 * serait par rien. Quiconque POSTe des slugs au hasard creerait une ligne par
 * essai — on remplacerait un bruit d'alerte par une croissance de table, ce
 * qui est pire : le premier se voit, la seconde non.
 *
 * On perd le detail du slug, et c'est assume. Ce compteur ne sert pas a
 * enqueter : il sert a savoir qu'on frappe, et combien.
 *
 * ── POURQUOI SE TAIRE SUR CE CAS EST SUR ───────────────────────────────────
 *
 * L'URL du routeur WhatsApp est publiee : le depot est public et elle y figure
 * en clair. N'importe qui peut donc POSTer un slug invente, et jusqu'ici chaque
 * essai faisait sonner le salon de veille — un deni d'attention sur le seul
 * canal dont depend toute la surveillance.
 *
 * Le cas de 404 qui compte VRAIMENT — une boutique renommee dont la session
 * wasender pointe encore l'ancien slug, donc des messages perdus en silence —
 * n'est pas perdu pour autant : `verdictWebhook` le voit du COTE DU COMPTE,
 * en comparant l'adresse declaree chez le fournisseur a celle qu'on attend.
 * C'est meme plus fiable, puisque ca ne demande pas qu'un client ecrive.
 *
 * Si ce rapprochement disparaissait un jour, ce silence-ci redeviendrait un
 * angle mort. Les deux se tiennent : ne pas retirer l'un sans regarder l'autre.
 */
export function cleCanalSlugInconnu(): string {
  return 'canal:slug-inconnu';
}

/**
 * LE PLANCHER, ET IL VAUT EXACTEMENT UNE REQUETE.
 *
 * `Charger fiche` porte `retryOnFail` : il rejoue trois fois avant d'abandonner.
 * UN SEUL appel refuse laisse donc TROIS refus au compteur, et c'est pour ca
 * que ce plancher vaut trois et pas un — en dessous, on ne saurait meme pas
 * dire qu'une requete complete a ete refusee.
 *
 * Le reessai n'est pas un defaut a corriger ici : il rattrape une secousse de
 * Supabase sur le premier appel de chaque message client. Ce qu'il coute, c'est
 * de rendre le VOLUME de refus illisible — d'ou la regle ci-dessous, qui ne
 * s'appuie pas dessus.
 */
export const REFUS_AVANT_DE_CRIER = 3;

/**
 * LA REGLE, ECRITE UNE FOIS ET EPROUVABLE.
 *
 * Elle vivait d'abord en ligne dans la veille, ou personne ne pouvait la mettre
 * a l'epreuve sans monter toute une base. Sortie ici, elle se lit et se mute —
 * et c'est le seul endroit qui decide si l'on reveille quelqu'un.
 *
 * ── POURQUOI PAS UN SIMPLE SEUIL ───────────────────────────────────────────
 *
 * La premiere version disait « beaucoup de refus, aucune acceptation ». Elle
 * separait mal : avec le reessai, une poignee de sondes d'inconnu franchit
 * n'importe quel seuil bas, et un PETIT marchand dont le canal est mort n'en
 * franchit aucun de haut — trois messages perdus dans la journee, c'est neuf
 * refus. Or c'est exactement ce marchand-la qu'on ne peut pas se permettre de
 * manquer. Un seuil ne peut pas servir les deux bouts.
 *
 * ── LE DISCRIMINANT QUI TIENT : HIER ───────────────────────────────────────
 *
 * On ne compare pas un volume a une constante, on compare le marchand a
 * lui-meme. Sa porte s'ouvrait cette semaine, elle ne s'ouvre plus aujourd'hui,
 * et on frappe : son canal a derive. La table garde sept jours, ce qui est
 * exactement la fenetre dont cette regle a besoin.
 *
 *   - inconnu qui sonde un marchand actif    → il a des acceptations, on se tait
 *   - petit marchand dont le canal est mort  → une requete refusee suffit
 *   - marchand sans aucun trafic de la semaine → on se tait, et c'est assume :
 *     aucun client n'est en train d'etre perdu, et rien ne prouve la panne
 *
 * ⚠ LE PREMIER JOUR, ELLE EST MUETTE. Tant que la semaine ecoulee ne contient
 * aucune acceptation comptee, `acceptesSeptJours` vaut zero pour tout le monde
 * et la regle ne peut rien conclure. C'est le prix d'une regle qui compare le
 * marchand a son propre passe, et il ne se paie qu'une fois.
 */
export function canalADerive(compte: {
  /** Refus du jour, reessais compris. */
  refuses: number;
  /** Appels de canal acceptes aujourd'hui. */
  acceptes: number;
  /** Appels de canal acceptes sur les sept jours gardes, aujourd'hui compris. */
  acceptesSeptJours: number;
}): boolean {
  // Sa porte s'ouvre : quoi qu'il arrive a cote, son canal va bien.
  if (compte.acceptes > 0) return false;

  // Elle ne s'est jamais ouverte de la semaine : on n'a rien a quoi comparer,
  // et aucun client connu n'est en train d'etre perdu.
  if (compte.acceptesSeptJours <= 0) return false;

  return compte.refuses >= REFUS_AVANT_DE_CRIER;
}
