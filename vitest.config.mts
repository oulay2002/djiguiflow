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

    /**
     * QUINZE SECONDES, PARCE QUE CINQ MESURAIENT LA MACHINE ET NON LE CODE.
     *
     * Constate le 4 septembre 2026 : sur un poste Windows, la suite complete
     * rendait un rouge different a presque chaque passage — `aucun-traceur` a
     * 5,04-5,34 s, puis les trois tests de `export-n8n-normalise` qui lancent
     * `bash` et `git` dans un bac a sable, a 5,4-8,8 s. Tous VERTS en CI, tous
     * verts lances seuls, tous rouges sous la charge de la suite entiere. Le
     * defaut a ete cherche dans une modification en cours ; il etait deja sur
     * `main` intact.
     *
     * CE QUE COUTE UN GARDE QUI FLOTTE : on apprend a relancer plutot qu'a
     * lire. Ces tests-la tiennent un engagement publie sur l'absence de
     * traceur et la sauvegarde du schema — exactement ceux qu'il ne faut pas
     * apprendre a ignorer.
     *
     * ON A D'ABORD CHERCHE LA LENTEUR DANS LES TESTS, ET ON S'EST TROMPE.
     * `aucun-traceur` relisait bien chaque fichier une fois par hote, et ce
     * gaspillage a ete retire — mais mesure au banc, son travail ne coutait
     * que 165 ms, ramenes a 33. Les cinq secondes venaient de la charge de la
     * suite entiere, pas du code teste. Aucune optimisation ne les aurait
     * rendues ; seul le budget le pouvait.
     *
     * La duree totale de la suite reste affichee a chaque passage : c'est elle
     * qui signale une derive, pas un couperet pose au niveau du bruit.
     */
    testTimeout: 15_000,
  },
});
