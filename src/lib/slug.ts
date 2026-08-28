/**
 * Le slug d'une boutique — fonction PURE, utilisable des deux cotes.
 *
 * POURQUOI CE FICHIER EXISTE. Elle vivait dans `provisioning.ts`, qui importait
 * `googleSheets.ts`, donc `google-auth-library`, donc des modules Node. L'y
 * prendre depuis un composant `'use client'` faisait echouer le BUILD -- et
 * `tsc --noEmit` ne le voyait pas : il ne fait pas d'assemblage. Le garde de CI
 * l'a attrape, pas le typecheck.
 *
 * `googleSheets.ts` a disparu le 28 aout 2026 et la separation reste : une
 * fonction de chaine n'a rien a faire dans un module qui detient la cle de
 * service Supabase. La lecon vaut sans Google — c'est le typecheck qui ne voit
 * pas la frontiere client/serveur, pas Google qui la creait.
 */

/** Transforme « ROSE MonDE » en « rose-monde ». */
export function genererSlug(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
