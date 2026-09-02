/**
 * LA PÉRIODE CHOISIE SUR L'ÉCRAN « PILOTAGE DÉTAILLÉ », ET SA CROISSANCE.
 *
 * ── LES DEUX DÉFAUTS QUE CE FICHIER FERME ──────────────────────────────────
 *
 * **1. Le sélecteur de période ne filtrait rien.** « Cette semaine », « Ce
 * mois », « Cette année » relançaient une requête SANS aucune borne de date :
 * les trois options rendaient exactement les mêmes chiffres. L'écran s'intitule
 * pourtant « Ce que vos chiffres disent de la période choisie ».
 *
 * Un contrôle qui prétend filtrer et ne filtre pas est pire qu'un contrôle
 * absent : le marchand croit avoir mesuré sa semaine.
 *
 * **2. La « croissance » n'en était pas une.** Le code coupait la liste des
 * commandes EN DEUX PAR LE NOMBRE — pas par le temps — et comparait le chiffre
 * d'affaires de la première moitié à celui de la seconde. Mesuré le 2 septembre
 * 2026 sur le compte de banc : 7 commandes, 11 000 F contre 18 500 F, affiché
 * « +68,2 % ».
 *
 * Ce n'est pas une comparaison de périodes : c'est « mes N/2 dernières
 * commandes contre mes N/2 premières », quelle que soit leur date. Et sur un
 * nombre impair la seconde moitié compte une commande de plus, donc le chiffre
 * penche à la hausse par construction.
 *
 * ── CE QUE « CETTE SEMAINE » VEUT DIRE ─────────────────────────────────────
 *
 * Le calendrier, pas une fenêtre glissante : la semaine commence le LUNDI, le
 * mois le 1er, l'année le 1er janvier. C'est ce qu'un commerçant entend par
 * « ce mois-ci », et c'est ce que disent les libellés.
 *
 * La période précédente a EXACTEMENT la même nature : la semaine d'avant, le
 * mois d'avant, l'année d'avant. Comparer une semaine entamée à une semaine
 * pleine est déjà trompeur ; comparer à autre chose le serait davantage.
 *
 * ⚠ Le comptage se fait en heure d'Abidjan, qui est UTC toute l'année. Les
 * bornes sont donc construites en UTC — le reste du dépôt fait de même.
 */

export type Periode = 'week' | 'month' | 'year';

export type Fenetre = {
  /** Début inclus. */
  debut: Date;
  /** Début de la période précédente, de même nature. */
  debutPrecedent: Date;
};

export function fenetrePeriode(periode: Periode, maintenant: Date = new Date()): Fenetre {
  const a = maintenant.getUTCFullYear();
  const m = maintenant.getUTCMonth();
  const j = maintenant.getUTCDate();

  if (periode === 'year') {
    return {
      debut: new Date(Date.UTC(a, 0, 1)),
      debutPrecedent: new Date(Date.UTC(a - 1, 0, 1)),
    };
  }

  if (periode === 'month') {
    return {
      debut: new Date(Date.UTC(a, m, 1)),
      debutPrecedent: new Date(Date.UTC(a, m - 1, 1)),
    };
  }

  // LUNDI, ET NON DIMANCHE. `getUTCDay()` rend 0 pour dimanche : le dimanche
  // doit reculer de six jours, pas de zéro — sans quoi une commande du
  // dimanche ouvrirait une semaine à elle seule.
  const jourSemaine = maintenant.getUTCDay();
  const reculLundi = (jourSemaine + 6) % 7;
  const lundi = new Date(Date.UTC(a, m, j - reculLundi));
  return {
    debut: lundi,
    debutPrecedent: new Date(Date.UTC(a, m, j - reculLundi - 7)),
  };
}

export type LigneDatee = { created_at: string | null; total?: number | null };

/** Les lignes de la période : de `debut` inclus à maintenant. */
export function dansLaPeriode<T extends LigneDatee>(lignes: T[], f: Fenetre): T[] {
  const debut = f.debut.getTime();
  return lignes.filter((l) => {
    const t = Date.parse(String(l.created_at ?? ''));
    return Number.isFinite(t) && t >= debut;
  });
}

/** Les lignes de la période PRÉCÉDENTE, de même nature et de même durée. */
export function periodePrecedente<T extends LigneDatee>(lignes: T[], f: Fenetre): T[] {
  const debut = f.debutPrecedent.getTime();
  const fin = f.debut.getTime();
  return lignes.filter((l) => {
    const t = Date.parse(String(l.created_at ?? ''));
    return Number.isFinite(t) && t >= debut && t < fin;
  });
}

const somme = (lignes: LigneDatee[]) =>
  lignes.reduce((s, l) => s + Number(l.total ?? 0), 0);

/**
 * La croissance en pourcentage, ou `null` quand elle ne veut rien dire.
 *
 * `null` ET NON ZÉRO. Une période précédente vide donne une division par zéro ;
 * l'ancien code rendait alors `0`, que le marchand lit « je stagne » alors que
 * la vérité est « il n'y a rien à comparer ». C'est le motif du défaut
 * silencieux : une valeur par défaut qui masque une donnée absente.
 */
export function croissanceRevenu(
  lignes: LigneDatee[],
  f: Fenetre,
): number | null {
  const avant = somme(periodePrecedente(lignes, f));
  if (avant <= 0) return null;
  const maintenant = somme(dansLaPeriode(lignes, f));
  return ((maintenant - avant) / avant) * 100;
}
