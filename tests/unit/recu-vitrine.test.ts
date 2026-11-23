import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clefRecu, ecrireRecu, etapesDuRecu, lireRecu, type Recu } from '@/lib/vitrine/recu';

/**
 * Le recu d'une commande partie.
 *
 * CE QU'IL DOIT TENIR. La commande n'est pas lancee tant que le client n'a pas
 * repondu sur WhatsApp : c'est la premiere chose que le recu dit, quel que
 * soit le mode. Et il ne dit rien qu'il ne sache : ni heure, ni adresse
 * inventees, ni recu a moitie lisible sous un tampon « REÇUE ».
 */

const RECU: Recu = {
  reference: 'ZH-1795442617116-AB12',
  jeton: 'jeton-de-suivi',
  lignes: [
    { quantite: 2, nom: 'Burger Classique', variante: '', montant: 5000 },
    { quantite: 1, nom: 'Chaussure', variante: '41', montant: 15000 },
  ],
  total: 20000,
  mode: 'retrait',
  heure: '12:30',
  adresseRetrait: 'Riviera 2, face à la station',
  paiements: ['Espèces à la livraison', 'Wave'],
  frais: 'Vous récupérez votre commande sur place : aucun frais de livraison.',
};

describe('ce qu’il reste a faire', () => {
  it('la confirmation sur WhatsApp vient TOUJOURS en premier', () => {
    for (const mode of ['livraison', 'retrait'] as const) {
      const [premiere] = etapesDuRecu({ mode, heure: '', adresseRetrait: '' });
      expect(premiere, mode).toContain('WhatsApp');
      expect(premiere, mode).toContain('ne commence qu’après votre réponse');
    }
  });

  it('en retrait, il dit ou et quand venir', () => {
    const etapes = etapesDuRecu(RECU);
    expect(etapes).toHaveLength(3);
    expect(etapes[2]).toBe('Vous venez la chercher vers 12:30 : Riviera 2, face à la station.');
  });

  it('sans heure ni adresse, il n’en invente pas', () => {
    const etapes = etapesDuRecu({ mode: 'retrait', heure: '', adresseRetrait: '' });
    expect(etapes[2]).toBe('Vous venez la chercher sur place.');
    expect(etapes.join(' ')).not.toMatch(/vers|undefined|null|:\s*\./);
  });

  it('en livraison, il ne parle ni de retrait ni d’adresse du commerce', () => {
    const etapes = etapesDuRecu({ mode: 'livraison', heure: '12:30', adresseRetrait: 'Riviera 2' });
    expect(etapes).toHaveLength(2);
    expect(etapes.join(' ')).not.toMatch(/chercher|Riviera|12:30/);
  });
});

describe('il survit a l’aller-retour vers WhatsApp', () => {
  it('ce qui est ecrit se relit a l’identique', () => {
    expect(lireRecu(ecrireRecu(RECU))).toEqual(RECU);
  });

  it('une clef par boutique', () => {
    expect(clefRecu('chez-awa')).not.toBe(clefRecu('chez-koffi'));
  });
});

describe('un recu faux est pire qu’un recu absent', () => {
  const avec = (changement: Record<string, unknown>) =>
    JSON.stringify({ v: 1, ...RECU, ...changement });

  it.each([
    ['rien', null],
    ['du texte', 'pas du json'],
    ['une autre version', JSON.stringify({ ...RECU, v: 2 })],
    ['sans reference', avec({ reference: '  ' })],
    ['sans ligne', avec({ lignes: [] })],
    ['un total illisible', avec({ total: 'gratuit' })],
    ['un total negatif', avec({ total: -1 })],
    ['un mode inconnu', avec({ mode: 'les_deux' })],
    ['une ligne sans nom', avec({ lignes: [{ quantite: 1, nom: '', variante: '', montant: 100 }] })],
    ['une quantite nulle', avec({ lignes: [{ quantite: 0, nom: 'X', variante: '', montant: 100 }] })],
    ['un montant de ligne illisible', avec({ lignes: [{ quantite: 1, nom: 'X', variante: '', montant: null }] })],
  ])('%s → aucun recu', (_nom, brut) => {
    expect(lireRecu(brut)).toBeNull();
  });

  it('une heure mal formee est oubliee, le reste tient', () => {
    expect(lireRecu(avec({ heure: 'midi' }))?.heure).toBe('');
  });

  it('les textes sont bornes', () => {
    const r = lireRecu(avec({ adresseRetrait: 'x'.repeat(5000), frais: 'y'.repeat(5000) }));
    expect(r?.adresseRetrait).toHaveLength(200);
    expect(r?.frais).toHaveLength(240);
  });
});

describe('ce qui tient autour, dans la vitrine', () => {
  const vitrine = readFileSync('src/app/boutiques/[id]/Vitrine.tsx', 'utf8');
  const composant = readFileSync('src/app/boutiques/[id]/Recu.tsx', 'utf8');
  const regle = readFileSync('src/lib/vitrine/recu.ts', 'utf8');

  it('le recu ne garde ni le nom, ni le numero, ni l’adresse du client', () => {
    // Rien de personnel ne reste dans le navigateur une fois la commande
    // partie. L'adresse qu'il porte est celle du COMMERCE.
    const type = regle.slice(regle.indexOf('export type Recu = {'), regle.indexOf('const VERSION'));
    expect(type).not.toMatch(/\b(nom|tel|telephone|adresse|instructions)\s*:/);
    expect(type).toContain('adresseRetrait: string;');
  });

  it('il se compose AVANT que le panier se vide', () => {
    expect(vitrine.indexOf('setRecu(nouveau);')).toBeGreaterThan(-1);
    expect(vitrine.indexOf('setRecu(nouveau);')).toBeLessThan(
      vitrine.indexOf("setPanier({}); setNom('');"),
    );
  });

  it('le titre dit l’etape a faire, et recoit le focus', () => {
    expect(composant).toContain('Il vous reste à confirmer sur WhatsApp');
    expect(composant).toContain('titre.current?.focus({ preventScroll: true })');
  });

  it('il ne promet rien sur le moment du paiement', () => {
    // La page connait les moyens acceptes, pas le moment du reglement.
    expect(composant).toContain('Paiement accepté');
    expect(composant).not.toMatch(/rien à payer|payez maintenant|déjà payé/i);
  });
});
