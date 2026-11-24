import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEURES_SAUVEGARDE_MAX, sauvegardeAssezRecente } from '@/lib/conservation';

/**
 * La purge n'efface que ce qu'une sauvegarde recente contient.
 *
 * CE QUI S'EST PASSE. La sauvegarde part de GitHub a 4 h 30, la purge de n8n a
 * 5 h 45 : l'une devait preceder l'autre. Les 23 et 24 novembre 2026, GitHub a
 * lance la sienne avec une dizaine d'heures de retard — la purge est passee
 * AVANT la sauvegarde qu'elle etait censee suivre. L'ordre tenait a deux
 * horloges, dont une que personne ici ne regle.
 *
 * LA REGLE. La purge lit l'heure du dernier passage de la sauvegarde, et
 * refuse d'effacer s'il est trop ancien, absent ou illisible.
 */

const MAINTENANT = Date.parse('2026-11-24T05:45:00Z');
const ilYA = (heures: number) => new Date(MAINTENANT - heures * 3_600_000).toISOString();

describe('une sauvegarde recente autorise la purge', () => {
  it('celle de la nuit, a l’heure', () => {
    expect(sauvegardeAssezRecente(ilYA(1.25), MAINTENANT)).toEqual({ ok: true, ageHeures: 1.3 });
  });

  it('celle de la veille, partie avec dix heures de retard — le cas constate', () => {
    // Sauvegarde le 23 a 15 h 13, purge le 24 a 5 h 45.
    const etat = sauvegardeAssezRecente('2026-11-23T15:13:48.467Z', MAINTENANT);
    expect(etat.ok).toBe(true);
    expect(etat.ageHeures).toBeCloseTo(14.5, 1);
  });

  it('jusqu’a la limite comprise', () => {
    expect(sauvegardeAssezRecente(ilYA(HEURES_SAUVEGARDE_MAX), MAINTENANT).ok).toBe(true);
  });
});

describe('dans le doute, la purge attend', () => {
  it('une nuit entiere manquee', () => {
    const etat = sauvegardeAssezRecente(ilYA(49), MAINTENANT);
    expect(etat).toEqual({ ok: false, ageHeures: 49 });
  });

  it('juste au-dela de la limite', () => {
    expect(sauvegardeAssezRecente(ilYA(HEURES_SAUVEGARDE_MAX + 0.2), MAINTENANT).ok).toBe(false);
  });

  it.each([
    ['jamais pointee', undefined],
    ['nulle', null],
    ['vide', '   '],
    ['illisible', 'hier soir'],
    ['un nombre', 1795442617116],
  ])('%s → refus, sans age invente', (_nom, valeur) => {
    expect(sauvegardeAssezRecente(valeur, MAINTENANT)).toEqual({ ok: false, ageHeures: null });
  });

  it('une date dans le futur ne prouve aucune sauvegarde', () => {
    expect(sauvegardeAssezRecente(ilYA(-3), MAINTENANT).ok).toBe(false);
  });

  it('…mais deux serveurs peuvent differer de quelques minutes', () => {
    expect(sauvegardeAssezRecente(ilYA(-2 / 60), MAINTENANT).ok).toBe(true);
  });
});

describe('le delai est defendable', () => {
  it('il tolere un passage en retard, et arrete tout apres une nuit manquee', () => {
    // Moins de 24 h : une fausse alerte chaque fois que GitHub a du retard un
    // jour et pas le suivant. 48 h ou plus : deux nuits sans sauvegarde
    // passeraient sans un mot.
    expect(HEURES_SAUVEGARDE_MAX).toBeGreaterThan(24);
    expect(HEURES_SAUVEGARDE_MAX).toBeLessThan(48);
  });
});

describe('ce qui tient autour, dans la route de purge', () => {
  const route = readFileSync('src/app/api/internal/conservation/route.ts', 'utf8').replace(/\r\n/g, '\n');
  const sauvegardeYml = readFileSync('.github/workflows/sauvegarde-donnees.yml', 'utf8');

  it('LE CONTROLE PASSE AVANT LA PREMIERE SUPPRESSION', () => {
    const controle = route.indexOf('if (!sauvegarde.ok && !essai) {');
    expect(controle).toBeGreaterThan(-1);
    expect(controle).toBeLessThan(route.indexOf('.delete()'));
    expect(controle).toBeLessThan(route.indexOf('.update('));
  });

  it('il lit le pointage que la sauvegarde ecrit', () => {
    expect(route).toContain(".eq('cle', 'sauvegarde_donnees')");
    // Les deux bouts nomment la meme cle : renommee d'un seul cote, la purge
    // refuserait pour toujours.
    expect(sauvegardeYml).toContain('"cle":"sauvegarde_donnees"');
  });

  it('UN REFUS FAIT ECHOUER L’APPEL : la panne de sauvegarde ne reste pas muette', () => {
    const bloc = route.slice(route.indexOf('if (!sauvegarde.ok && !essai) {'), route.indexOf('const iso ='));
    expect(bloc).toContain('{ status: 503 }');
    expect(bloc).toContain('ok: false');
  });

  it('le message traverse n8n et Telegram : une ligne, sans tiret bas ni asterisque', () => {
    const bloc = route.slice(route.indexOf('const motif = errPointage'), route.indexOf("console.error('Conservation —', erreur);"));
    const textes = bloc.match(/[`'][^`']*[`']/g) ?? [];
    for (const t of textes) {
      // Les `${…}` sont du code, pas du texte envoye.
      const envoye = t.replace(/\$\{[^}]*\}/g, '');
      expect(envoye, t).not.toMatch(/[_*\n]/);
    }
  });

  it('l’essai a blanc passe toujours : c’est lui qui dit pourquoi la purge refuse', () => {
    expect(route).toContain('if (!sauvegarde.ok && !essai) {');
    expect(route).toMatch(/essai,\s*fait,\s*\/\/[^\n]*\n\s*sauvegarde,/);
  });
});
