/**
 * Les appuis sur « Ajouter » faits AVANT que la page ne reponde.
 *
 * ── LE DEFAUT ──────────────────────────────────────────────────────────────
 *
 * La vitrine est rendue par le serveur : le menu, les prix et les boutons
 * arrivent dans la premiere reponse. Mais un bouton affiche n'est pas un
 * bouton qui repond — il faut encore que le navigateur ait telecharge et
 * execute le code de la page. Mesure en conditions simulees le 23 novembre
 * 2026 (750 kb/s, processeur ralenti quatre fois) : premier plat visible a
 * 2 secondes, premier appui pris en compte a 11.
 *
 * Entre les deux, le client touche « Ajouter » et rien ne se passe. Il en
 * conclut que la page est cassee. C'est le public de PRODUCT.md : un telephone
 * d'entree de gamme, souvent en 3G.
 *
 * ── LA REPONSE ─────────────────────────────────────────────────────────────
 *
 * Un script minuscule, pose dans le HTML, qui tourne des que le navigateur le
 * lit — bien avant le reste. Il ne fait que deux choses : RETENIR l'appui
 * (quel article, quel choix), et le MONTRER (`aria-busy` grise le bouton, pour
 * que le geste ait une reponse immediate). Quand la page s'eveille, elle
 * rejoue la file et reprend la main.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 *
 * Il ne touche ni au panier, ni au reseau, ni au stockage : il ne sait rien du
 * stock ni des regles. C'est `ajouter`, dans la vitrine, qui decide — un appui
 * retenu sur un article epuise entre-temps est simplement ecarte la-bas.
 *
 * Ecrit en ES5 et sans dependance : il doit tourner sur le navigateur le plus
 * ancien que la page serve, et ne passe par aucun outil de construction.
 */

/** Au-dela, ce n'est plus un client impatient, c'est une touche coincee. */
export const APPUIS_MAX = 20;

/** Ce que le script pose sur `window`, et que la vitrine relit. */
export type FenetreAvantEveil = Window & {
  /** Les appuis retenus : [identifiant de l'article, choix]. */
  __djfAjouts?: [string, string][];
  /** Vrai des que la page repond d'elle-meme : le script cesse de retenir. */
  __djfPret?: boolean;
};

export const SCRIPT_AVANT_EVEIL = [
  '(function(){',
  'var w=window;',
  // Une seule pose : une seconde execution doublerait chaque appui.
  'if(w.__djfPret||w.__djfAjouts)return;',
  'w.__djfAjouts=[];',
  'document.addEventListener("click",function(e){',
  'if(w.__djfPret)return;',
  'var c=e.target;',
  'var b=c&&c.closest?c.closest("[data-ajout]"):null;',
  'if(!b||b.disabled)return;',
  `if(w.__djfAjouts.length>=${APPUIS_MAX})return;`,
  'w.__djfAjouts.push([b.getAttribute("data-ajout")||"",b.getAttribute("data-variante")||""]);',
  'b.setAttribute("aria-busy","true");',
  '},true);',
  '})();',
].join('');

/**
 * Rend la file des appuis retenus, et la vide. A appeler une fois, quand la
 * page est prete a les rejouer.
 *
 * Ne rend que des couples bien formes : la file vit sur `window`, ou
 * n'importe quel script de la page peut ecrire.
 */
export function prendreLesAppuis(fenetre: FenetreAvantEveil): [string, string][] {
  const brute = Array.isArray(fenetre.__djfAjouts) ? fenetre.__djfAjouts : [];
  fenetre.__djfAjouts = [];
  return brute
    .filter((a): a is [string, string] =>
      Array.isArray(a) && typeof a[0] === 'string' && a[0] !== '' && typeof a[1] === 'string')
    .slice(0, APPUIS_MAX)
    .map(([id, variante]) => [id, variante]);
}
