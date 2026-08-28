import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Aucun appel sortant ne doit pouvoir pendre indefiniment.
 *
 * CE QUI EST EN JEU. `fetch` n'impose aucun delai, et aucun `maxDuration` n'est
 * declare : la plateforme laisse donc une fonction ouverte jusqu'a CINQ MINUTES
 * quand un fournisseur ne repond plus.
 *
 * Un fournisseur qui PEND coute plus cher qu'un fournisseur qui TOMBE. Tombe,
 * il rend une erreur en quelques millisecondes et le code sait quoi faire. Qui
 * pend, il retient l'appelant — et sur `canaux.ts`, la sortie unique, il retient
 * TOUS les appelants a la fois. n8n reessaie par-dessus, et la file s'allonge.
 *
 * Ce test regarde la PRESENCE d'un delai, pas sa valeur. Comme
 * `couverture-des-gardes`, il parle de demain : l'appel qu'on ajoutera sans y
 * penser.
 */

function fichiersServeur(racine: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(racine)) {
    const complet = join(racine, nom);
    if (statSync(complet).isDirectory()) sortie.push(...fichiersServeur(complet));
    else if (nom.endsWith('.ts')) sortie.push(complet.replace(/\\/g, '/'));
  }
  return sortie;
}

/**
 * Les dispenses, chacune avec sa raison. Une dispense sans raison est une porte
 * laissee ouverte par habitude.
 */
const DISPENSES: Record<string, string> = {
  'src/lib/billing/cinetpay.ts':
    "prestataire INACTIF : `prestataireActif()` prend GeniusPay des qu'il est configure. Ce code ne s'execute pas aujourd'hui.",
  'src/lib/apiClient.ts':
    "client du NAVIGATEUR vers nos propres routes : un appel qui pend y fait tourner un indicateur, il ne retient aucune fonction serveur.",
  'src/app/api/confirmation/route.ts':
    "l'appel restant est du JavaScript dans une chaine, execute par le navigateur du client — il porte deja son propre `timeout`.",
};

/**
 * L'appel `fetch(...)` en entier, parentheses comptees.
 *
 * Une premiere version regardait « les 900 caracteres qui suivent ». Elle
 * signalait a tort deux appels dont le `signal:` arrivait vingt-quatre lignes
 * plus bas, apres un corps JSON copieux. Un test qui crie sur du code correct
 * se fait desactiver, et emporte avec lui les vrais defauts qu'il aurait
 * attrapes. On compte donc, au lieu d'estimer.
 */
function appelsSansDelai(source: string): number {
  let sans = 0;
  for (const m of source.matchAll(/\bfetch\(/g)) {
    let profondeur = 0;
    let i = (m.index ?? 0) + 'fetch'.length;
    const debut = i;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '(') profondeur += 1;
      else if (c === ')') {
        profondeur -= 1;
        if (profondeur === 0) break;
      }
    }
    const appel = source.slice(debut, i + 1);
    if (!appel.includes('signal:') && !appel.includes('AbortSignal')) sans += 1;
  }
  return sans;
}

describe('tout appel sortant porte un delai', () => {
  const fichiers = [...fichiersServeur('src/app/api'), ...fichiersServeur('src/lib')];

  it('il y a bien des fichiers a verifier', () => {
    // Un chemin renomme rendrait la liste vide, et un test sur zero fichier
    // passe au vert en ne verifiant rien.
    expect(fichiers.length).toBeGreaterThan(50);
  });

  it.each(fichiers)('%s', (fichier) => {
    const source = readFileSync(fichier, 'utf8');
    if (!source.includes('fetch(')) return;
    if (appelsSansDelai(source) === 0) return;

    const raison = DISPENSES[fichier];
    expect(
      raison,
      `${fichier} appelle fetch sans delai.\n` +
        'Sans lui, un fournisseur qui ne repond plus retient la fonction jusqu a cinq minutes.\n' +
        'Ajoutez `signal: delai(...)` depuis @/lib/reseau, ou une dispense argumentee.',
    ).toBeTruthy();
  });

  // Une dispense qui survit a son fichier devient un mensonge silencieux.
  it('aucune dispense ne designe un fichier disparu', () => {
    for (const chemin of Object.keys(DISPENSES)) {
      expect(fichiers, `${chemin} est dispense mais n'existe plus`).toContain(chemin);
    }
  });
});
