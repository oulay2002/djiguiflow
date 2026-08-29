import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Une boutique absente du cache n'est pas une boutique inexistante.
 *
 * ── CE QUE CE FICHIER PROTÈGE ──────────────────────────────────────────────
 *
 * Le registre des marchands est mis en cache trente secondes, PAR INSTANCE.
 * `getMarchand` lisait ce cache et rendait `null` s'il n'y trouvait pas la
 * clé ; la route publique traduisait ce `null` en **404 « Marchand
 * introuvable »**.
 *
 * Une boutique créée à l'instant est donc absente du cache de toute instance
 * chargée avant elle. `provisioning.ts` invalide bien le sien — il ne peut
 * rien pour les autres. Pendant une demi-minute, la vitrine d'un marchand qui
 * venait de s'inscrire répondait « cette boutique n'existe pas » à qui suivait
 * son lien.
 *
 * Un 404 n'est pas « je ne sais pas », c'est « cela n'existe pas ». Rendre une
 * certitude fausse à partir d'une ignorance est le défaut que ce dépôt passe
 * son temps à fermer.
 *
 * ── ET LE PIÈGE DU REMÈDE ──────────────────────────────────────────────────
 *
 * La première correction vidait le cache avant de relire. Sur une base muette,
 * le repli « on garde le dernier état connu » n'avait alors plus rien à
 * garder : un seul slug mal tapé pendant une panne aurait rendu TOUTES les
 * boutiques introuvables. Le dernier cas ci-dessous existe pour cela.
 */

const etat = vi.hoisted(() => ({
  lectures: 0,
  /** Ce que la base rend à chaque lecture. Muette quand `null`. */
  rendu: null as Record<string, unknown>[] | null,
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: async () => {
        etat.lectures += 1;
        // `error` non nul fait rendre une liste vide par `depuisSupabase` —
        // c'est ainsi qu'on simule une base muette.
        return etat.rendu === null
          ? { data: null, error: { message: 'base muette' } }
          : { data: etat.rendu, error: null };
      },
    }),
  }),
}));

function boutique(slug: string) {
  return {
    id: `uuid-${slug}`,
    slug,
    nom: `Boutique ${slug}`,
    categorie: 'Essai',
    emoji: '🏪',
    logo_url: '',
    sheet_commandes: '',
    groupe_livreurs: '',
    telephone: '',
    telegram_marchand: '',
    actif: true,
  };
}

const { getMarchand, invaliderCacheMarchands } = await import('@/lib/marchands');

beforeEach(() => {
  vi.useFakeTimers();
  etat.lectures = 0;
  etat.rendu = [];
  invaliderCacheMarchands();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('le registre relit la base avant de conclure à l’absence', () => {
  /**
   * LE CAS RÉEL : le cache a été chargé AVANT que la boutique n'existe.
   *
   * On charge, on avance de dix secondes — le cache reste frais, son TTL est
   * de trente — puis la boutique apparaît en base. Sans relecture, elle serait
   * introuvable pendant les vingt secondes restantes.
   */
  it('trouve une boutique créée après le chargement du cache', async () => {
    etat.rendu = [boutique('ancienne')];
    expect(await getMarchand('ancienne')).not.toBeNull();
    expect(etat.lectures).toBe(1);

    vi.advanceTimersByTime(10_000);
    etat.rendu = [boutique('ancienne'), boutique('nouvelle')];

    const trouvee = await getMarchand('nouvelle');
    expect(trouvee?.nom).toBe('Boutique nouvelle');
    expect(etat.lectures, 'la base aurait dû être relue').toBe(2);
  });

  /**
   * ET IL FAUT QUE LA RELECTURE SOIT BORNÉE.
   *
   * Sinon une rafale de slugs inconnus provoquerait une lecture par appel.
   * Le plancher est de cinq secondes : deux absences rapprochées ne coûtent
   * qu'une seule relecture.
   */
  it('ne relit pas la base à chaque slug inconnu', async () => {
    etat.rendu = [boutique('connue')];
    await getMarchand('connue');
    vi.advanceTimersByTime(10_000);

    expect(await getMarchand('inconnue-1')).toBeNull();
    const apresPremiere = etat.lectures;

    expect(await getMarchand('inconnue-2')).toBeNull();
    expect(etat.lectures, 'le plancher n’a pas retenu la seconde').toBe(apresPremiere);
  });

  /**
   * LE CAS QUI A FAILLI COÛTER CHER.
   *
   * Base muette et slug inconnu : la relecture ne doit RIEN détruire. Les
   * boutiques déjà connues doivent continuer de répondre — c'est tout l'objet
   * du repli « on garde le dernier état connu ».
   */
  it('une base muette ne fait pas disparaître les boutiques déjà connues', async () => {
    etat.rendu = [boutique('survivante')];
    expect(await getMarchand('survivante')).not.toBeNull();

    vi.advanceTimersByTime(10_000);
    etat.rendu = null; // la base ne répond plus

    // Ce slug inconnu déclenche la relecture forcée, qui échoue.
    expect(await getMarchand('jamais-vue')).toBeNull();

    // Et la boutique connue répond toujours.
    const encore = await getMarchand('survivante');
    expect(encore?.nom, 'le cache a été détruit par une lecture ratée').toBe(
      'Boutique survivante',
    );
  });
});
