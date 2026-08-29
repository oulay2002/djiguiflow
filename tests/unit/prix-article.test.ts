import { describe, expect, it } from 'vitest';
import { PRIX_MAXIMUM, prixRecevable } from '@/lib/prixArticle';

/**
 * Le prix d'un article, et le zéro qu'on n'a pas choisi.
 *
 * ── CE QUE CE FICHIER PROTÈGE ──────────────────────────────────────────────
 *
 * La route d'enregistrement écrivait `prix: Number(prix) || 0`. Ce `|| 0` avale
 * tout ce qu'il ne sait pas lire et le rend zéro : l'article part en base à
 * **0 franc**, la vitrine l'affiche à 0, un client le commande à 0, et le
 * marchand le livre gratuitement. Il ne l'apprend qu'après.
 *
 * Le champ du tableau de bord s'annonçait pourtant « Prix (FCFA) * ». L'étoile
 * promettait une obligation que rien n'imposait — ni à l'écran, ni au serveur.
 *
 * ── LA DISTINCTION QUI TIENT TOUT ──────────────────────────────────────────
 *
 * On accepte le zéro ÉCRIT — « offert » est une décision commerciale — et on
 * refuse le zéro SUBI. Un test ne peut pas lire dans les intentions ; ce qu'il
 * peut faire, c'est vérifier qu'une absence ne devient jamais un nombre.
 */

describe('le zéro subi est refusé', () => {
  it.each([
    ['champ vide', ''],
    ['espaces seuls', '   '],
    ['absent', undefined],
    ['nul', null],
  ])('%s', (_nom, valeur) => {
    const r = prixRecevable(valeur);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('obligatoire');
  });

  /**
   * LE CAS LE PLUS PROBABLE DE TOUS.
   *
   * L'espace est le séparateur de milliers en français. Un marchand qui écrit
   * son prix comme il l'écrirait sur une ardoise — « 12 000 » — produit un
   * `NaN`, que `|| 0` transformait en article gratuit.
   */
  it.each([
    ['espace des milliers', '12 000'],
    ['avec la devise', '12000 F'],
    ['du texte', 'douze mille'],
    ['une virgule française', '12,5.3'],
  ])('%s est refusé au lieu de valoir zéro', (_nom, valeur) => {
    const r = prixRecevable(valeur);
    expect(r.ok, `« ${valeur} » a été accepté`).toBe(false);
  });

  // `Number(true)` vaut 1 : un booléen créerait un article à un franc.
  it('un booléen n’est pas un prix', () => {
    expect(prixRecevable(true).ok).toBe(false);
    expect(prixRecevable(false).ok).toBe(false);
  });

  it('un prix négatif est refusé', () => {
    const r = prixRecevable(-500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('négatif');
  });

  /**
   * `Number('1e999')` rend `Infinity` sans broncher, et `Infinity` passe tous
   * les contrôles de type. Il finirait en base comme un total incalculable.
   */
  it('l’infini est refusé', () => {
    expect(prixRecevable('1e999').ok).toBe(false);
    expect(prixRecevable(Infinity).ok).toBe(false);
  });

  // Le plafond attrape la faute de frappe : un zéro de trop se voit mal à la
  // relecture, et se paierait à la première commande.
  it('un zéro de trop est arrêté', () => {
    expect(prixRecevable(PRIX_MAXIMUM).ok).toBe(true);
    expect(prixRecevable(PRIX_MAXIMUM + 1).ok).toBe(false);
  });
});

describe('le prix écrit est accepté tel qu’il est voulu', () => {
  it('zéro écrit passe — « offert » est une décision', () => {
    const r = prixRecevable(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prix).toBe(0);
  });

  it.each([
    ['un nombre', 12000, 12000],
    ['une chaîne de chiffres', '12000', 12000],
    ['avec des espaces autour', '  2500  ', 2500],
  ])('%s', (_nom, entree, attendu) => {
    const r = prixRecevable(entree);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prix).toBe(attendu);
  });

  /**
   * Le franc CFA n'a pas de centimes. On arrondit plutôt que de refuser : un
   * prix collé depuis un tableur peut porter une décimale sans que ce soit une
   * erreur du marchand.
   */
  it('une décimale est arrondie, pas refusée', () => {
    const r = prixRecevable('2500.4');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prix).toBe(2500);
  });
});
