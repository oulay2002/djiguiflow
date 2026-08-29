/**
 * Le prix d'un article : lu strictement, ou refusé.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * La route d'enregistrement écrivait `prix: Number(prix) || 0`. Ce `|| 0` avale
 * TOUT ce qu'il ne sait pas lire — une chaîne vide, un texte, `NaN` — et le
 * transforme en zéro. L'article part alors en base à **0 franc**, la vitrine
 * l'affiche à 0, un client le commande à 0, et le marchand le livre gratuitement.
 * Il ne l'apprend qu'après.
 *
 * Ce n'était pas théorique. Le champ du tableau de bord s'annonce
 * « Prix (FCFA) * » — l'étoile promet une obligation — et RIEN ne l'imposait,
 * ni à l'écran, ni au serveur. Un marchand pressé qui laisse le champ vide
 * créait un article gratuit sans le moindre avertissement.
 *
 * C'est le motif du défaut silencieux dans sa forme la plus coûteuse : une
 * valeur par défaut qui masque une donnée manquante, sur ce que le marchand
 * gagne.
 *
 * ── CE QU'ON ACCEPTE, ET CE QU'ON REFUSE ───────────────────────────────────
 *
 * ZÉRO EST ACCEPTÉ QUAND IL EST ÉCRIT. « Offert » est une décision commerciale
 * légitime, et un marchand qui tape 0 sait ce qu'il fait. Ce qu'on refuse,
 * c'est le zéro qu'on n'a pas choisi : l'absence et l'illisible.
 *
 * On refuse aussi le négatif — un prix négatif n'a aucun sens et créerait un
 * total négatif — et l'infini, que `Number('1e999')` produit sans broncher.
 */

export type PrixLu =
  | { ok: true; prix: number }
  | { ok: false; message: string };

/**
 * Le plafond, à cent millions de francs.
 *
 * Il n'est pas là pour brider le marchand mais pour attraper la faute de
 * frappe : un zéro de trop sur un prix se voit mal à la relecture, et se
 * paierait à la première commande.
 */
export const PRIX_MAXIMUM = 100_000_000;

export function prixRecevable(brut: unknown): PrixLu {
  // `null`, `undefined` et la chaîne vide sont la MÊME chose ici : le marchand
  // n'a rien saisi. On ne devine pas à sa place.
  if (brut === null || brut === undefined || (typeof brut === 'string' && !brut.trim())) {
    return { ok: false, message: 'Le prix est obligatoire.' };
  }

  // Un booléen passe `Number()` sans broncher — `Number(true)` vaut 1 — et
  // deviendrait un article à un franc.
  if (typeof brut !== 'number' && typeof brut !== 'string') {
    return { ok: false, message: 'Le prix doit être un nombre.' };
  }

  const n = Number(brut);

  /**
   * `Number('12 000')` vaut `NaN`, et c'est le cas le plus probable de tous :
   * l'espace est le séparateur de milliers en français. Un marchand qui écrit
   * son prix comme il l'écrirait sur une ardoise tombe exactement ici.
   */
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      message: 'Le prix doit être un nombre, sans espace ni lettre (ex. 12000).',
    };
  }

  if (n < 0) return { ok: false, message: 'Le prix ne peut pas être négatif.' };

  if (n > PRIX_MAXIMUM) {
    return {
      ok: false,
      message: `Ce prix dépasse ${PRIX_MAXIMUM.toLocaleString('fr-FR')} F. Vérifiez le nombre de zéros.`,
    };
  }

  // Les francs CFA n'ont pas de centimes. On arrondit plutôt que de refuser :
  // un prix collé depuis un tableur peut porter une décimale sans que ce soit
  // une erreur du marchand.
  return { ok: true, prix: Math.round(n) };
}
