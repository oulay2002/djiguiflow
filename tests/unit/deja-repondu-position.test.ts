import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La page « Déjà répondu » doit rendre une seconde chance, pas une impasse.
 *
 * LE DÉFAUT, mesuré le 24 août 2026 : **zéro position capturée sur soixante
 * commandes**, en trois semaines d'existence du bouton GPS.
 *
 * La cause n'était pas le refus des clients. `dejaRepondu()` rendait une page
 * NUE : le bouton n'existait que sur la réponse au clic « Je confirme », vue
 * une seule fois, quelques secondes. Un client qui changeait d'onglet, fermait,
 * ou rouvrait son lien ne le revoyait **jamais**. Le lien de suivi
 * disparaissait de la même façon — alors que c'est probablement ce qu'il
 * revenait chercher.
 *
 * CE QUE CES TESTS TIENNENT, dans l'ordre d'importance :
 *
 *  1. **Le bloc revient** quand la position est encore recevable. C'est la
 *     raison d'être du changement.
 *  2. **Il ne revient PAS quand la route le refuserait** — commande terminée,
 *     plus vieille que la fenêtre. Un bouton qui échoue apprend au client à ne
 *     plus appuyer : il coûte davantage que son absence.
 *  3. **Rien n'est proposé sur une commande annulée.** Demander sa porte à
 *     quelqu'un qui vient d'annuler n'a aucun sens.
 */

const JETON = '14c4a9537efc462187eea030ea990e67';

const etats = vi.hoisted(() => ({
  commande: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/limiteur', () => ({
  adresseAppelante: () => '198.51.100.9',
  rafaleDepassee: () => ({ depassee: false, attendreSecondes: 0 }),
  plafondJournalierDepasse: async () => ({ depasse: false, valeur: 10, indisponible: false }),
  secondesAvantMinuitAbidjan: () => 3600,
}));

vi.mock('@/lib/marchands', () => ({ resoudreMarchand: async () => null }));
vi.mock('@/lib/secretN8n', () => ({ secretWebhookN8n: async () => 'secret' }));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'boutiques') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'b', nom: 'B' } }) }) }),
        };
      }
      return {
        select: () => ({
          ilike: () => ({ maybeSingle: async () => ({ data: etats.commande, error: null }) }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  }),
}));

const { GET } = await import('@/app/api/confirmation/route');

const HEURE = 3_600_000;

const commande = (surcharges: Record<string, unknown> = {}) => ({
  reference: 'ATT-1000000006',
  jeton_suivi: JETON,
  created_at: new Date(Date.now() - 2 * HEURE).toISOString(),
  confirmation_statut: 'confirmee',
  statut: 'en_attente',
  latitude: null,
  boutique_id: 'b-1',
  client_nom: 'Awa',
  client_telephone: '2250700000000',
  chat_id: '2250700000000',
  client_adresse: 'Cocody, rue des jardins',
  total: 12500,
  canal: 'whatsapp',
  commande_items: [],
  ...surcharges,
});

async function page() {
  const req = new Request(
    `https://www.djiguiflow.com/api/confirmation?ref=ATT-1000000006&t=${JETON}`,
  );
  const rep = await GET(req);
  return { statut: rep.status, html: await rep.text() };
}

beforeEach(() => {
  etats.commande = commande();
});

describe('la page « Déjà répondu »', () => {
  it('1. rend le bouton de position et le lien de suivi — la seconde chance', async () => {
    const { statut, html } = await page();
    expect(statut).toBe(200);
    expect(html).toContain('Vous avez déjà confirmé cette commande');
    expect(html).toContain('Indiquer ma position exacte');
    expect(html).toContain('/api/confirmation/position');
    expect(html).toContain('/suivi?ref=');
  });

  it('2. dit « corriger » quand une position a déjà été donnée', async () => {
    // La route accepte délibérément une seconde position : un client qui se
    // déplace doit pouvoir se reprendre. Le libellé doit le refléter, sinon
    // il croit s'être trompé de bouton.
    etats.commande = commande({ latitude: 5.3523 });
    const { html } = await page();
    expect(html).toContain('Corriger ma position');
    expect(html).not.toContain('Indiquer ma position exacte');
  });

  it('3. ne propose RIEN sur une commande annulée', async () => {
    etats.commande = commande({ confirmation_statut: 'refusee' });
    const { html } = await page();
    expect(html).toContain('annulée');
    expect(html).not.toContain('/api/confirmation/position');
    expect(html).not.toContain('/suivi?ref=');
  });

  it('4. ne propose pas un bouton que la route refuserait — commande terminée', async () => {
    for (const statut of ['livree', 'annulee', 'abandonnee']) {
      etats.commande = commande({ statut });
      const { html } = await page();
      expect(html).not.toContain('/api/confirmation/position');
    }
  });

  it('5. ne propose pas un bouton que la route refuserait — hors fenêtre de 24 h', async () => {
    etats.commande = commande({ created_at: new Date(Date.now() - 25 * HEURE).toISOString() });
    const { html } = await page();
    expect(html).not.toContain('/api/confirmation/position');
  });

  /**
   * LA POSITION EXPIRE, LE SUIVI NON.
   *
   * Les deux avaient d'abord été liés à la même condition, par facilité. C'est
   * faux : demander sa porte après la livraison n'a aucun sens, mais un client
   * qui rouvre son lien veut précisément savoir où en est sa commande — et
   * c'est encore plus vrai une fois livrée.
   */
  it('6. garde le lien de suivi sur une commande livrée, sans le bouton', async () => {
    etats.commande = commande({ statut: 'livree' });
    const { html } = await page();
    expect(html).toContain('/suivi?ref=');
    expect(html).not.toContain('/api/confirmation/position');
  });

  it('7. garde le lien de suivi hors de la fenêtre de 24 h', async () => {
    etats.commande = commande({ created_at: new Date(Date.now() - 25 * HEURE).toISOString() });
    const { html } = await page();
    expect(html).toContain('/suivi?ref=');
    expect(html).not.toContain('/api/confirmation/position');
  });

  it('8. ne propose toujours PAS le suivi sur une commande annulée', async () => {
    // Une commande annulée n'a rien à suivre — et le lui proposer laisserait
    // croire qu'elle avance encore.
    etats.commande = commande({ confirmation_statut: 'refusee', statut: 'annulee' });
    const { html } = await page();
    expect(html).not.toContain('/suivi?ref=');
  });
});

