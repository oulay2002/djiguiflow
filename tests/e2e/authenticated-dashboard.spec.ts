import { expect, test } from '@playwright/test';

const e2eEmail = process.env.E2E_EMAIL;
const e2ePassword = process.env.E2E_PASSWORD;

test.describe('Authenticated dashboard navigation', () => {
  test.skip(!e2eEmail || !e2ePassword, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated tests.');

  // La connexion se fait une seule fois, dans `auth.setup.ts` : la session
  // arrive deja ouverte par `storageState`.

  // Les titres attendus dataient d'une version disparue — « Gestion des
  // commandes », « Paramètres de notification », « Tableau de bord » —, et
  // comme la suite se sautait faute d'identifiants, personne ne l'a jamais vu.
  // Un test qui ne tourne pas pourrit en silence : celui-ci couvre desormais
  // les onze entrees du menu, et non sept.
  const routeChecks: Array<{ route: string; heading: RegExp }> = [
    { route: '/dashboard', heading: /^bonjour/i },
    { route: '/dashboard/commandes', heading: /^commandes/i },
    { route: '/dashboard/products', heading: /^produits/i },
    { route: '/dashboard/customers', heading: /^clients$/i },
    { route: '/dashboard/ma-boutique', heading: /^ma boutique$/i },
    { route: '/dashboard/stats', heading: /^pilotage/i },
    { route: '/dashboard/analytics', heading: /^pilotage détaillé$/i },
    { route: '/dashboard/livreurs', heading: /^livreurs$/i },
    { route: '/dashboard/livreurs/assignations', heading: /^assigner les livraisons$/i },
    { route: '/dashboard/paiements', heading: /^abonnements et facturation$/i },
    { route: '/dashboard/reglages', heading: /^réglages$/i },
    { route: '/dashboard/reglages/notifications', heading: /^notifications$/i },
  ];

  for (const { route, heading } of routeChecks) {
    test(`menu/page loads after login: ${route}`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(500);
      // 15 s et non 5 : l accueil et l ecran Clients affichent un chargement
      // le temps d interroger Supabase, et depassent le delai par defaut. Le
      // test attend donc la page, pas la vitesse — mais ce delai est reel, et
      // c est le marchand qui le subit sur son telephone.
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 });
      // Le motif cherchait aussi « 500 » en clair : il se declenchait sur
      // « 2 500 FCFA », c'est-a-dire sur n'importe quel prix. Le code HTTP est
      // deja controle juste au-dessus ; ici on ne guette que les ecrans de
      // panne, en toutes lettres.
      await expect(
        page.getByText(/application error|something went wrong|internal server error/i),
      ).toHaveCount(0);
    });
  }
});
