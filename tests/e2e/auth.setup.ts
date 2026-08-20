import { expect, test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FICHIER_SESSION } from './session';

/**
 * La session du marchand, ouverte UNE fois pour toute la suite.
 *
 * Chaque test se connectait auparavant dans son `beforeEach`. En parallele,
 * douze connexions du meme compte partaient en meme temps et Supabase en
 * refusait la moitie : la suite ne passait qu'avec `--workers=1`. On ouvre donc
 * la session ici, on l'ecrit sur disque, et les tests la reprennent telle
 * quelle.
 */
const email = process.env.E2E_EMAIL;
const motDePasse = process.env.E2E_PASSWORD;

setup('ouvre la session du marchand', async ({ page }) => {
  fs.mkdirSync(path.dirname(FICHIER_SESSION), { recursive: true });

  // Sans identifiants, on ecrit une session vide plutot que rien : le projet
  // qui en depend refuserait de demarrer sur un fichier absent, et les tests
  // authentifies doivent se sauter proprement, pas exploser.
  if (!email || !motDePasse) {
    fs.writeFileSync(FICHIER_SESSION, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, 'Posez E2E_EMAIL et E2E_PASSWORD dans .env.local.');
    return;
  }

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  await page.context().storageState({ path: FICHIER_SESSION });
});
