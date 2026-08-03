import { expect, test } from '@playwright/test';

test.describe('Navigation and menu smoke tests', () => {
  test('home page renders and primary CTAs navigate', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /djiguiflow/i })).toBeVisible();

    await page.getByRole('link', { name: /commencer l’essai|commencer l'essai/i }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('button', { name: /créer mon compte/i })).toBeVisible();

    await page.getByRole('link', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
  });

  test('register and login pages expose expected menu links', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('link', { name: /retour à l'accueil|retour à l’accueil/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('link', { name: /retour à l'accueil|retour à l’accueil/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /s'inscrire/i })).toBeVisible();
  });

  for (const protectedRoute of [
    '/dashboard',
    '/dashboard/analytics',
    '/dashboard/commandes',
    '/dashboard/livreurs',
    '/dashboard/livreurs/assignations',
    '/dashboard/reglages',
    '/dashboard/reglages/notifications',
  ]) {
    test(`protected route responds without 5xx: ${protectedRoute}`, async ({ page }) => {
      const response = await page.goto(protectedRoute);

      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(500);
    });
  }
});
