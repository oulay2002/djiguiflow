import { expect, test } from '@playwright/test';

const e2eEmail = process.env.E2E_EMAIL;
const e2ePassword = process.env.E2E_PASSWORD;

/**
 * Le bouton « Tester ma boutique », a l'ecran.
 *
 * ON NE CLIQUE PAS. Le diagnostic envoie deux vrais messages — sur le WhatsApp
 * de la boutique et sur le Telegram du gerant — et consomme le plafond du jour
 * de la boutique. Un test automatise qui cliquerait ferait partir ces messages
 * a chaque execution de la suite, et userait le quota d'une vraie enseigne.
 *
 * Ce que ce test couvre est donc ce qui se verifie sans effet de bord : le
 * bouton existe, il porte l'unique couleur forte de la page, et le lien vers
 * le tableau de bord ne la porte pas. La logique des sept controles est
 * couverte par les tests unitaires de `tests/unit/diagnostic.test.ts`, qui
 * simulent les canaux.
 */
test.describe('Onboarding — tester ma boutique', () => {
  test.skip(!e2eEmail || !e2ePassword, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated tests.');

  test('le bouton est present et porte la seule couleur forte de la page', async ({ page }) => {
    const reponse = await page.goto('/onboarding');
    expect(reponse).not.toBeNull();
    expect(reponse!.status()).toBeLessThan(500);

    const bouton = page.getByRole('button', { name: /tester ma boutique/i });
    await expect(bouton).toBeVisible({ timeout: 15_000 });
    await expect(bouton).toBeEnabled();

    // `action` est le bissap, et le systeme n'en veut qu'un par ecran.
    await expect(bouton).toHaveClass(/bg-bissap-500/);

    const versTableauDeBord = page.getByRole('link', { name: /aller au tableau de bord/i });
    await expect(versTableauDeBord).toBeVisible();
    await expect(versTableauDeBord).not.toHaveClass(/bg-bissap-500/);

    // Un seul bouton fort a l'ecran, tant que la boutique n'est pas prouvee
    // branchee.
    expect(await page.locator('.bg-bissap-500').count()).toBe(1);
  });

  test('la page annonce que le test ne derange pas les livreurs', async ({ page }) => {
    await page.goto('/onboarding');
    // La promesse est tenue par le code (getChat, aucun envoi) ; elle doit
    // aussi etre lisible, sinon le marchand n'ose pas cliquer.
    await expect(page.getByText(/vos livreurs ne reçoivent rien/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
