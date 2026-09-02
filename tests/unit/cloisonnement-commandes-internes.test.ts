import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Une reference d'un marchand ne doit RIEN pouvoir chez un autre.
 *
 * ── LE DEFAUT ─────────────────────────────────────────────────────────────
 *
 * `/api/internal/commandes/{fiche,note,prevenu}` cherchaient par `reference`,
 * qui est une cle GLOBALE : elle ne dit pas a qui la commande appartient. Le
 * secret partage protegeait bien l'entree — il dit que l'appelant est n8n —
 * mais il ne dit pas POUR QUEL MARCHAND n8n appelle. Or une seule instance
 * n8n sert tous les marchands.
 *
 * Le cloisonnement ne tenait donc qu'a ce qu'aucun workflow ne se trompe
 * jamais de reference. Note du 22 aout 2026 : « une correction qui depend de
 * n8n ne se trompant jamais de cle ». Elle est ici.
 *
 * ── POURQUOI CE BANC PLUTOT QU'UN GREP ────────────────────────────────────
 *
 * Un controle textuel — « le fichier contient-il `boutique_id` ? » — reste
 * VERT si l'on retire un filtre sur les deux que porte `note` : la chaine
 * existe encore ailleurs dans le fichier. Ce banc fait tourner les routes
 * contre une base a deux marchands et regarde ce qui SORT et ce qui S'ECRIT.
 * Retirer n'importe lequel des quatre filtres le fait rougir.
 *
 * ── CHAQUE CAS A SON TEMOIN ───────────────────────────────────────────────
 *
 * A cote de chaque refus, l'appel legitime correspondant. Sans lui, une route
 * cassee qui refuserait TOUT passerait ce banc au vert en ne prouvant rien.
 */

const SECRET = 'secret-de-banc';

const ZAHARA = 'ZAH-1787573151243-934';
const ROSE = 'ROS-1787573151999-112';

const etat = vi.hoisted(() => ({ lignes: [] as Record<string, unknown>[] }));

/**
 * Une base a deux marchands, qui honore les filtres qu'on lui pose.
 *
 * `.or()` EST TRAITE COMME TOUJOURS VRAI, et le sens de cette approximation
 * compte. Il ne porte que la fenetre de correction d'une note — pas le
 * cloisonnement. L'ignorer rend l'ecriture PLUS probable, jamais moins : si
 * la note d'autrui reste malgre tout intacte, c'est bien le filtre de
 * boutique qui l'a protegee, et rien d'autre.
 */
vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from(nom: string) {
      const filtres: Array<(l: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | null = null;

      const source = () => (nom === 'commandes' ? etat.lignes : []);
      const resoudre = () => {
        const retenues = source().filter((l) => filtres.every((f) => f(l)));
        if (patch) for (const l of retenues) Object.assign(l, patch);
        return retenues;
      };

      const chaine: Record<string, unknown> = {
        select: () => chaine,
        update: (p: Record<string, unknown>) => { patch = p; return chaine; },
        eq: (col: string, val: unknown) => {
          filtres.push((l) => String(l[col] ?? '') === String(val));
          return chaine;
        },
        is: (col: string, val: unknown) => {
          filtres.push((l) => (l[col] ?? null) === val);
          return chaine;
        },
        // `ilike` sert de recherche exacte ici : les references du banc ne
        // portent aucun joker, et `motifExact` echappe ceux qui en
        // porteraient. C'est le cloisonnement qu'on eprouve, pas le motif.
        ilike: (col: string, val: unknown) => {
          filtres.push((l) => String(l[col] ?? '') === String(val));
          return chaine;
        },
        or: () => chaine,
        limit: () => chaine,
        order: () => chaine,
        gt: () => chaine,
        maybeSingle: async () => ({ data: resoudre()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve({ data: resoudre(), error: null }).then(ok, ko),
      };
      return chaine;
    },
  }),
}));

vi.mock('@/lib/marchands', () => ({
  resoudreMarchand: async (ref: string) => {
    const annuaire: Record<string, { id: string; boutiqueId: string }> = {
      zahara: { id: 'zahara', boutiqueId: 'b-zahara' },
      'rose-monde': { id: 'rose-monde', boutiqueId: 'b-rose' },
    };
    return annuaire[ref] ?? null;
  },
}));

/**
 * Les trois routes, importees statiquement. Un `import()` construit par
 * concatenation prive Vite de la liste des cibles possibles : il le signale,
 * et une route renommee ne casserait qu'a l'execution.
 */
