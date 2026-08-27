import { describe, expect, it } from 'vitest';
import {
  CHAMPS_A_EFFACER,
  CONSERVATION_STOP_ILLIMITEE,
  JOURS_PANIER_ABANDONNE,
  JOURS_TRACE_RELANCE,
  MOIS_AVANT_ANONYMISATION,
  NOM_ANONYME,
  peutEtreAnonymisee,
} from '@/lib/conservation';

/**
 * Les durées de conservation — ce qu'on efface, et surtout ce qu'on garde.
 *
 * POURQUOI CES RÈGLES EXISTENT. Rien n'effaçait jamais rien : un numéro de
 * téléphone collecté aujourd'hui y serait encore dans dix ans, sans que
 * personne l'ait décidé — par simple absence de décision. Le régulateur
 * ivoirien tient la conservation illimitée pour un manquement en soi.
 *
 * CE FICHIER PROTÈGE SURTOUT CONTRE L'EXCÈS DE ZÈLE. Une purge qui efface trop
 * est pire que pas de purge : ce qui est parti ne revient que par la
 * sauvegarde, et personne ne s'en aperçoit avant qu'un marchand ne réclame sa
 * comptabilité — ou qu'une personne ayant dit STOP ne soit démarchée à nouveau.
 */

describe('conservation — ce qu on ne doit JAMAIS effacer', () => {
  /**
   * L'EXCEPTION QUI COMPTE PLUS QUE LES RÈGLES.
   *
   * Une personne qui a écrit STOP a exercé un droit. Effacer ce refus au nom de
   * la minimisation le retournerait contre elle : la liste vidée, plus rien ne
   * l'empêcherait d'être démarchée à nouveau, et elle devrait redemander ce
   * qu'elle avait déjà demandé.
   */
  it('un refus exprimé se garde sans limite', () => {
    expect(CONSERVATION_STOP_ILLIMITEE).toBe(true);
  });

  // Une commande encore ouverte n'est pas une vieille donnée : c'est une
  // anomalie. L'anonymiser ferait disparaître le moyen de la comprendre.
  it.each(['en_attente', 'panier', 'en_livraison', 'validee'])(
    'une commande de treize mois encore « %s » n est pas touchée',
    (statut) => {
      expect(peutEtreAnonymisee({
        created_at: '2025-07-01T00:00:00Z', statut, client_nom: 'Awa',
      }, new Date('2026-08-27T00:00:00Z'))).toBe(false);
    },
  );

  it('une commande close mais RÉCENTE n est pas touchée', () => {
    expect(peutEtreAnonymisee({
      created_at: '2026-08-01T00:00:00Z', statut: 'livree', client_nom: 'Awa',
    }, new Date('2026-08-27T00:00:00Z'))).toBe(false);
  });

  it('une date illisible ne déclenche jamais un effacement', () => {
    expect(peutEtreAnonymisee({
      created_at: 'pas une date', statut: 'livree', client_nom: 'Awa',
    })).toBe(false);
  });

  // Sans cette garde, chaque passage nocturne rapporterait le même travail
  // comme s'il venait d'être fait — et le journal mentirait sur son activité.
  it('une commande déjà anonymisée n est pas retraitée', () => {
    expect(peutEtreAnonymisee({
      created_at: '2025-01-01T00:00:00Z', statut: 'livree', client_nom: NOM_ANONYME,
    }, new Date('2026-08-27T00:00:00Z'))).toBe(false);
  });
});

describe('conservation — ce qui doit partir', () => {
  it.each(['livree', 'annulee', 'abandonnee'])(
    'une commande « %s » de treize mois est anonymisée',
    (statut) => {
      expect(peutEtreAnonymisee({
        created_at: '2025-07-01T00:00:00Z', statut, client_nom: 'Awa',
      }, new Date('2026-08-27T00:00:00Z'))).toBe(true);
    },
  );

  it('la bascule se fait bien à douze mois, pas avant', () => {
    const veille = peutEtreAnonymisee({
      created_at: '2025-08-28T00:00:00Z', statut: 'livree', client_nom: 'Awa',
    }, new Date('2026-08-27T00:00:00Z'));
    const apres = peutEtreAnonymisee({
      created_at: '2025-08-26T00:00:00Z', statut: 'livree', client_nom: 'Awa',
    }, new Date('2026-08-27T00:00:00Z'));

    expect(veille).toBe(false);
    expect(apres).toBe(true);
  });
});

describe('conservation — la liste des champs effacés', () => {
  /**
   * `chat_id` EST UNE DONNÉE PERSONNELLE, et ce n'est pas évident : ce n'est pas
   * un nom, mais c'est l'adresse WhatsApp ou Telegram par laquelle on joint la
   * personne. La laisser reviendrait à dire « nous avons effacé son identité »
   * tout en gardant de quoi lui écrire.
   */
  it('le moyen de joindre la personne part avec son identité', () => {
    expect(CHAMPS_A_EFFACER).toContain('chat_id');
  });

  // « Sonnez chez la voisine du 2e » désigne un domicile aussi sûrement qu'une
  // adresse.
  it('les instructions de livraison partent aussi', () => {
    expect(CHAMPS_A_EFFACER).toContain('instructions');
  });

  it('la position GPS part, du client comme du livreur', () => {
    expect(CHAMPS_A_EFFACER).toEqual(
      expect.arrayContaining(['latitude', 'longitude', 'position_livreur']),
    );
  });

  /**
   * LA LISTE ET LA ROUTE DOIVENT RESTER D'ACCORD.
   *
   * La route écrit ces champs EN TOUTES LETTRES — une clé calculée élargirait le
   * type de `update()` à n'importe quelle colonne, et sur une route qui efface,
   * une faute de frappe efface la mauvaise chose. Le prix de cette sécurité est
   * une duplication ; ce test en est le garde-fou.
   */
  it('la liste de référence porte exactement huit champs', () => {
    expect(CHAMPS_A_EFFACER).toHaveLength(8);
    expect([...CHAMPS_A_EFFACER].sort()).toEqual([
      'chat_id', 'client_adresse', 'client_nom', 'client_telephone',
      'instructions', 'latitude', 'longitude', 'position_livreur',
    ]);
  });

  it('ce qui fait la comptabilité du marchand n est PAS effacé', () => {
    for (const garde of ['total', 'created_at', 'reference', 'statut', 'frais_livraison']) {
      expect(CHAMPS_A_EFFACER).not.toContain(garde);
    }
  });
});

describe('conservation — les durées sont celles annoncées', () => {
  it('les durées restent dans des bornes défendables', () => {
    expect(JOURS_PANIER_ABANDONNE).toBe(30);
    expect(MOIS_AVANT_ANONYMISATION).toBe(12);
    expect(JOURS_TRACE_RELANCE).toBe(90);
  });

  // La trace de relance sert le frein « une par personne et par mois ». La
  // garder moins longtemps que cette fenêtre rendrait le frein inopérant : on
  // relancerait quelqu'un parce qu'on aurait oublié l'avoir déjà fait.
  it('les traces de relance survivent à la fenêtre qu elles protègent', () => {
    expect(JOURS_TRACE_RELANCE).toBeGreaterThan(30);
  });
});
