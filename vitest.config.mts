import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Les tests unitaires du serveur.
 *
 * Playwright couvre le parcours dans un vrai navigateur ; il ne sait pas
 * dire ce que rend une route quand wasender repond 502 ou quand Telegram
 * annonce un webhook chez un tiers. Ces cas-la ne se reproduisent pas a la
 * main, et ce sont eux qui portent le risque.
 *
 * `tests/e2e` est exclu : il appartient a Playwright, et les deux lanceurs se
 * marcheraient dessus sur le meme dossier.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
