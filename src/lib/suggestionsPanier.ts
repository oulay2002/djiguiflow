/**
 * CE QU'ON PROPOSE AU CLIENT — quand son panier est vide, et quand il l'a
 * commence.
 *
 * DEUX PLACES PERDUES SUR LA VITRINE. Le bon de commande vide occupe une
 * colonne entiere pour dire « Ajoutez un article, il s'inscrit ici » ; et une
 * fois le premier article choisi, rien n'invite jamais au second. Un client qui
 * ne trouve pas d'idee s'arrete a un article.
 *
 * ON NE DEVINE PAS A LA PLACE DU MARCHAND. Il n'existe aucune donnee de vente
 * exploitable ici, et inventer un « souvent achete ensemble » a partir de rien
 * serait un mensonge. Le seul signal de mise en avant qu'il nous donne est
 * `menu_du_jour` : c'est celui qu'on suit.
 *
 * AUCUN IMPORT VERS SUPABASE NI VERS REACT, comme ses voisins `retrait.ts`,
 * `horaires.ts` et `objectifsPanier.ts`.
 */

/** Le strict minimum pour choisir. La vitrine passe ses `Produit` tels quels. */
export type ArticleSuggerable = {
  id: string;
  categorie?: string | null;
  prix?: number | null;
  duJour?: boolean | null;
  /** `null` ou absent = le marchand ne compte pas ce produit. Jamais zero. */
  stock?: number | null;
  /** Articles de meme `groupe` = un seul article en plusieurs coloris. */
  groupe?: string | null;
  /** La caracteristique nommee par le marchand : Pointure, Taille, Contenance. */
  attributNom?: string | null;
  attributValeurs?: string[] | null;
};

/**
 * PROPOSABLE, OU PAS.
 *
 * Trois refus, et chacun ferme un defaut deja rencontre dans ce depot :
 *
 *   - EPUISE : `stock` n'exclut que sur un vrai nombre a zero ou moins.
 *     `null` veut dire « le marchand ne compte pas », jamais « il n'y en a
 *     plus » — les confondre viderait la vitrine des boutiques qui ne suivent
 *     pas leur stock, c'est-a-dire la plupart.
 *
 *   - PRIX NUL : un article a zero franc est un defaut de saisie, pas une
 *     offre. Le mettre EN AVANT serait aggraver le defaut ferme le 29 aout,
 *     ou un espace dans « 12 000 » livrait l'article gratuitement.
 *
 *   - DEJA AU PANIER : proposer ce qu'il a deja passe pour un bug.
 *
 *   - A DECLINAISON : une suggestion s'ajoute d'un seul geste, sans quitter le
 *     bon de commande. Un article qui exige une pointure ou une taille ne peut
 *     donc PAS y figurer : le bouton enverrait une variante vide, et le client
 *     recevrait une taille qu'il n'a pas choisie. Il reste dans la grille, ou
 *     le choix lui est offert. Voir la memoire « caracteristique d'article et
 *     declinaisons ».
 */
function proposable(p: ArticleSuggerable, auPanier: Set<string>): boolean {
  if (auPanier.has(p.id)) return false;
  if (typeof p.stock === 'number' && p.stock <= 0) return false;
  if (typeof p.prix !== 'number' || !Number.isFinite(p.prix) || p.prix <= 0) return false;
  if (Array.isArray(p.attributValeurs) && p.attributValeurs.length > 0) return false;
  return true;
}

export function suggestionsPanier<T extends ArticleSuggerable>(a: {
  catalogue: T[];
  /** Identifiants deja au panier. */
  auPanier: string[];
  /** Categories deja representees au panier — sert a COMPLETER, pas a repeter. */
  categoriesAuPanier?: (string | null | undefined)[];
  combien: number;
}): T[] {
  if (!Array.isArray(a.catalogue) || a.combien <= 0) return [];

  const dedans = new Set(a.auPanier);
  const dejaVues = new Set(
    (a.categoriesAuPanier ?? []).filter(Boolean).map(c => String(c)),
  );

  const retenus: T[] = [];
  const groupesVus = new Set<string>();

  for (const p of a.catalogue) {
    if (!proposable(p, dedans)) continue;
    // UN GROUPE = UN SEUL ARTICLE. Trois coloris du meme t-shirt occuperaient
    // trois places pour ne dire qu'une chose.
    if (p.groupe) {
      if (groupesVus.has(p.groupe)) continue;
      groupesVus.add(p.groupe);
    }
    retenus.push(p);
  }

  /**
   * L'ORDRE, ET POURQUOI IL N'Y A AUCUN HASARD.
   *
   * Un tirage aleatoire ferait diverger le rendu serveur du rendu navigateur —
   * l'hydratation casse bruyamment — et rendrait les tests instables. Le tri
   * est donc total et stable :
   *
   *   1. une categorie que le panier n'a pas encore (on COMPLETE le repas) ;
   *   2. le menu du jour, seul signal de mise en avant du marchand ;
   *   3. l'ordre du catalogue, qui est celui que le marchand a choisi.
   */
  const rang = (p: T): number => {
    const complete = dejaVues.size > 0 && p.categorie && !dejaVues.has(String(p.categorie));
    return (complete ? 0 : 2) + (p.duJour ? 0 : 1);
  };

  return retenus
    .map((p, i) => ({ p, i, r: rang(p) }))
    .sort((x, y) => (x.r - y.r) || (x.i - y.i))
    .slice(0, a.combien)
    .map(x => x.p);
}
