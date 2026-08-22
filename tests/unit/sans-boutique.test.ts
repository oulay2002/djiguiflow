import { describe, expect, it } from 'vitest';
import { afficherEcranSansBoutique } from '@/components/dashboard/SansBoutique';

/**
 * L'ecran du marchand qui n'a pas encore de boutique.
 *
 * Ce que ces tests protegent : jusqu'au 22 aout 2026, un compte fraichement
 * cree tombait sur un tableau de bord ou chaque appel rendait 404 « Marchand
 * introuvable » — erreur avalee dans la console, ecran vide, accueil au nom de
 * repli « DjiguiFlow ». Au premier instant de la relation, le produit avait
 * l'air casse.
 */
describe("l'ecran « pas encore de boutique »", () => {
  it("se montre au marchand qui n'en a aucune", () => {
    expect(afficherEcranSansBoutique(true, 0)).toBe(true);
  });

  it("s'efface des qu'il en a une", () => {
    expect(afficherEcranSansBoutique(true, 1)).toBe(false);
  });

  // LE TEST QUI COMPTE LE PLUS. Une liste vide pendant le chargement n'est pas
  // une absence de boutique : le montrer alors le montrerait a CHAQUE
  // ouverture, a des marchands qui en ont une — ils croiraient l'avoir perdue.
  it("se tait tant que le registre n'a pas repondu", () => {
    expect(afficherEcranSansBoutique(false, 0)).toBe(false);
  });

  it('se tait aussi si la liste arrive avant le drapeau', () => {
    expect(afficherEcranSansBoutique(false, 3)).toBe(false);
  });
});
