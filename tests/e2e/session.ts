import path from 'node:path';

/**
 * Ou la session du marchand est ecrite entre les projets Playwright.
 *
 * Volontairement dans son propre module : la configuration a besoin de ce
 * chemin, et importer `auth.setup.ts` depuis la configuration ferait charger
 * un fichier de test — Playwright refuse alors de demarrer.
 *
 * Le fichier contient un jeton d'acces valide ; il est ignore par git.
 */
export const FICHIER_SESSION = path.join(__dirname, '.auth', 'marchand.json');
