import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QUI a livre — pas seulement sous quel nom.
 *
 * CE QUI ETAIT CASSE. `commandes` ne portait qu'un `nom_livreur` TEXTE, et ce
 * texte est le nom d'affichage Telegram, emojis compris. Aucune clef ne reliait
 * une livraison a une fiche de l'annuaire. Mesure le 23 aout 2026 : la page
 * « Livreurs » annoncait « 0 Livraisons — 0F — ★ 0.0 » au seul livreur de la
 * plateforme, dont la boutique comptait QUINZE livraisons.
 *
 * CE QUE CES TESTS PROTEGENT, dans l'ordre d'importance :
 *
 *  1. LE CLOISONNEMENT. Un identifiant Telegram est MONDIAL. Chercher la fiche
 *     sans filtrer sur la boutique attribuerait les courses d'un marchand au
 *     livreur d'un autre — le defaut ferme le 20 aout sur les notifications,
 *     qu'il serait facile de rouvrir ici.
 *  2. L'ABSENCE DE REGRESSION. Tant que le workflow n8n n'envoie pas le champ,
 *     cette route doit se comporter EXACTEMENT comme avant.
 *  3. L'ATTRIBUTION NE DOIT JAMAIS FAIRE ECHOUER UNE LIVRAISON. Elle est un
 *     confort statistique ; le client, lui, a deja ete prevenu.
 */

type Ligne = { id: string; boutique_id: string };

const etats = vi.hoisted(() => ({
  /** Ce que rend la mise a jour principale des commandes. */
  commande: [{ id: 'c-1', boutique_id: 'boutique-A' }] as Ligne[],
  /** L'annuaire, indexe par `${boutique_id}|${telegram_id}`. */
  annuaire: {} as Record<string, { id: string }>,
  /** Une lecture de l'annuaire doit-elle echouer ? */
  annuaireCasse: false,
  /** Une ecriture d'attribution doit-elle echouer ? */
  attributionCassee: false,
  /** Tout ce qui a ete ecrit dans `commandes`, dans l'ordre. */
  ecritures: [] as Record<string, unknown>[],
  /** Les couples (boutique, telegram_id) reellement interroges. */
  recherches: [] as string[],
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'livreurs') {
        const filtres: Record<string, string> = {};
        const chaine = {
          select: () => chaine,
          eq: (colonne: string, valeur: string) => {
            filtres[colonne] = valeur;
            return chaine;
          },
          maybeSingle: async () => {
            if (etats.annuaireCasse) return { data: null, error: { message: 'annuaire illisible' } };
            const cle = `${filtres.boutique_id}|${filtres.telegram_id}`;
            etats.recherches.push(cle);
            return { data: etats.annuaire[cle] ?? null, error: null };
          },
        };
        return chaine;
      }

      // `commandes`
      let charge: Record<string, unknown> = {};
      const chaine = {
        update: (maj: Record<string, unknown>) => {
          charge = maj;
          etats.ecritures.push(maj);
          return chaine;
        },
        ilike: () => chaine,
        // La borne de boutique posee le 2 septembre 2026 sur les trois
        // ecritures de cette route. Elle est ignoree ICI a dessein : ce banc
        // eprouve l'attribution du livreur, et un filtre qu'il honorerait a
        // moitie brouillerait son sujet. Le cloisonnement a son propre banc,
        // `cloisonnement-commandes-internes.test.ts`, qui lui le fait jouer.
        eq: () => chaine,
        is: () => chaine,
        select: async () => {
          if (etats.attributionCassee && 'livreur_id' in charge) {
            return { data: null, error: { message: 'attribution refusee' } };
          }
          return { data: etats.commande, error: null };
        },
        // L'attribution n'appelle pas `.select()` : la chaine doit donc etre
        // « thenable » pour qu'un `await` sur `.ilike()` se resolve.
        then: (resoudre: (v: unknown) => void) => {
          if (etats.attributionCassee && 'livreur_id' in charge) {
            return resoudre({ data: null, error: { message: 'attribution refusee' } });
          }
          return resoudre({ data: etats.commande, error: null });
        },
      };
      return chaine;
    },
  }),
}));

vi.mock('@/lib/marchands', () => ({
  resoudreMarchand: async (ref: string) =>
    ref === 'boutique-a' ? { id: 'boutique-a', boutiqueId: 'boutique-A' } : null,
}));

