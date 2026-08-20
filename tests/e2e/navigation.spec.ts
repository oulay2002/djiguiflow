import { expect, test } from '@playwright/test';

test.describe('Navigation and menu smoke tests', () => {
  // Ces tests gardaient un vocabulaire disparu. L'action porte desormais le
  // MEME nom d'un bout a l'autre du parcours — « Ouvrir ma boutique » sur
  // l'accueil, sur la connexion et sur le bouton d'inscription — et c'est
  // cette constance que le test doit proteger.
  test('home page renders and primary CTAs navigate', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.getByRole('link', { name: /ouvrir ma boutique/i }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('button', { name: 'Ouvrir ma boutique', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Se connecter', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
  });

  test('register and login pages expose expected menu links', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('link', { name: /retour à l'accueil|retour à l’accueil/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Se connecter', exact: true })).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('link', { name: /retour à l'accueil|retour à l’accueil/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /ouvrir ma boutique/i })).toBeVisible();
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
