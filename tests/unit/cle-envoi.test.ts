import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cleEnvoiRecevable,
  clePourEnvoi,
  clefDeLaCle,
  empreinteEnvoi,
  oublierCle,
  type StockageCle,
} from '@/lib/cleEnvoi';

/**
 * La cle d'envoi : une commande renvoyee n'est pas une commande de plus.
 *
 * LE DEFAUT QUE CES TESTS TIENNENT FERME. La connexion tombe pendant l'envoi,
 * le client reessaie, et rien cote serveur ne reconnaissait le second envoi :
 * deux lignes, deux alertes, deux courses, un stock decompte deux fois.
 */

const CLE_A = '11111111-2222-4333-8444-555555555555';
const CLE_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function memoire(): StockageCle & { contenu: Map<string, string> } {
  const contenu = new Map<string, string>();
  return {
    contenu,
    getItem: (k) => contenu.get(k) ?? null,
    setItem: (k, v) => { contenu.set(k, v); },
    removeItem: (k) => { contenu.delete(k); },
  };
}

const PANIER = { burger: 2, 'chaussure::41': 1 };
const empreinte = (changement: Partial<Parameters<typeof empreinteEnvoi>[0]> = {}) =>
  empreinteEnvoi({ panier: PANIER, telephone: '07 08 09 10 11', mode: 'livraison', ...changement });

describe('la forme que le serveur accepte', () => {
  it('une cle bien formee passe, en minuscules', () => {
    expect(cleEnvoiRecevable(CLE_A)).toBe(CLE_A);
    expect(cleEnvoiRecevable(CLE_B.toUpperCase())).toBe(CLE_B);
  });

  it.each([
    ['rien', undefined],
    ['un nombre', 42],
    ['trop courte', 'abc'],
    ['des caracteres interdits', "11111111-2222-4333-8444-55555555555'"],
    ['une injection', "x' or '1'='1"],
    ['trop longue', CLE_A + CLE_A],
  ])('%s → ignoree, et la commande passe sans cle', (_nom, valeur) => {
    expect(cleEnvoiRecevable(valeur)).toBe('');
  });
});

describe('la meme commande garde la meme cle', () => {
  it('deux envois identiques rendent la meme cle, et n’en tirent qu’une', () => {
    const s = memoire();
    let tirages = 0;
    const tirer = () => { tirages += 1; return CLE_A; };
    const premiere = clePourEnvoi(s, 'k', empreinte(), tirer);
    const seconde = clePourEnvoi(s, 'k', empreinte(), tirer);
    expect(premiere).toBe(CLE_A);
    expect(seconde).toBe(CLE_A);
    expect(tirages).toBe(1);
  });

  it('elle survit a un rechargement : elle est dans le stockage, pas en memoire', () => {
    const s = memoire();
    clePourEnvoi(s, 'k', empreinte(), () => CLE_A);
    // Un « nouvel onglet » qui relit le meme stockage retrouve la cle.
    expect(clePourEnvoi(s, 'k', empreinte(), () => CLE_B)).toBe(CLE_A);
  });

  it('l’ordre des lignes du panier ne change pas l’empreinte', () => {
    const inverse = { 'chaussure::41': 1, burger: 2 };
    expect(empreinte({ panier: inverse })).toBe(empreinte());
  });

  it('la mise en forme du numero non plus', () => {
    expect(empreinte({ telephone: '0708091011' })).toBe(empreinte());
  });
});

describe('une autre commande prend une autre cle', () => {
  it.each([
    ['une quantite change', { panier: { ...PANIER, burger: 3 } }],
    ['un article s’ajoute', { panier: { ...PANIER, pizza: 1 } }],
    ['le numero change', { telephone: '05 08 09 10 11' }],
    ['le mode change', { mode: 'retrait' }],
  ])('%s', (_nom, changement) => {
    const s = memoire();
    expect(clePourEnvoi(s, 'k', empreinte(), () => CLE_A)).toBe(CLE_A);
    expect(clePourEnvoi(s, 'k', empreinte(changement), () => CLE_B)).toBe(CLE_B);
  });

  it('apres une commande partie, la meme commande refaite est une AUTRE commande', () => {
    const s = memoire();
    clePourEnvoi(s, 'k', empreinte(), () => CLE_A);
    oublierCle(s, 'k');
    expect(clePourEnvoi(s, 'k', empreinte(), () => CLE_B)).toBe(CLE_B);
  });

  it('une cle par boutique', () => {
    expect(clefDeLaCle('chez-awa')).not.toBe(clefDeLaCle('chez-koffi'));
  });
});