const { POST } = await import('@/app/api/internal/commandes/livraison/route');

beforeEach(() => {
  process.env.SYNC_SECRET = 'secret-de-test';
  etats.commande = [{ id: 'c-1', boutique_id: 'boutique-A' }];
  etats.annuaire = { 'boutique-A|55501': { id: 'fiche-jean' } };
  etats.annuaireCasse = false;
  etats.attributionCassee = false;
  etats.ecritures = [];
  etats.recherches = [];
});

const appeler = (corps: Record<string, unknown>) =>
  POST(
    new Request('https://exemple.test/api/internal/commandes/livraison', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-secret': 'secret-de-test' },
      // La boutique est exigee depuis le 2 septembre 2026. Elle est posee en
      // PREMIER pour qu'un cas puisse encore la surcharger, ou l'oter.
      body: JSON.stringify({ boutique: 'boutique-a', ...corps }),
    }),
  );

const attribution = () => etats.ecritures.find((e) => 'livreur_id' in e);

describe('attribution d une livraison a une fiche livreur', () => {
  it('rattache la course quand le livreur est dans l annuaire DE CETTE boutique', async () => {
    const r = await appeler({
      reference: 'ZH-1',
      statut_livraison: 'livre',
      livreur_telegram_id: '55501',
    });

    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toMatchObject({ livreur_attribue: true });
    expect(attribution()).toEqual({ livreur_id: 'fiche-jean' });
  });

  // LE TEST QUI PORTE LA DECISION.
  it('N ATTRIBUE RIEN quand la fiche appartient a une AUTRE boutique', async () => {
    // Le meme identifiant Telegram, mais rattache ailleurs.
    etats.annuaire = { 'boutique-B|55501': { id: 'fiche-du-voisin' } };

    const r = await appeler({
      reference: 'ZH-1',
      statut_livraison: 'livre',
      livreur_telegram_id: '55501',
    });

    await expect(r.json()).resolves.toMatchObject({ livreur_attribue: false });
    expect(attribution()).toBeUndefined();
    // La recherche a bien ete cloisonnee sur la boutique de la commande.
    expect(etats.recherches).toEqual(['boutique-A|55501']);
  });

  it('laisse `livreur_id` vide quand le livreur n est dans aucun annuaire', async () => {
    etats.annuaire = {};

    const r = await appeler({
      reference: 'ZH-1',
      statut_livraison: 'livre',
      livreur_telegram_id: '99999',
    });

    // La livraison reste enregistree : un livreur non rattache est un cas
    // NORMAL, pas une panne.
    await expect(r.json()).resolves.toMatchObject({ ok: true, livreur_attribue: false });
    expect(attribution()).toBeUndefined();
  });
});

describe('ce qui ne doit surtout pas changer', () => {
  it('sans `livreur_telegram_id`, la route se comporte comme avant', async () => {
    const r = await appeler({ reference: 'ZH-1', statut_livraison: 'livre' });

    await expect(r.json()).resolves.toMatchObject({ ok: true, livreur_attribue: false });
    expect(etats.recherches).toHaveLength(0);
    expect(attribution()).toBeUndefined();
  });

  it('une livraison enregistree ne DOIT PAS echouer si l annuaire est illisible', async () => {
    etats.annuaireCasse = true;

    const r = await appeler({
      reference: 'ZH-1',
      statut_livraison: 'livre',
      livreur_telegram_id: '55501',
    });

    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toMatchObject({ ok: true, livreur_attribue: false });
  });

  it('ni si l ecriture de l attribution elle-meme echoue', async () => {
    etats.attributionCassee = true;

    const r = await appeler({
      reference: 'ZH-1',
      statut_livraison: 'livre',
      livreur_telegram_id: '55501',
    });

    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toMatchObject({ ok: true, livreur_attribue: false });
  });

  it('n attribue rien quand la commande n existe pas', async () => {
    etats.commande = [];

    const r = await appeler({
      reference: 'INCONNUE',
      statut_livraison: 'livre',
      livreur_telegram_id: '55501',
    });

    await expect(r.json()).resolves.toMatchObject({ lignes: 0, livreur_attribue: false });
    expect(etats.recherches).toHaveLength(0);
  });
});
