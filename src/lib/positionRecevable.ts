/**
 * La position peut-elle encore etre donnee pour cette commande ?
 *
 * POURQUOI CE FICHIER EXISTE. La regle est appliquee a DEUX endroits qui
 * doivent dire exactement la meme chose :
 *
 *   1. `/api/confirmation/position`, qui ACCEPTE ou refuse le point ;
 *   2. la page de confirmation, qui decide d'AFFICHER le bouton ou non.
 *
 * Recopiee, elle finirait par diverger — et la divergence se paie d'un cote
 * precis : la page proposerait un bouton que la route refuse. Le client
 * appuierait, verrait « ⚠️ Position non enregistree », et n'appuierait plus
 * jamais. **Un bouton qui echoue est pire que pas de bouton.** C'est la meme
 * raison qui avait fait naitre `jetonSuivi.ts`.
 *
 * CE QUI A MENE ICI. Mesure du 24 aout 2026 : zero position capturee sur
 * soixante commandes, en trois semaines d'existence du bouton. La cause
 * n'etait pas le refus des clients — c'est que `dejaRepondu()` rendait une
 * page nue. Le bouton n'existait que sur la reponse au clic « Je confirme »,
 * vue une seule fois : un client qui changeait d'onglet, fermait, ou rouvrait
 * son lien ne le revoyait JAMAIS.
 */

/** Au-dela, le livreur est deja passe ou la commande n'a plus de sens. */
export const FENETRE_POSITION_H = 24;

/** Une commande terminee ne se deplace plus. */
export const STATUTS_TERMINES = new Set(['livree', 'annulee', 'abandonnee']);

export type LignePosition = {
  statut?: string | null;
  created_at?: string | null;
};

export function positionRecevable(ligne: LignePosition | null | undefined): boolean {
  if (!ligne) return false;

  // Le statut absent est TOLERE, comme le fait la route : `String(null ?? '')`
  // rend une chaine vide, qui n'est pas un statut termine. Durcir ici ce que
  // la route tolere ferait diverger les deux — precisement ce que ce fichier
  // existe pour empecher.
  if (STATUTS_TERMINES.has(String(ligne.statut ?? ''))) return false;

  // Sans date lisible, on ne sait pas si la fenetre est ouverte. Le doute
  // ferme le bouton plutot que de promettre un enregistrement qui echouera.
  const naissance = Date.parse(String(ligne.created_at ?? ''));
  if (!Number.isFinite(naissance)) return false;

  return Date.now() - naissance <= FENETRE_POSITION_H * 3600 * 1000;
}
