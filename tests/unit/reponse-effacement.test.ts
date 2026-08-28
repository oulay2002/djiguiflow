import { describe, expect, it } from 'vitest';
import { lignesDuBilan, lireReponseEffacement } from '@/lib/reponseEffacement';

/**
 * La table de vérité entre les formes rendues par
 * `/api/mes-donnees/effacement` et ce que l'écran doit en faire.
 *
 * LE DÉFAUT QUE CE TEST FIGE. L'écran testait `res.ok && corps.bilan`. La
 * route rend un succès SANS bilan quand le dossier est déjà anonymisé —
 * `{ ok: true, dejaEfface: true }` — parce qu'il n'y a rien à compter. La
 * condition tombait à faux et l'écran affichait « L'effacement n'a pas
 * abouti » à quelqu'un dont les données étaient parties. Or rouvrir le lien
 * gardé dans son message est LE geste qui suit un effacement.
 *
 * Les charges utiles ci-dessous sont copiées des `Response.json` de la route,
 * pas inventées : un test écrit contre une forme imaginaire est exactement ce
 * qui a produit le défaut.
 */

const BILAN = {
  commandesAnonymisees: 2,
  paniersSupprimes: 1,
  relancesSupprimees: 0,
  avisRetires: 0,
  commandesEnCours: 1,
  refusEnregistres: 1,
};

describe('lireReponseEffacement', () => {
  it('« déjà effacé » est un SUCCÈS, pas un échec — le défaut d’origine', () => {
    // route.ts:63 — succes volontairement sans bilan.
    const issue = lireReponseEffacement(true, { ok: true, dejaEfface: true, horsDePortee: [] });
    expect(issue.sorte).toBe('dejaEfface');
  });

  it('un effacement réel rend son bilan et sa complétude', () => {
    // route.ts:119
    const issue = lireReponseEffacement(true, { ok: true, complet: false, bilan: BILAN, horsDePortee: [] });
    expect(issue).toEqual({ sorte: 'efface', complet: false, bilan: BILAN });
  });

  it('`complet` absent vaut « pas complet », jamais « complet »', () => {
    const issue = lireReponseEffacement(true, { ok: true, bilan: BILAN });
    expect(issue).toMatchObject({ sorte: 'efface', complet: false });
  });

  it.each([
    ['confirmation manquante (400)', 400, { error: 'Confirmation manquante : l’effacement n’a pas été demandé explicitement.' }],
    ['preuve refusée (404)', 404, { error: 'Aucune commande sous cette référence.' }],
    ['rafale (429)', 429, { error: 'Trop de demandes. Patientez quelques minutes avant de réessayer.' }],
    ['service indisponible (503)', 503, { error: 'Service temporairement indisponible.' }],
  ])('%s : échec, et le message du serveur est conservé', (_, statut, corps) => {
    const issue = lireReponseEffacement(statut < 400, corps);
    expect(issue.sorte).toBe('echec');
    expect(issue).toHaveProperty('message', corps.error);
  });

  it('un corps illisible ne devient pas un succès', () => {
    expect(lireReponseEffacement(true, null).sorte).toBe('echec');
    expect(lireReponseEffacement(true, 'oui').sorte).toBe('echec');
  });

  it('un 200 annonçant un succès sans matière reste un échec', () => {
    // Ni bilan, ni dejaEfface : on ne pretend pas avoir efface.
    expect(lireReponseEffacement(true, { ok: true }).sorte).toBe('echec');
  });

  it('un bilan tronqué n’est pas un bilan', () => {
    expect(lireReponseEffacement(true, { ok: true, bilan: { commandesAnonymisees: 1 } }).sorte).toBe('echec');
  });

  it('un `error` présent l’emporte sur un statut 200 accidentel', () => {
    const issue = lireReponseEffacement(true, { ok: true, error: 'Quelque chose a cédé.' });
    expect(issue).toEqual({ sorte: 'echec', message: 'Quelque chose a cédé.' });
  });

  it('« déjà effacé » l’emporte sur un bilan, si la route rendait les deux', () => {
    const issue = lireReponseEffacement(true, { ok: true, dejaEfface: true, bilan: BILAN });
    expect(issue.sorte).toBe('dejaEfface');
  });
});

/**
 * Les deux règles que la docstring de `porteeDuGeste` déclare, et que le bloc
 * d'après-effacement enfreignait huit cents lignes plus bas :
 *   1. aucun gabarit à parenthèses — les accords s'écrivent ;
 *   2. aucune ligne à zéro — « 0 commande » laisse croire que rien n'a servi.
 * Une règle écrite dans un commentaire ne s'applique pas toute seule.
 */
const VIDE = {
  commandesAnonymisees: 0,
  paniersSupprimes: 0,
  relancesSupprimees: 0,
  avisRetires: 0,
  commandesEnCours: 0,
  refusEnregistres: 0,
};

describe('lignesDuBilan', () => {
  it('n’écrit jamais un gabarit à parenthèses', () => {
    const lignes = lignesDuBilan({ ...VIDE, commandesAnonymisees: 3, paniersSupprimes: 1, relancesSupprimees: 2, avisRetires: 1, refusEnregistres: 1 });
    expect(lignes.join(' ')).not.toMatch(/\(s\)|\(e\)|\(es\)/);
  });

  it('omet toute catégorie à zéro', () => {
    const lignes = lignesDuBilan({ ...VIDE, paniersSupprimes: 2 });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toBe('2 paniers non validés ont été supprimés.');
    expect(lignes.join(' ')).not.toContain('0 ');
  });

  it('accorde le singulier sans afficher le chiffre 1', () => {
    const l = lignesDuBilan({ ...VIDE, commandesAnonymisees: 1, paniersSupprimes: 1, relancesSupprimees: 1, avisRetires: 1, refusEnregistres: 1 });
    expect(l).toEqual([
      'Votre identité a été retirée d’une commande terminée.',
      'Un panier non validé a été supprimé.',
      'Une trace de relance a été supprimée.',
      'Un commentaire de livraison a été retiré.',
    ]);
  });

  it('accorde le pluriel et affiche le compte', () => {
    const l = lignesDuBilan({ ...VIDE, commandesAnonymisees: 2, relancesSupprimees: 4 });
    expect(l).toEqual([
      'Votre identité a été retirée de 2 commandes terminées.',
      '4 traces de relance ont été supprimées.',
    ]);
  });

  /*
    `refusEnregistres` A ETE UNE LIGNE, PENDANT UNE PASSE. Le panneau ferme
    deja sur « nous gardons uniquement votre numero sur une liste de refus » :
    la ligne et ce paragraphe se lisaient a 250 px l'un de l'autre. Et comme
    `relances_stop` est upserte pour chaque boutique du dossier, le compteur
    vaut au moins 1 a chaque effacement — la repetition aurait ete permanente,
    jamais occasionnelle. Ce test la tient dehors.
  */
  it('n’ajoute pas le refus de démarchage — le paragraphe de clôture le dit déjà', () => {
    expect(lignesDuBilan({ ...VIDE, refusEnregistres: 2 })).toEqual([]);
  });

  it('un bilan entièrement vide ne rend aucune ligne, pas des zéros', () => {
    expect(lignesDuBilan(VIDE)).toEqual([]);
  });

  it('`commandesEnCours` n’est pas une ligne du bilan : rien n’a été fait sur elles', () => {
    expect(lignesDuBilan({ ...VIDE, commandesEnCours: 3 })).toEqual([]);
  });
});
