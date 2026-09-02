/**
 * LA COURBE DES SEPT JOURS, ET SON TOTAL — calcules ensemble, une seule fois.
 *
 * ── LE DEFAUT QU'ELLE FERME ────────────────────────────────────────────────
 *
 * L'accueil affichait, dans une carte titree « Evolution du CA · 7 jours », un
 * bandeau « <montant> F au total ». Ce montant etait `caTotal` : la somme de
 * TOUTES les commandes depuis l'ouverture, sans aucun filtre de date.
 *
 * Mesure du 2 septembre 2026 sur le compte de banc : bandeau a 29 500 F,
 * courbe PLATE A ZERO sur les sept jours, « Ventes du jour » a 0 F. Le
 * marchand lisait deux nombres qui ne disaient pas la meme chose, dans la meme
 * carte, sans aucun moyen de savoir lequel croire.
 *
 * Ce n'est pas un detail d'affichage : c'est le chiffre sur lequel un
 * commercant juge sa semaine. Gonfle par son historique, il masque une semaine
 * creuse — exactement le moment ou il aurait fallu qu'il s'en apercoive.
 *
 * ── POURQUOI LE TOTAL EST LA SOMME DES POINTS, ET NON UN SECOND CALCUL ─────
 *
 * Recalculer le total « sur sept jours » a cote de la serie, c'est deux
 * exemplaires d'une meme fenetre — donc deux fenetres le jour ou l'une bouge.
 * Le total rendu ici est la somme des points DESSINES : ils ne peuvent plus
 * diverger, parce qu'ils sont le meme calcul.
 *
 * ── LA JOURNEE EST CELLE D'ABIDJAN, ET C'EST PAR CHANCE ────────────────────
 *
 * Le decoupage se fait sur les dix premiers caracteres d'un horodatage ISO,
 * donc en UTC. Abidjan est a UTC+0 toute l'annee : la journee civile du
 * marchand et la journee UTC coincident. Ce comportement est conserve tel quel
 * — le changer deplacerait silencieusement les chiffres deja lus par le
 * marchand. A rouvrir seulement si la plateforme sort du fuseau.
 */

export type LigneVente = {
  total: number | null;
  created_at: string | null;
};

export type PointVente = {
  /** Libelle court pour l'axe : « lun. 01 ». */
  jour: string;
  ca: number;
  nb: number;
};

export type SerieVentes = {
  points: PointVente[];
  /** La somme des `ca` ci-dessus. Jamais recalculee ailleurs. */
  total: number;
};

/** Le nombre de jours dessines. La carte l'annonce dans son titre. */
export const JOURS_DE_SERIE = 7;

/**
 * @param maintenant injecte pour que le banc ne depende pas de l'heure qu'il
 *   est — un test qui ne passe pas le lundi n'est pas un test.
 */
export function serieDesVentes(
  commandes: LigneVente[],
  maintenant: Date = new Date(),
): SerieVentes {
  const cle = (iso: string | null) => String(iso ?? '').slice(0, 10);

  const points: PointVente[] = [];
  for (let i = JOURS_DE_SERIE - 1; i >= 0; i--) {
    const d = new Date(maintenant);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const duJour = commandes.filter((c) => cle(c.created_at) === k);
    points.push({
      jour: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' }),
      ca: duJour.reduce((s, c) => s + Number(c.total ?? 0), 0),
      nb: duJour.length,
    });
  }

  return { points, total: points.reduce((s, p) => s + p.ca, 0) };
}
