/**
 * Une adresse de photo designe-t-elle un objet PUBLIC de notre stockage ?
 *
 * ── POURQUOI CETTE QUESTION A UNE SEULE REPONSE ────────────────────────────
 *
 * `produits.photo_url` etait un champ libre. Deux consequences, trouvees a
 * deux jours d'ecart :
 *
 *  - le 22 novembre 2026 : la route publique du visuel hebdomadaire allait
 *    chercher cette adresse cote serveur, quelle qu'elle soit — un relais de
 *    requetes vers n'importe quel hote ;
 *  - le 23 novembre 2026 : le formulaire d'article acceptait « …ou colle un
 *    lien image ». La vitrine, elle, n'affiche que notre stockage (politique
 *    de contenu). Le marchand voyait son apercu, croyait sa photo posee, et
 *    ses clients decouvraient un article sans image.
 *
 * La regle etait donc ecrite a UN endroit — la lecture du visuel — et absente
 * de l'ecriture. Elle vit maintenant ici, et les deux s'en servent : une photo
 * que l'ecriture accepte est une photo que la vitrine sait afficher.
 *
 * Module pur : il recoit l'adresse du stockage au lieu de lire
 * l'environnement, ce qui permet de l'eprouver.
 */
export function photoDuStockage(url: unknown, baseSupabase: string | undefined): boolean {
  const adresse = String(url ?? '').trim();
  if (!adresse || !baseSupabase) return false;

  try {
    const cible = new URL(adresse);
    const stockage = new URL(baseSupabase);
    return (
      cible.protocol === 'https:'
      && cible.host === stockage.host
      // Pas d'identifiants dans l'adresse : `https://nous@ailleurs/…` se lit
      // de travers a l'oeil, et n'a aucune raison d'etre ici.
      && cible.username === ''
      && cible.password === ''
      && cible.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

/** Le message rendu au marchand quand la photo n'est pas des notres. */
export const PHOTO_REFUSEE =
  'Cette photo ne peut pas être affichée sur votre vitrine. Choisissez-la depuis votre appareil.';
