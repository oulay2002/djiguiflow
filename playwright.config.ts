import { defineConfig } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { FICHIER_SESSION } from './tests/e2e/session';

// Playwright tourne dans son propre processus : il ne lit pas .env.local, que
// seul Next charge. Sans ces deux lignes, E2E_EMAIL et E2E_PASSWORD restent
// vides et les tests authentifies se sautent en silence — c'est ainsi qu'un
// test attendant un titre disparu a pu passer inapercu pendant des semaines.
// Le paquet @next/env est deja installe avec Next : aucune dependance en plus.
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    // localhost et NON 127.0.0.1 : le serveur de developpement sert bien la
    // page sur les deux, mais sur 127.0.0.1 sa liaison HMR echoue et
    // l hydratation ne se termine jamais. Tout ce qui demande du React
    // vivant — un bouton, un formulaire — reste alors inerte, et les tests
    // echouaient sans que l application y soit pour rien.
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Trois projets, parce que la session change ce que les pages montrent.
  // `public` doit tourner DECONNECTE : une vitrine qui lit les tables en
  // direct se vide des qu'on est authentifie, et un test connecte ne verrait
  // jamais ce que voit un client.
  projects: [
    { name: 'setup', testMatch: /auth.setup.ts/ },
    { name: 'public', testMatch: /navigation.spec.ts/ },
    {
      name: 'marchand',
      testMatch: /authenticated-dashboard.spec.ts/,
      dependencies: ['setup'],
      use: { storageState: FICHIER_SESSION },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
