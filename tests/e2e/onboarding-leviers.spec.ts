import { test, expect } from '@playwright/test';

/**
 * LE BLOC DES LEVIERS, VU PAR UN MARCHAND CONNECTÉ.
 *
 * ── CE QU'AUCUN TEST UNITAIRE NE PEUT DIRE ─────────────────────────────────
 *
 * `tests/unit/onboarding-leviers.test.ts` relit le fichier : il tient le fait
 * que le bloc n'a pas de rang, qu'il n'écrit rien, et que ses ancres existent.
 * Il ne sait pas si le bloc **s'affiche** — une erreur d'exécution, une fiche
 * dont les colonnes n'arrivent pas, un `Etape` mal refermé, et il n'y aurait
 * rien à l'écran sans qu'un seul test tombe.
 *
 * C'est le motif payé neuf fois le 2 septembre 2026 : aucun de ces défauts ne
 * levait, aucun ne ralentissait, tous les tests restaient verts, et il a fallu
 * ouvrir les pages dans un vrai navigateur pour les voir.
 *
 * ── 390 PX, PARCE QUE C'EST L'ÉCRAN DU MARCHAND ────────────────────────────
 *
 * Il pilote depuis son téléphone. Un bloc qui déborde en largeur y devient
 * illisible sans qu'aucune mesure de bureau ne s'en aperçoive.
 */
test.describe('le bloc des leviers du panier', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/onboarding');
  });

  test('il s affiche, et il ne se donne PAS pour une etape', async ({ page }) => {
    const bloc = page.locator('section', { hasText: 'Faire monter le panier' }).last();
    await expect(bloc).toBeVisible({ timeout: 20_000 });

    // Numeroter, c'est promettre que la chose est requise. Le marchand doit
    // lire « Facultatif », jamais un cinquieme chiffre.
    // `exact` : sans lui, le mot « facultatifs » du texte d'aide repond aussi,
    // et le localisateur en designe deux.
    await expect(bloc.getByText('Facultatif', { exact: true })).toBeVisible();

    // Aucun chiffre de rang : les quatre etapes en portent un, celle-ci non.
    await expect(bloc.locator('.tabular-nums')).toHaveCount(0);
  });

  test('il dit l etat des deux leviers, sans laisser de trou', async ({ page }) => {
    const bloc = page.locator('section', { hasText: 'Faire monter le panier' }).last();
    await expect(bloc).toBeVisible({ timeout: 20_000 });

    // Une valeur absente doit se DIRE. Un vide a l'ecran laisserait croire que
    // la page n'a pas fini de charger.
    const valeurs = bloc.locator('dd');
    const combien = await valeurs.count();
    expect(combien).toBeGreaterThan(0);

    for (let i = 0; i < combien; i += 1) {
      expect((await valeurs.nth(i).innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('ses liens menent a une ancre qui existe vraiment', async ({ page }) => {
    const bloc = page.locator('section', { hasText: 'Faire monter le panier' }).last();
    await expect(bloc).toBeVisible({ timeout: 20_000 });

    const lien = bloc.locator('a[href*="/dashboard/ma-boutique#"]').first();
    const href = await lien.getAttribute('href');
    const ancre = String(href).split('#')[1];

    await lien.click();
    await page.waitForURL(`**/dashboard/ma-boutique#${ancre}`);

    // LA CIBLE EXISTE, ET APRES LE CHARGEMENT. Cette page ne rend son
    // formulaire qu'une fois la fiche recue : c'est tout l'objet du saut
    // differe, et c'est ce qu'on verifie ici plutot que la presence de l'effet.
    await expect(page.locator(`#${ancre}`)).toBeVisible({ timeout: 20_000 });
  });

  test('rien ne deborde en largeur sur un telephone', async ({ page }) => {
    const bloc = page.locator('section', { hasText: 'Faire monter le panier' }).last();
    await expect(bloc).toBeVisible({ timeout: 20_000 });

    const deborde = await bloc.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(deborde).toBe(false);
  });
});