/**
 * LA COULEUR DIT L'ÉTAT AVANT LE MOT — et elle disait le contraire.
 *
 * Les deux issues opposées sortaient sous un même tampon « DÉJÀ RÉPONDU » en
 * ton `attente`, c'est-à-dire en MANGUE. DESIGN.md réserve la mangue à
 * « commencé, pas fini » : ni une commande confirmée ni une commande annulée
 * n'est une attente.
 *
 * Le chemin de réponse immédiate les peignait pourtant juste, dans le même
 * fichier. Le même code disait donc vrai quand on répond et faux quand on
 * revient — or revenir sur son lien est le geste FRÉQUENT.
 *
 * Les teintes sont écrites en dur dans la page : elle est servie hors de
 * l'application et n'a accès ni à Tailwind ni aux variables. Les tests les
 * citent donc telles quelles, ce qui est aussi ce qui les tient alignées.
 */
/**
 * Le vert du tampon est `accent-700` et non `ENCRE.feuille`, et ce n'est pas
 * un detail : le tampon porte `opacity: .85`, et la feuille compositee sur le
 * papier tombe a 3,75 : 1 — sous le plancher de 4,5 pour du texte de 11 px.
 * `accent-700` donne 5,11 : 1 en gardant l'opacite. Voir `COULEUR_TON`.
 */
const FEUILLE = '#125d49';
const BISSAP = '#c4123f';
const MANGUE = '#7d4b13';

/**
 * ON VISE LE TAMPON, PAS LA PAGE — et c'est une correction de MES tests.
 *
 * Mes deux premières assertions cherchaient la mangue et l'emoji n'importe où
 * dans la page. Elles rougissaient sur du code parfaitement juste : le bloc de
 * position peint son échec en mangue et annonce son succès par un pictogramme.
 * Ces deux-là sont voulus — c'est une ligne d'état sans tampon, sur une page
 * qui ne peut charger aucun jeu d'icônes.
 *
 * Une assertion trop large ne prouve pas davantage : elle interdit ce qu'on
 * n'a jamais voulu interdire, et elle rougit sur du code juste. Le tampon
 * porte sa teinte sur son propre filet, et c'est LUI qu'on regarde.
 */
const filetDuTampon = (teinte: string) => `border:1.5px solid ${teinte}`;

describe('la couleur de l’état, au retour sur le lien', () => {
  it('une commande CONFIRMÉE porte la feuille, jamais la mangue', async () => {
    const { html } = await page();
    expect(html).toContain('CONFIRMÉE');
    expect(html).toContain(filetDuTampon(FEUILLE));
    expect(html).not.toContain(filetDuTampon(MANGUE));
  });

  it('une commande ANNULÉE porte le bissap, jamais la mangue', async () => {
    etats.commande = commande({ confirmation_statut: 'refusee' });
    const { html } = await page();
    expect(html).toContain('ANNULÉE');
    expect(html).toContain(filetDuTampon(BISSAP));
    expect(html).not.toContain(filetDuTampon(MANGUE));
  });

  it('les deux issues ne portent plus le MÊME tampon', async () => {
    // C'est le coeur du defaut : « DÉJÀ RÉPONDU » couvrait indifféremment une
    // commande qui se prépare et une commande annulée.
    const confirmee = (await page()).html;
    etats.commande = commande({ confirmation_statut: 'refusee' });
    const annulee = (await page()).html;
    expect(confirmee).not.toContain('DÉJÀ RÉPONDU');
    expect(annulee).not.toContain('DÉJÀ RÉPONDU');
    expect(confirmee.includes('CONFIRMÉE')).toBe(true);
    expect(annulee.includes('CONFIRMÉE')).toBe(false);
  });

  it('le mot « déjà » reste : c’est l’information propre à ce chemin', async () => {
    // Sans lui, la page de retour serait indiscernable de la réponse qu'on
    // vient de donner, et le client croirait avoir répondu deux fois.
    expect((await page()).html).toContain('déjà');
  });

  it('l’état ne se dit plus par un emoji à côté du tampon', async () => {
    // Le bloc de position garde le sien, à dessein : voir la note plus haut.
    const { html } = await page();
    expect(html).not.toContain('confirmée ✅');
    expect(html).not.toContain('annulée ❌');
  });
});
