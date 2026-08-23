/**
 * Le slug d'une boutique — fonction PURE, utilisable des deux cotes.
 *
 * POURQUOI CE FICHIER EXISTE. Elle vivait dans `provisioning.ts`, qui importe
 * `googleSheets.ts`, donc `google-auth-library`, donc des modules Node. L'y
 * prendre depuis un composant `'use client'` fait echouer le BUILD -- et
 * `tsc --noEmit` ne le voit pas : il ne fait pas d'assemblage. Le garde de CI
 * l'a attrape, pas le typecheck.
 *
 * Une fonction de chaine n'a rien a faire dans un module qui parle a Google.
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
