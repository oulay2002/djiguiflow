import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * LE BLOC QUI NOMME LES LEVIERS SANS LES RÉCLAMER.
 *
 * ── POURQUOI IL EXISTE ─────────────────────────────────────────────────────
 *
 * Le 3 septembre 2026, `/onboarding` ne parlait jamais de `commande_minimum`
 * ni de `livraison_offerte_des`. Un marchand qui terminait le parcours avait
 * une boutique qui marche, sans aucun levier, et **rien ne l'avait invité à y
 * penser** — alors que le seuil de livraison offerte est le levier le plus
 * fiable du commerce pour faire monter un panier.
 *
 * ── LES TROIS DÉCISIONS QUE CES GARDES TIENNENT ────────────────────────────
 *
 * Elles sont faciles à défaire par mégarde, et chacune coûterait quelque chose
 * de précis.
 */

const ONBOARDING = readFileSync('src/app/onboarding/page.tsx', 'utf8');
const MA_BOUTIQUE = readFileSync('src/app/dashboard/ma-boutique/page.tsx', 'utf8');
const API = readFileSync('src/app/api/onboarding/route.ts', 'utf8');

const TITRE = 'Faire monter le panier';

describe('le bloc des leviers', () => {
  it('existe', () => {
    // Sans lui, tout ce qui suit passerait au vert en ne verifiant rien.
    expect(ONBOARDING).toContain(TITRE);
  });

  /**
   * NUMÉROTER, C'EST PROMETTRE QUE LA CHOSE EST REQUISE.
   *
   * Le fichier le dit déjà de ses quatre étapes, et l'a payé une fois : un
   * marchand non technicien voyait un numéro sur un bloc facultatif, le croyait
   * obligatoire, et s'y bloquait au dernier pas. Une boutique sans minimum est
   * parfaitement complète — `vitrineComplete` exclut ces deux colonnes à
   * dessein, parce qu'un indicateur qui réclame tout ne se lit plus.
   */
  it('ne porte AUCUN rang, donc il ne se lit pas comme une obligation', () => {
    const debut = ONBOARDING.lastIndexOf('<Etape', ONBOARDING.indexOf(TITRE));
    const ouverture = ONBOARDING.slice(debut, ONBOARDING.indexOf(TITRE));

    expect(ouverture.length).toBeGreaterThan(10);
    expect(ouverture).not.toContain('rang=');
  });

  /**
   * IL N'ÉCRIT RIEN, ET C'EST CE QUI L'EMPÊCHE DE DEVENIR UN DOUBLON.
   *
   * `/dashboard/ma-boutique` règle déjà ces deux colonnes, avec trois choix
   * explicites et l'avertissement sur qui règle le livreur. Poser ici un second
   * formulaire rejouerait ce que les PR #151 et #154 ont retiré : la même
   * question sur deux écrans, dont un seul compte.
   *
   * Le garde tient les deux bouts : la page ne les envoie pas, et la route ne
   * les accepterait pas.
   */
  it('n envoie aucune des deux colonnes au serveur', () => {
    for (const colonne of ['commande_minimum', 'livraison_offerte_des']) {
      expect(ONBOARDING).toContain(`boutique.${colonne}`);
      expect(ONBOARDING).not.toContain(`enregistrer('${colonne}'`);
    }
  });

  it('et la route d accueil ne les accepte pas non plus', () => {
    const liste = API.slice(API.indexOf('const autorises = ['), API.indexOf('] as const satisfies'));
    expect(liste.length).toBeGreaterThan(20);
    expect(liste).not.toContain('commande_minimum');
    expect(liste).not.toContain('livraison_offerte_des');
  });
});

/**
 * UN LIEN QUI NE MÈNE PAS LÀ OÙ IL DIT VAUT MOINS QUE PAS DE LIEN.
 *
 * Tout l'intérêt de ce bloc est de dire **où** chaque levier se règle — la
 * leçon d'une note de projet payée le 23 août : « copiez ce texte » sans dire
 * où finit dans le mauvais fichier. Une ancre renommée dans `ma-boutique`
 * déposerait le marchand en haut d'une longue page de réglages, après lui avoir
 * promis un endroit précis. Rien n'échouerait, personne ne le verrait.
 */
describe('chaque ancre citee existe vraiment', () => {
  const ancres = [...ONBOARDING.matchAll(/\/dashboard\/ma-boutique#([a-z-]+)/g)]
    .map((m) => m[1]);

  it('le bloc cite bien des ancres', () => {
    expect(ancres.length).toBeGreaterThan(0);
  });

  it.each(ancres)('« #%s » a sa cible dans Ma boutique', (ancre) => {
    expect(MA_BOUTIQUE).toContain(`id="${ancre}"`);
  });

  /**
   * LE SAUT SE FAIT APRÈS LE CHARGEMENT.
   *
   * Cette page ne rend son formulaire qu'une fois la fiche reçue : au premier
   * rendu la cible n'existe pas, le navigateur ne trouve rien, et il ne
   * réessaie jamais. Sans cet effet, les ancres ci-dessus seraient exactes et
   * pourtant sans effet — le pire des deux mondes, puisque le test passerait.
   */
  it('et un saut differe les rend effectives', () => {
    expect(MA_BOUTIQUE).toContain('window.location.hash');
    expect(MA_BOUTIQUE).toContain('scrollIntoView');
  });
});
