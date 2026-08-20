import { expect, test } from '@playwright/test';

const e2eEmail = process.env.E2E_EMAIL;
const e2ePassword = process.env.E2E_PASSWORD;

test.describe('Authenticated dashboard navigation', () => {
  test.skip(!e2eEmail || !e2ePassword, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated tests.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');

    // Option exact obligatoire : sans elle, « Mot de passe » attrape aussi le
    // bouton « Afficher le mot de passe » pose a l'interieur du champ.
    await page.getByLabel('Email', { exact: true }).fill(e2eEmail!);
    await page.getByLabel('Mot de passe', { exact: true }).fill(e2ePassword!);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  });

  const routeChecks: Array<{ route: string; heading: RegExp }> = [
    { route: '/dashboard', heading: /tableau de bord/i },
    { route: '/dashboard/analytics', heading: /analytics/i },
    { route: '/dashboard/commandes', heading: /gestion des commandes/i },
    { route: '/dashboard/livreurs', heading: /gestion des livreurs/i },
    { route: '/dashboard/livreurs/assignations', heading: /assignation des livraisons/i },
    { route: '/dashboard/reglages', heading: /réglages/i },
    { route: '/dashboard/reglages/notifications', heading: /paramètres de notification/i },
  ];

  for (const { route, heading } of routeChecks) {
    test(`menu/page loads after login: ${route}`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(500);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await expect(page.getByText(/application error|something went wrong|500/i)).toHaveCount(0);
    });
  }
});
