import { describe, expect, it } from 'vitest';

/**
 * La tâche qui ne tourne plus — le silence le plus coûteux de tous.
 *
 * CE QUI A MOTIVÉ CE TEST — un incident, pas une hypothèse.
 *
 * 27 août 2026, 7 h 57. La sauvegarde des données n'a pas tourné de la nuit :
 * la dernière remonte à la veille 5 h 04. GitHub sacrifie les tâches planifiées
 * quand sa plateforme est chargée — la file était déjà restée bloquée trente
 * minutes la veille au soir.
 *
 * **Personne n'aurait été prévenu.** Le workflow alerte quand la sauvegarde
 * ÉCHOUE ; il ne peut rien dire quand elle NE DÉMARRE PAS. Une tâche qui
 * échoue crie toute seule ; une tâche qui ne tourne jamais est muette — et ce
 * qu'elle protège ici est la seule copie des commandes, des produits, des
 * comptes et des images.
 *
 * On aurait pu perdre plusieurs nuits sans le savoir.
 *
 * DEUX EXIGENCES, ET LA SECONDE EST CELLE QU'ON OUBLIE :
 *
 * 1. Un retard réel se voit.
 * 2. **Une tâche qui n'a JAMAIS pointé se voit aussi.** Elle n'a aucune ligne
 *    en base — et traiter l'absence comme « rien à signaler » serait
 *    exactement le défaut qu'on répare.
 */

/** Le seuil du détecteur. Voir /api/internal/sante. */
const HEURES_SANS_SAUVEGARDE = 30;

type Pointage = { cle: string; dernier_le: string };

const TACHES = [
  { cle: 'sauvegarde_donnees', nom: 'Sauvegarde des donnees' },
  { cle: 'sauvegarde_schema', nom: 'Sauvegarde du schema' },
];

/** Le détecteur, tel que la sonde l'applique. */
function silences(pointages: Pointage[], maintenant: number) {
  const vuLe = new Map(pointages.map((p) => [p.cle, Date.parse(p.dernier_le)]));

  return TACHES.flatMap((t) => {
    const dernier = vuLe.get(t.cle);
    const jamais = dernier === undefined || !Number.isFinite(dernier);
    const ageMin = jamais ? Number.POSITIVE_INFINITY : Math.round((maintenant - dernier) / 60_000);

    if (!jamais && ageMin < HEURES_SANS_SAUVEGARDE * 60) return [];

    return [{
      cle: t.cle,
      jamais,
      age_minutes: jamais ? -1 : ageMin,
    }];
  });
}

const MAINTENANT = Date.parse('2026-08-27T08:00:00Z');
const ilYA = (heures: number) => new Date(MAINTENANT - heures * 3_600_000).toISOString();

const toutesAJour = (h = 3): Pointage[] =>
  TACHES.map((t) => ({ cle: t.cle, dernier_le: ilYA(h) }));

describe('sonde de santé — la sauvegarde qui ne tourne plus', () => {
  describe('ce qui ne doit rien dire', () => {
    it('deux sauvegardes de cette nuit : silence', () => {
      expect(silences(toutesAJour(3), MAINTENANT)).toHaveLength(0);
    });

    // SIX HEURES DE BATTEMENT AU-DELÀ DU RYTHME QUOTIDIEN. Un décalage de la
    // file GitHub ne doit réveiller personne — une alerte qui se trompe
    // s'apprend à ignorer, et c'est le défaut qu'on répare.
    it('une nuit de retard ne crie pas', () => {
      expect(silences(toutesAJour(27), MAINTENANT)).toHaveLength(0);
    });

    it('juste sous le seuil, toujours rien', () => {
      expect(silences(toutesAJour(29.9), MAINTENANT)).toHaveLength(0);
    });
  });

  describe('ce qui doit crier', () => {
    it('au-delà du seuil, la tâche est signalée', () => {
      const vus = silences(toutesAJour(31), MAINTENANT);
      expect(vus).toHaveLength(2);
      expect(vus[0].jamais).toBe(false);
    });

    /**
     * LE CAS REEL, ET CE QU'IL APPREND SUR LE SEUIL.
     *
     * Le 27 aout a 8 h, la derniere sauvegarde datait de la veille 5 h 04 : 27
     * heures, donc SOUS le seuil de 30. L'alerte ne serait pas partie a ce
     * moment-la — elle serait partie a 11 h 04 le meme matin, soit 5 h 04 plus
     * trente heures.
     *
     * C'est le bon arbitrage, et il est delibere. La tache passe a 4 h 30 :
     * un seuil serre crierait a chaque fois que la file GitHub prend deux
     * heures de retard, et une alerte qui se trompe s'apprend a ignorer. Trente
     * heures laissent six heures de battement ET rattrapent la nuit manquee le
     * matin meme.
     */
    it('le cas reel du 27 aout : 27 h, encore sous le seuil a 8 h', () => {
      const vus = silences(
        [{ cle: 'sauvegarde_donnees', dernier_le: '2026-08-26T05:04:00Z' },
         { cle: 'sauvegarde_schema', dernier_le: ilYA(2) }],
        MAINTENANT,
      );
      expect(vus).toHaveLength(0);
    });

    it('le meme cas a 12 h : l alerte part', () => {
      const vus = silences(
        [{ cle: 'sauvegarde_donnees', dernier_le: '2026-08-26T05:04:00Z' },
         { cle: 'sauvegarde_schema', dernier_le: '2026-08-27T05:57:00Z' }],
        Date.parse('2026-08-27T12:00:00Z'),
      );
      expect(vus).toHaveLength(1);
      expect(vus[0].cle).toBe('sauvegarde_donnees');
      expect(Math.round(vus[0].age_minutes / 60)).toBe(31);
    });

    // LA MOITIÉ QU'ON OUBLIE. Une tâche qui n'a jamais pointé n'a aucune ligne
    // en base : parcourir la table ne la montrerait pas. On énumère donc les
    // tâches ATTENDUES, pas celles qu'on trouve.
    it('une tâche qui n a JAMAIS pointé est signalée', () => {
      const vus = silences([], MAINTENANT);
      expect(vus).toHaveLength(2);
      expect(vus.every((v) => v.jamais)).toBe(true);
    });

    it('une seule des deux manque : seule celle-là est signalée', () => {
      const vus = silences([{ cle: 'sauvegarde_donnees', dernier_le: ilYA(2) }], MAINTENANT);
      expect(vus).toHaveLength(1);
      expect(vus[0].cle).toBe('sauvegarde_schema');
      expect(vus[0].jamais).toBe(true);
    });

    it.each(['', 'pas une date', '2026-13-45T99:99:99Z'])(
      'une date illisible (%s) compte comme un silence, jamais comme « à jour »',
      (date) => {
        const vus = silences([{ cle: 'sauvegarde_donnees', dernier_le: date }], MAINTENANT);
        expect(vus.some((v) => v.cle === 'sauvegarde_donnees' && v.jamais)).toBe(true);
      },
    );
  });
});
