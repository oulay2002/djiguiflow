import { describe, expect, it } from 'vitest';
import { positionRecevable, FENETRE_POSITION_H } from '@/lib/positionRecevable';

/**
 * La position peut-elle encore etre donnee pour cette commande ?
 *
 * POURQUOI CETTE REGLE VIT SEULE. Elle est appliquee a DEUX endroits qui
 * doivent dire la meme chose :
 *
 *   1. `/api/confirmation/position`, qui ACCEPTE ou refuse le point ;
 *   2. la page de confirmation, qui decide d'AFFICHER le bouton ou non.
 *
 * Recopiee, elle finirait par diverger — et la divergence se paie d'un cote
 * precis : la page proposerait un bouton que la route refuse. Le client
 * appuierait, verrait « ⚠️ Position non enregistree », et n'appuierait plus
 * jamais. **Un bouton qui echoue est pire que pas de bouton.**
 *
 * CE QUI A MENE ICI. Mesure du 24 aout 2026 : zero position capturee sur
 * soixante commandes, en trois semaines. La cause n'etait pas le refus des
 * clients — c'est que `dejaRepondu()` rendait une page nue. Le bouton
 * n'existait que sur la reponse au clic « Je confirme », vue une seule fois :
 * un client qui changeait d'onglet ou rouvrait son lien ne le revoyait jamais.
 */

const HEURE = 3600 * 1000;
const ilYA = (heures: number) => new Date(Date.now() - heures * HEURE).toISOString();

describe('positionRecevable', () => {
  it('1. accepte une commande recente et en cours', () => {
    expect(positionRecevable({ statut: 'en_attente', created_at: ilYA(1) })).toBe(true);
  });

  it('2. refuse une commande terminee — livree, annulee, abandonnee', () => {
    for (const statut of ['livree', 'annulee', 'abandonnee']) {
      expect(positionRecevable({ statut, created_at: ilYA(1) })).toBe(false);
    }
  });

  it('3. accepte jusqu au bord de la fenetre, refuse au-dela', () => {
    expect(positionRecevable({ statut: 'en_attente', created_at: ilYA(FENETRE_POSITION_H - 1) })).toBe(true);
    expect(positionRecevable({ statut: 'en_attente', created_at: ilYA(FENETRE_POSITION_H + 1) })).toBe(false);
  });

  it('4. refuse ce qu il ne peut pas dater', () => {
    // Sans date, on ne sait pas si la fenetre est ouverte. Le doute ferme le
    // bouton plutot que de promettre un enregistrement qui echouera.
    expect(positionRecevable({ statut: 'en_attente', created_at: null })).toBe(false);
    expect(positionRecevable({ statut: 'en_attente', created_at: 'pas une date' })).toBe(false);
  });

  it('5. refuse une ligne absente', () => {
    expect(positionRecevable(null)).toBe(false);
  });

  it('6. tolere un statut absent, comme la route le fait deja', () => {
    // La route teste `TERMINEES.has(String(statut ?? ''))` : une chaine vide
    // n'est pas un statut termine. Ne pas durcir ici ce que la route tolere,
    // sinon les deux divergent — ce que ce fichier existe pour empecher.
    expect(positionRecevable({ statut: null, created_at: ilYA(1) })).toBe(true);
    expect(positionRecevable({ created_at: ilYA(1) })).toBe(true);
  });
});
