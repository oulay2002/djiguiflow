import { describe, expect, it } from 'vitest';

/**
 * L'historique client ne répond JAMAIS par le vide.
 *
 * CE QUI A MOTIVÉ CE TEST — un incident, pas une hypothèse.
 *
 * 25 août 2026, 11h02. Un client écrit à une boutique. L'assistante appelle
 * `Consulter_historique_commandes`, qui rend `[]` — n8n le transmet au modèle
 * comme une chaîne VIDE.
 *
 * Le modèle ne peut pas distinguer « ce client n'a jamais commandé » — une
 * réponse parfaitement utile — de « ton appel a échoué ». Il conclut qu'il
 * s'est trompé de paramètre, INVENTE un identifiant au hasard, rappelle
 * l'outil. Vingt-cinq fois, avec vingt-cinq identifiants différents
 * (`E8c6BN3SR`, `7fOXpANQY`, `duVuTipVM`…), jusqu'à `Max iterations`.
 *
 * La chaîne s'arrête là. Le client ne reçoit rien.
 *
 * C'est le motif du défaut silencieux dans sa forme la plus pure : UNE VALEUR
 * VIDE QUI PORTE UN SENS. Le vide ne dit pas ce qu'il veut dire.
 *
 * LES DEUX SILENCES NE SE VALENT PAS, et c'est la seconde moitié du correctif.
 * « Ce client n'a jamais commandé » et « je n'ai pas pu regarder » se
 * ressemblaient tous deux à `[]`. Les confondre ferait affirmer à l'assistante
 * qu'un habitué est un inconnu — au moment précis où elle devait lui proposer
 * de reprendre sa commande.
 */

/** La forme rendue par la route. Voir /api/internal/commandes/client. */
type Reponse = { resume: string; commandes: unknown[]; nombre: number };

const repondre = (resume: string, commandes: unknown[] = []): Reponse =>
  ({ resume, commandes, nombre: commandes.length });

/** Les quatre sorties de la route, dans leur formulation réelle. */
const SANS_CLIENT = repondre(
  'Client non identifie, aucun historique consultable. Poursuivez normalement,'
  + ' et ne dites pas au client qu il n a jamais commande.',
);

const LECTURE_IMPOSSIBLE = repondre(
  'Historique indisponible pour le moment. N affirmez PAS au client qu il n a'
  + ' jamais commande, et ne rappelez pas cet outil : poursuivez la conversation.',
);

const AUCUNE_COMMANDE = repondre(
  'Aucune commande precedente pour ce client. C est un nouveau client :'
  + ' presentez-lui ce que la boutique propose. Ne rappelez pas cet outil.',
);

const AVEC_HISTORIQUE = repondre('2 commande(s) precedente(s) pour ce client.', [{}, {}]);

const TOUTES = [SANS_CLIENT, LECTURE_IMPOSSIBLE, AUCUNE_COMMANDE, AVEC_HISTORIQUE];

describe('historique client — ne jamais repondre par le vide', () => {
  describe('ce qui a cause la boucle', () => {
    it.each(TOUTES.map((r, i) => [i, r] as const))(
      'la reponse %i porte un resume non vide',
      (_i, r) => {
        expect(r.resume.trim().length).toBeGreaterThan(20);
      },
    );

    // Le coeur du defaut : ce que n8n transmet au modele ne doit jamais etre
    // une chaine vide, quelle que soit la branche empruntee.
    it.each(TOUTES.map((r, i) => [i, r] as const))(
      'la reponse %i, serialisee, n est jamais vide pour le modele',
      (_i, r) => {
        const vu = JSON.stringify(r);
        expect(vu).not.toBe('""');
        expect(vu).not.toBe('[]');
        expect(vu.length).toBeGreaterThan(40);
      },
    );
  });

  describe('les deux silences ne se confondent pas', () => {
    it('« aucune commande » dit que c est un NOUVEAU client', () => {
      expect(AUCUNE_COMMANDE.resume).toMatch(/nouveau client/i);
      expect(AUCUNE_COMMANDE.nombre).toBe(0);
    });

    it('« lecture impossible » INTERDIT d affirmer qu il est nouveau', () => {
      expect(LECTURE_IMPOSSIBLE.resume).toMatch(/n affirmez pas/i);
      expect(LECTURE_IMPOSSIBLE.resume).not.toMatch(/nouveau client/i);
    });

    it('les deux resumes sont differents — c est tout l enjeu', () => {
      expect(AUCUNE_COMMANDE.resume).not.toBe(LECTURE_IMPOSSIBLE.resume);
    });
  });

  describe('on dit au modele de ne pas rappeler l outil', () => {
    // Ceinture et bretelles : meme avec une reponse claire, un modele peut
    // reessayer. On le lui interdit en toutes lettres sur les branches vides.
    it.each([
      ['aucune commande', AUCUNE_COMMANDE],
      ['lecture impossible', LECTURE_IMPOSSIBLE],
    ])('« %s » demande de ne pas rappeler', (_nom, r) => {
      expect(r.resume).toMatch(/ne rappelez pas cet outil/i);
    });
  });

  describe('le compte reste juste', () => {
    it('nombre suit la liste, jamais une valeur posee a la main', () => {
      expect(AVEC_HISTORIQUE.nombre).toBe(AVEC_HISTORIQUE.commandes.length);
      expect(AUCUNE_COMMANDE.nombre).toBe(0);
    });
  });
});
