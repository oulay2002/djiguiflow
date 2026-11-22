import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * L'uuid d'une boutique ne se laisse pas prendre par le slug d'une autre.
 *
 * CE QUI ETAIT OUVERT, audit du 22 novembre 2026. Le registre posait les slugs
 * AVANT les alias, et l'uuid n'etait qu'un alias. Or un marchand ecrivait
 * librement le `slug` de sa propre ligne : en y mettant l'uuid d'une AUTRE
 * boutique — public, il figure dans chaque URL de photo — il recevait a sa
 * place tout ce qui lui etait adresse par uuid. `POST /api/boutiques/<uuid de
 * B>/commander` inscrivait chez A la commande du client de B, avec son nom,
 * son telephone et son adresse.
 *
 * La base refuse desormais un slug de cette forme. Ce test prouve que le
 * registre tient MEME SI ELLE NE LE FAISAIT PAS : c'est le second rideau, et
 * c'est lui qui protege tant que la migration n'est pas appliquee.
 */

const UUID_B = '22222222-2222-4222-8222-222222222222';

const etat = vi.hoisted(() => ({ lignes: [] as Record<string, unknown>[] }));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: async () => ({ data: etat.lignes, error: null }) }),
  }),
}));

const ligne = (id: string, slug: string, nom: string) => ({
  id, slug, nom, categorie: '', emoji: '', logo_url: '', description: '',
  sheet_commandes: '', groupe_livreurs: '', telephone: '', telegram_marchand: '', actif: true,
});

const { getMarchand, invaliderCacheMarchands } = await import('@/lib/marchands');

beforeEach(() => {
  invaliderCacheMarchands();
});

describe('le registre des marchands', () => {
  it('rend B pour l’uuid de B, meme quand A a pris cet uuid pour slug', async () => {
    etat.lignes = [
      // A d'abord : l'ordre de lecture ne doit rien y changer.
      ligne('11111111-1111-4111-8111-111111111111', UUID_B, 'Boutique A'),
      ligne(UUID_B, 'chez-b', 'Boutique B'),
    ];
    expect((await getMarchand(UUID_B))?.nom).toBe('Boutique B');
  });

  it('et dans l’autre ordre de lecture aussi', async () => {
    etat.lignes = [
      ligne(UUID_B, 'chez-b', 'Boutique B'),
      ligne('11111111-1111-4111-8111-111111111111', UUID_B, 'Boutique A'),
    ];
    expect((await getMarchand(UUID_B))?.nom).toBe('Boutique B');
  });

  it('continue de resoudre une boutique par son slug et par son uuid', async () => {
    etat.lignes = [ligne(UUID_B, 'chez-b', 'Boutique B')];
    expect((await getMarchand('chez-b'))?.nom).toBe('Boutique B');
    expect((await getMarchand(UUID_B))?.nom).toBe('Boutique B');
  });
});