const ROUTES = {
  fiche: () => import('@/app/api/internal/commandes/fiche/route'),
  note: () => import('@/app/api/internal/commandes/note/route'),
  prevenu: () => import('@/app/api/internal/commandes/prevenu/route'),
  livraison: () => import('@/app/api/internal/commandes/livraison/route'),
};

async function appeler(route: keyof typeof ROUTES, corps: Record<string, unknown>) {
  const { POST } = await ROUTES[route]();
  const rep = await POST(
    new Request(`https://www.djiguiflow.com/api/internal/commandes/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-secret': SECRET },
      body: JSON.stringify(corps),
    }),
  );
  return { statut: rep.status, corps: await rep.json() };
}

const ligneDeRose = () => etat.lignes.find((l) => l.reference === ROSE)!;

beforeEach(() => {
  vi.resetModules();
  process.env.SYNC_SECRET = SECRET;
  etat.lignes = [
    {
      id: 'c-zahara', reference: ZAHARA, boutique_id: 'b-zahara',
      jeton_suivi: '265df28afab84cfe8e688919419d11f6',
      client_nom: 'Kouassi', client_telephone: '0102918886', client_adresse: 'Cocody',
      latitude: 5.3523, longitude: -3.9407, instructions: '', total: 3000,
      canal: 'whatsapp', chat_id: '2250102918886', statut: 'en_attente',
      statut_livraison: 'accepte', nom_livreur: 'Jean Paul', frais_livraison: 1500,
      note_client: null, note_heure: null, client_prevenu_le: null,
      heure_prise_en_charge: null, heure_livraison: null,
      created_at: '2026-09-02T12:05:51Z',
    },
    {
      id: 'c-rose', reference: ROSE, boutique_id: 'b-rose',
      jeton_suivi: 'ffffffffffffffffffffffffffffffff',
      client_nom: 'Aminata', client_telephone: '0700112233', client_adresse: 'Yopougon',
      latitude: 5.33, longitude: -4.08, instructions: '', total: 7500,
      canal: 'telegram', chat_id: '99887766', statut: 'en_attente',
      statut_livraison: 'accepte', nom_livreur: 'Ibrahim', frais_livraison: 1000,
      note_client: null, note_heure: null, client_prevenu_le: null,
      heure_prise_en_charge: null, heure_livraison: null,
      created_at: '2026-09-02T12:30:00Z',
    },
  ];
});

afterEach(() => {
  delete process.env.SYNC_SECRET;
});

describe('fiche — la reference d un autre marchand ne rend rien', () => {
  it('temoin : chez elle, la commande sort bien', async () => {
    const { statut, corps } = await appeler('fiche', { order_id: ZAHARA, boutique: 'zahara' });
    expect(statut).toBe(200);
    expect(corps[0].order_id).toBe(ZAHARA);
    // Sans cette ligne, le refus teste plus bas ne prouverait pas grand-chose.
    expect(corps[0].jeton_suivi).toBeTruthy();
  });

  it('la commande de Rose Monde reclamee au nom de Zahara rend un tableau vide', async () => {
    const { statut, corps } = await appeler('fiche', { order_id: ROSE, boutique: 'zahara' });
    expect(statut).toBe(200);
    expect(corps).toEqual([]);
  });

  it('et surtout : ni jeton, ni telephone, ni adresse, ni point GPS ne fuient', async () => {
    const { corps } = await appeler('fiche', { order_id: ROSE, boutique: 'zahara' });
    const rendu = JSON.stringify(corps);
    // Le jeton est le pire des quatre : il permet de confirmer ou d'annuler
    // la commande d'un inconnu.
    expect(rendu).not.toContain('ffffffffffffffffffffffffffffffff');
    expect(rendu).not.toContain('0700112233');
    expect(rendu).not.toContain('Yopougon');
    expect(rendu).not.toContain('Aminata');
  });

  it('sans boutique, elle refuse plutot que de chercher partout', async () => {
    const { statut } = await appeler('fiche', { order_id: ZAHARA });
    expect(statut).toBe(400);
  });

  it('une boutique inconnue ne vaut pas un passe-partout', async () => {
    const { statut } = await appeler('fiche', { order_id: ZAHARA, boutique: 'boutique-fantome' });
    expect(statut).toBe(404);
  });
});

describe('note — on n ecrit pas un avis sur le commerce d un autre', () => {
  it('temoin : chez elle, la note s enregistre', async () => {
    const { statut, corps } = await appeler('note', { reference: ROSE, note: 5, boutique: 'rose-monde' });
    expect(statut).toBe(200);
    expect(corps.etat).toBe('enregistree');
    expect(ligneDeRose().note_client).toBe(5);
  });

  it('la note posee au nom de Zahara ne touche pas la commande de Rose Monde', async () => {
    const { statut, corps } = await appeler('note', { reference: ROSE, note: 1, boutique: 'zahara' });
    expect(statut).toBe(200);
    expect(corps.etat).toBe('commande_inconnue');
    expect(ligneDeRose().note_client).toBeNull();
  });

  it('la relecture ne divulgue pas davantage que l ecriture', async () => {
    // La commande d'autrui est DEJA notee : sans le filtre sur la relecture,
    // la route repondrait « fenetre_close, deja notee 4/5 » — elle
    // confirmerait son existence et livrerait son avis.
    ligneDeRose().note_client = 4;
    ligneDeRose().note_heure = '2026-08-01T10:00:00Z';

    const { corps } = await appeler('note', { reference: ROSE, note: 1, boutique: 'zahara' });
    expect(corps.etat).toBe('commande_inconnue');
    expect(corps.note_existante).toBeUndefined();
    expect(ligneDeRose().note_client).toBe(4);
  });

  it('sans boutique, elle refuse', async () => {
    const { statut } = await appeler('note', { reference: ROSE, note: 5 });
    expect(statut).toBe(400);
    expect(ligneDeRose().note_client).toBeNull();
  });
});

describe('livraison — on ne declare pas livree la commande d un autre', () => {
  it('temoin : chez elle, le statut passe et l heure se pose', async () => {
    const { statut, corps } = await appeler('livraison', {
      reference: ROSE, statut_livraison: 'livre', boutique: 'rose-monde',
    });
    expect(statut).toBe(200);
    expect(corps.lignes).toBe(1);
    expect(ligneDeRose().statut_livraison).toBe('livre');
    // Derive par la route, pas envoye par l'appelant.
    expect(ligneDeRose().statut).toBe('livree');
    expect(ligneDeRose().heure_livraison).toBeTruthy();
  });

  it('au nom de Zahara, la commande de Rose Monde ne bouge pas', async () => {
    // C'etait la plus lourde des quatre : une commande basculee en « livree »
    // sort de l'alerte retard de son gerant, entre dans ses livraisons du
    // jour, et son client est prevenu d'une livraison qui n'a pas eu lieu.
    const { statut, corps } = await appeler('livraison', {
      reference: ROSE, statut_livraison: 'livre', boutique: 'zahara',
    });
    expect(statut).toBe(200);
    expect(corps.lignes).toBe(0);
    expect(ligneDeRose().statut_livraison).toBe('accepte');
    expect(ligneDeRose().statut).toBe('en_attente');
  });

  it('et l horodatage non plus — il s ecrit par une requete SEPAREE', async () => {
    // Celle-ci ne depend pas du resultat de l'ecriture principale : elle
    // s'execute des que le statut annonce une prise en charge. Borner la
    // premiere sans borner celle-ci laisserait la commande d'autrui
    // horodatee par un marchand qui n'y a jamais touche.
    await appeler('livraison', {
      reference: ROSE, statut_livraison: 'livre', boutique: 'zahara',
    });
    expect(ligneDeRose().heure_prise_en_charge).toBeNull();
    expect(ligneDeRose().heure_livraison).toBeNull();
  });

  it('sans boutique, elle refuse', async () => {
    const { statut } = await appeler('livraison', { reference: ROSE, statut_livraison: 'livre' });
    expect(statut).toBe(400);
    expect(ligneDeRose().statut_livraison).toBe('accepte');
  });
});

describe('prevenu — on ne declare pas rassure le client d un autre', () => {
  it('temoin : chez elle, le marquage passe', async () => {
    const { statut, corps } = await appeler('prevenu', { reference: ROSE, boutique: 'rose-monde' });
    expect(statut).toBe(200);
    expect(corps.marquee).toBe(true);
    expect(ligneDeRose().client_prevenu_le).toBeTruthy();
  });

  it('marquer au nom de Zahara laisse la commande de Rose Monde intacte', async () => {
    // Le degat n'est pas une fuite mais un mensonge durable : le marchand
    // croit son client prevenu, et la veille cesse de signaler
    // `client_non_prevenu` pour cette commande.
    const { statut, corps } = await appeler('prevenu', { reference: ROSE, boutique: 'zahara' });
    expect(statut).toBe(200);
    expect(corps.marquee).toBe(false);
    expect(ligneDeRose().client_prevenu_le).toBeNull();
  });

  it('sans boutique, elle refuse', async () => {
    const { statut } = await appeler('prevenu', { reference: ROSE });
    expect(statut).toBe(400);
    expect(ligneDeRose().client_prevenu_le).toBeNull();
  });
});
