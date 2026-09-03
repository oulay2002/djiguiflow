/**
 * LA MEME REGLE QUE `src/lib/vitrineComplete.ts`, POUR LES SCRIPTS.
 *
 * ── POURQUOI ELLE EXISTE EN DOUBLE ─────────────────────────────────────────
 *
 * `etatVitrine` est ecrit en TypeScript et importe par un alias `@/`. Un script
 * lance par `node` ne peut ni l'un ni l'autre, et le depot n'embarque pas de
 * chargeur TypeScript — en ajouter un pour un script lance a la main coute plus
 * que ce qu'il rapporte.
 *
 * ⚠ CE FICHIER N'EST PAS AUTORISE A DIVERGER. `tests/unit/vitrine-complete.test.ts`
 * fait tourner les DEUX implementations sur la meme serie de cas et exige le
 * meme verdict. Toucher a l'une sans l'autre rend le test rouge — c'est le seul
 * chose qui rende cette duplication acceptable, et c'est deliberement le meme
 * dispositif que `objectifs-panier`.
 *
 * Ce qui n'est PAS recopie ici : la question du client et la phrase « sinon ».
 * Elles servent a parler au marchand dans son tableau de bord ; un entonnoir
 * n'a besoin que des cles. Moins on recopie, moins on peut diverger.
 */

/** Rempli veut dire : une valeur qu'un client pourrait lire. */
const rempli = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
};

/**
 * Recopie de `boutiqueLivre`. Une boutique en retrait seul ne se voit pas
 * reclamer un delai de livraison qu'elle n'aura jamais.
 */
const livre = (mode) => String(mode ?? '').trim() !== 'retrait';

/** Les cles sans reponse, dans l'ordre ou `etatVitrine` les rend. */
export function vitrineComplete(b) {
  const manquantes = [];
  let total = 0;

  const controler = (ok, cle) => {
    total += 1;
    if (!ok) manquantes.push(cle);
  };

  controler(rempli(b.description), 'description');

  if (livre(b.mode_recuperation)) {
    controler(rempli(b.delai_livraison), 'delai_livraison');
    controler(rempli(b.zones_livrees), 'zones_livrees');
  } else {
    controler(rempli(b.delai_preparation_min), 'delai_preparation_min');
  }

  controler(rempli(b.paiements_acceptes), 'paiements_acceptes');
  controler(rempli(b.horaires), 'horaires');

  return { posees: total - manquantes.length, total, manquantes };
}
