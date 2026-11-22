import { beforeEach, describe, expect, it } from 'vitest';

import { effacerDossier, rassemblerDossier } from '@/lib/dossierClient';

/**
 * Un numero seulement SAISI n'ouvre que la commande prouvee.
 *
 * CE QUI ETAIT OUVERT, audit du 22 novembre 2026. La vitrine rend le jeton de
 * suivi a celui qui vient de commander, et le numero qu'il a tape n'est verifie
 * par personne. L'ecran des droits tenait pourtant ce jeton pour la preuve « je
 * suis ce numero ». Commander au numero d'un voisin suffisait donc a :
 *
 *   - lire la liste de ses commandes chez TOUS les marchands ;
 *   - les faire anonymiser toutes, supprimer ses paniers, et l'inscrire sur la
 *     liste des refus de chacune de ses boutiques.
 *
 * Ces tests posent la scene exacte : une victime avec un historique, et la
 * commande que l'attaquant vient de passer a son numero.
 */

type Ligne = Record<string, unknown>;
type Tables = Record<string, Ligne[]>;

let tables: Tables;

function base() {
  return {
    from: (table: string) => {
      const filtres: ((l: Ligne) => boolean)[] = [];
      let action: 'select' | 'update' | 'delete' | 'upsert' = 'select';
      let charge: Ligne = {};

      const executer = () => {
        if (action === 'upsert') {
          tables[table].push(charge);
          return { data: [charge], error: null };
        }
        const visees = tables[table].filter((l) => filtres.every((f) => f(l)));
        if (action === 'update') for (const l of visees) Object.assign(l, charge);
        if (action === 'delete') tables[table] = tables[table].filter((l) => !visees.includes(l));
        return { data: visees, error: null };
      };

      const chaine: Record<string, unknown> = {
        select: () => chaine,
        update: (l: Ligne) => {
          action = 'update';
          charge = l;
          return chaine;
        },
        delete: () => {
          action = 'delete';
          return chaine;
        },
        upsert: (l: Ligne) => {
          action = 'upsert';
          charge = l;
          return chaine;
        },
        eq: (col: string, v: unknown) => {
          filtres.push((l) => l[col] === v);
          return chaine;
        },
        in: (col: string, vs: unknown[]) => {
          filtres.push((l) => vs.includes(l[col]));
          return chaine;
        },
        not: (col: string) => {
          filtres.push((l) => l[col] !== null && l[col] !== undefined);
          return chaine;
        },
        // Seule forme employee : `%<suffixe>`.
        ilike: (col: string, motif: string) => {
          filtres.push((l) => String(l[col] ?? '').endsWith(motif.replace(/^%/, '')));
          return chaine;
        },
        order: () => chaine,
        limit: () => chaine,
        then: (resoudre: (v: unknown) => unknown) => resoudre(executer()),
      };
      return chaine;
    },
  } as unknown as Parameters<typeof rassemblerDossier>[0];
}

const NUMERO = '2250102918886';

const commande = (id: string, reference: string, slug: string, statut: string): Ligne => ({
  id,
  reference,
  created_at: '2026-11-01T10:00:00Z',
  statut,
  client_nom: 'Awa',
  client_telephone: NUMERO,
  client_adresse: 'Cocody, rue des Jardins',
  instructions: null,
  latitude: null,
  chat_id: NUMERO,
  boutiques: { nom: `Boutique ${slug}`, slug },
});

beforeEach(() => {
  tables = {
    commandes: [
      // L'historique de la victime, chez deux marchands.
      commande('c-1', 'ATT-1', 'zahara', 'livree'),
      commande('c-2', 'ATT-2', 'rosemonde', 'livree'),
      // Ce que l'attaquant vient de passer A SON NUMERO, sur une vitrine.
      commande('c-3', 'ZAH-1787573151243-934', 'zahara', 'livree'),
    ],
    paniers: [{ id: 'p-1', telephone: NUMERO }],
    relances_envoyees: [{ id: 'r-1', telephone: NUMERO }],
    relances_stop: [],
    livraisons: [],
    demandes_droits: [{ type: 'effacement', cree_le: '2026-10-01', statut: 'honoree', telephone: NUMERO }],
  };
});

const SEULE = { reference: 'ZAH-1787573151243-934' };

describe('consulter', () => {
  it('portee COMMANDE : une seule commande, et rien de ce qui se cherche par numero', async () => {
    const dossier = await rassemblerDossier(base(), NUMERO, SEULE);

    expect(dossier.commandes.map((c) => c.reference)).toEqual([SEULE.reference]);
    expect(dossier.idsCommandes).toEqual(['c-3']);
    expect(dossier.paniers).toBe(0);
    expect(dossier.relances).toBe(0);
    expect(dossier.refusDemarchage).toEqual([]);
    expect(dossier.demandesAnterieures).toEqual([]);
  });

  it('portee NUMERO : tout le dossier, comme avant', async () => {
    const dossier = await rassemblerDossier(base(), NUMERO);

    expect(dossier.commandes).toHaveLength(3);
    expect(dossier.paniers).toBe(1);
    expect(dossier.relances).toBe(1);
    expect(dossier.demandesAnterieures).toHaveLength(1);
  });
});

describe('effacer', () => {
  it('portee COMMANDE : l’historique de la victime reste INTACT', async () => {
    const bilan = await effacerDossier(base(), NUMERO, SEULE);

    expect(bilan.portee).toBe('commande');
    expect(bilan.commandesAnonymisees).toBe(1);

    const par = (id: string) => tables.commandes.find((c) => c.id === id);
    expect(par('c-1')?.client_nom).toBe('Awa');
    expect(par('c-1')?.client_adresse).toBe('Cocody, rue des Jardins');
    expect(par('c-2')?.client_telephone).toBe(NUMERO);
    // La commande prouvee, elle, est bien anonymisee.
    expect(par('c-3')?.client_telephone).toBe('');

    // Ni paniers, ni relances, ni inscription sur la liste des refus.
    expect(tables.paniers).toHaveLength(1);
    expect(tables.relances_envoyees).toHaveLength(1);
    expect(tables.relances_stop).toHaveLength(0);
  });

  it('portee NUMERO : tout part, et le refus de demarchage est inscrit', async () => {
    const bilan = await effacerDossier(base(), NUMERO);

    expect(bilan.portee).toBe('numero');
    expect(bilan.commandesAnonymisees).toBe(3);
    expect(tables.paniers).toHaveLength(0);
    expect(tables.relances_envoyees).toHaveLength(0);
    expect(tables.relances_stop.map((s) => s.boutique).sort()).toEqual(['rosemonde', 'zahara']);
  });
});
