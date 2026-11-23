/**
 * La cle d'envoi : ce qui permet de refuser une commande en double.
 *
 * ── LE DEFAUT ──────────────────────────────────────────────────────────────
 *
 * Quand la connexion tombe pendant l'envoi, le client ne sait pas si sa
 * commande est arrivee : la demande a pu partir et sa reponse se perdre. Il
 * reessaie. Rien, cote serveur, ne distinguait ce second envoi d'une nouvelle
 * commande : deux lignes en base, deux alertes au marchand, deux courses
 * proposees aux livreurs, et un stock decompte deux fois. Le tampon
 * « SANS REPONSE » previent le client ; il ne protege de rien.
 *
 * ── LA REGLE ───────────────────────────────────────────────────────────────
 *
 * La vitrine tire une cle au hasard et l'envoie avec la commande. Tant que le
 * client renvoie LA MEME commande, elle renvoie LA MEME cle : le serveur
 * reconnait le second envoi et rend la commande deja enregistree, sans rien
 * refaire. Une contrainte d'unicite en base tient la regle meme si deux envois
 * arrivent au meme instant.
 *
 * ── CE QUI FAIT « LA MEME COMMANDE » ───────────────────────────────────────
 *
 * Une empreinte : le panier, le numero et le mode. Des que l'un des trois
 * change, la cle change — c'est une autre commande, et elle doit passer. Sans
 * cela, un client qui corrige son panier apres un echec se verrait rendre
 * l'ancienne commande a la place de la nouvelle.
 *
 * ── CE QU'ELLE N'EST PAS ───────────────────────────────────────────────────
 *
 * Une preuve d'identite. Elle evite un doublon, elle n'ouvre aucun droit :
 * le serveur ne rend une commande existante que si le NUMERO concorde aussi.
 */

/** Ce qu'il faut d'un stockage : lu et ecrit, rien de plus. */
export type StockageCle = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const FORME = /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i;

/**
 * La cle telle que le serveur l'accepte, ou une chaine vide.
 *
 * Vide ne refuse PAS la commande : un ancien onglet, ou un client sans
 * stockage, n'envoie pas de cle et commande comme avant. Une cle mal formee
 * est ignoree de la meme facon — on ne l'ecrit pas en base.
 */
export function cleEnvoiRecevable(valeur: unknown): string {
  const v = typeof valeur === 'string' ? valeur.trim().toLowerCase() : '';
  return FORME.test(v) ? v : '';
}

export function clefDeLaCle(slug: string): string {
  return `djiguiflow:cle-envoi:${slug}`;
}

/** L'empreinte de ce qui est commande : le meme envoi rend la meme chaine. */
export function empreinteEnvoi(a: {
  panier: Record<string, number>;
  telephone: string;
  mode: string;
}): string {
  const lignes = Object.entries(a.panier).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return JSON.stringify([lignes, a.telephone.replace(/\D/g, ''), a.mode]);
}

/**
 * La cle a envoyer pour cette empreinte.
 *
 * Rend la cle deja tiree si l'empreinte n'a pas change, sinon en tire une
 * neuve et la garde. Garde dans le stockage de l'onglet, et non en memoire :
 * le client qui recharge la page apres un « SANS REPONSE » doit retrouver SA
 * cle, sans quoi le rechargement suffirait a fabriquer un doublon.
 *
 * Sans stockage (navigation privee, quota), la cle est tiree a chaque appel :
 * la protection ne joue plus, la commande passe quand meme.
 */
export function clePourEnvoi(
  stockage: StockageCle | null,
  clef: string,
  empreinte: string,
  tirer: () => string,
): string {
  try {
    const brut = stockage?.getItem(clef);
    if (brut) {
      const lu = JSON.parse(brut) as { empreinte?: unknown; cle?: unknown };
      const connue = cleEnvoiRecevable(lu?.cle);
      if (connue && lu?.empreinte === empreinte) return connue;
    }
  } catch {
    // Illisible : on en tire une neuve, comme s'il n'y avait rien.
  }

  const neuve = cleEnvoiRecevable(tirer());
  try {
    if (neuve) stockage?.setItem(clef, JSON.stringify({ empreinte, cle: neuve }));
  } catch {
    // Stockage refuse : la cle sert pour cet envoi, pas pour le suivant.
  }
  return neuve;
}

/** La commande est partie : la prochaine sera une autre commande. */
export function oublierCle(stockage: StockageCle | null, clef: string): void {
  try {
    stockage?.removeItem(clef);
  } catch {
    // Rien a oublier si le stockage est indisponible.
  }
}