describe('sans stockage, la commande passe quand meme', () => {
  it('stockage absent : une cle est tiree a chaque envoi', () => {
    expect(clePourEnvoi(null, 'k', empreinte(), () => CLE_A)).toBe(CLE_A);
    expect(clePourEnvoi(null, 'k', empreinte(), () => CLE_B)).toBe(CLE_B);
  });

  it('stockage qui leve : rien ne remonte', () => {
    const casse: StockageCle = {
      getItem: () => { throw new Error('interdit'); },
      setItem: () => { throw new Error('plein'); },
      removeItem: () => { throw new Error('interdit'); },
    };
    expect(clePourEnvoi(casse, 'k', empreinte(), () => CLE_A)).toBe(CLE_A);
    expect(() => oublierCle(casse, 'k')).not.toThrow();
  });

  it('un contenu illisible ou trafique est ignore', () => {
    const s = memoire();
    s.setItem('k', 'pas du json');
    expect(clePourEnvoi(s, 'k', empreinte(), () => CLE_A)).toBe(CLE_A);
    s.setItem('k', JSON.stringify({ empreinte: empreinte(), cle: "'; drop table commandes; --" }));
    expect(clePourEnvoi(s, 'k', empreinte(), () => CLE_B)).toBe(CLE_B);
  });
});

describe('ce qui tient autour', () => {
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');
  const route = lire('src/app/api/boutiques/[id]/commander/route.ts');
  const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');
  const migration = lire('supabase/migrations/20261123230000_commandes_cle_envoi.sql');

  it('LA RECHERCHE PASSE AVANT LE STOCK, LES HORAIRES ET LES PLAFONDS', () => {
    // La premiere commande a deja decompte le stock et consomme le quota : un
    // second envoi qui les retraverserait serait refuse pour une commande
    // pourtant enregistree, et le client lirait un refus au lieu de son recu.
    const recherche = route.indexOf('const deja = await commandeDejaRecue(sb, boutiqueUuid, cle, telephone.international);');
    expect(recherche).toBeGreaterThan(-1);
    for (const plusBas of ["`commande:${m.id}`", 'plafondJournalierDepasse(', '.from(\'commandes\')\n      .insert(']) {
      const position = route.replace(/\r\n/g, '\n').indexOf(plusBas, recherche);
      expect(position, plusBas).toBeGreaterThan(recherche);
    }
  });

  it('la commande enregistree porte sa cle', () => {
    expect(route).toContain('cle_envoi: cle || null,');
  });

  it('deux envois au meme instant : le perdant recoit la commande du gagnant', () => {
    expect(route).toContain("if (error?.code === '23505' && cle) {");
  });

  it('la cle seule ne rend rien : le numero doit concorder', () => {
    expect(route).toContain("String(data.client_telephone ?? '') !== telephone) return null;");
  });

  it('l’unicite est tenue par la base, par boutique, et seulement pour les lignes a cle', () => {
    const sql = migration.replace(/\s+/g, ' ');
    expect(sql).toContain('create unique index if not exists commandes_cle_envoi_unique on public.commandes (boutique_id, cle_envoi) where cle_envoi is not null');
  });

  it('la vitrine envoie la cle, et l’oublie quand la commande est partie', () => {
    expect(vitrine).toContain('cle: clePourEnvoi(');
    expect(vitrine).toContain('oublierCle(stockageDeLaCle(), clefDeLaCle(slug));');
  });
});

describe('le chemin de repli rend l’adresse de retrait', () => {
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');
  const migration = lire('supabase/migrations/20261123231000_vitrine_boutique_adresse_retrait.sql');
  const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');

  it('la fonction la rend', () => {
    expect(migration).toMatch(/livraison_offerte_des integer,\s+adresse_retrait text\s+\)/);
    expect(migration).toContain('b.adresse_retrait');
  });

  it('UNE FONCTION RECREEE REPART OUVERTE A PUBLIC : les droits sont reposes', () => {
    const apres = migration.slice(migration.indexOf('create function public.vitrine_boutique'));
    expect(apres).toContain('revoke all on function public.vitrine_boutique(text) from public;');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(apres, role).toContain(`grant execute on function public.vitrine_boutique(text) to ${role};`);
    }
  });

  it('la page la lit sur ce chemin aussi', () => {
    expect(vitrine).toContain("adresse: String(b.adresse_retrait ?? '').trim(),");
  });
});
