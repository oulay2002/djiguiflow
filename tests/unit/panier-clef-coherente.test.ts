import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * « Ce qu'on range sous une clef se relit sous la MEME clef. »
 *
 * CE QUE CE GARDE AURAIT ATTRAPE. Dans `tariferPanier`, la table des lignes
 * resolues est remplie sous `clef(d)` — soit `id::variante` des qu'une
 * declinaison existe — et testee sous `clef(d)`. Une seule ligne, la
 * relecture finale, utilisait `d.id`.
 *
 * Consequence : TOUTE ligne portant une pointure, une taille ou un coloris
 * etait silencieusement perdue. Une commande de chaussures en 42 se reduisait a
 * « Panier vide » ou a une commande amputee — la fonctionnalite des
 * declinaisons ne marchait pas du tout sur la vitrine, et rien ne le disait.
 * Trouve a l'audit du 26 aout 2026, un mois apres sa mise en service.
 *
 * POURQUOI UN GARDE DE SOURCE ET NON UN TEST DE LA FONCTION. `tariferPanier`
 * n'est pas exportee et lit la base : l'eprouver demanderait de simuler tout
 * l'amont. C'est le meme raisonnement qui a fait SORTIR `boutiquePrete` de
 * cette route — mais l'extraire aussi est un chantier, et ce defaut-la se
 * ferme aujourd'hui. Ce garde tient la place, et il tient exactement la ligne
 * qui a casse.
 *
 * Ce test se lit comme les autres gardes de source du depot : il ne prouve pas
 * que la fonction est juste, il prouve que le defaut precis ne peut pas revenir.
 */

const ROUTE = 'src/app/api/boutiques/[id]/commander/route.ts';

describe('le panier se relit sous la clef qui l a rempli', () => {
  const source = readFileSync(ROUTE, 'utf8');

  it('la route existe toujours a ce chemin', () => {
    // Un fichier deplace rendrait ce garde muet, et un garde muet passe au vert.
    expect(source).toContain('function tariferPanier');
    expect(source).toContain('const resolues');
  });

  it('AUCUNE LECTURE DE `resolues` NE SE FAIT PAR AUTRE CHOSE QUE `clef`', () => {
    const lectures = [...source.matchAll(/resolues\.(get|has)\(([^)]*)\)/g)];

    // S'il n'y en a aucune, c'est que la forme du code a change : on prefere
    // crier plutot que de laisser croire que le garde a verifie quelque chose.
    expect(lectures.length).toBeGreaterThan(0);

    for (const [entier, , argument] of lectures) {
      expect(
        argument.trim().startsWith('clef('),
        `${ROUTE} : « ${entier} » relit la table par autre chose que clef().\n`
          + 'La table est remplie sous `clef(d)` — `id::variante` quand il y a une\n'
          + 'declinaison. Toute lecture par `d.id` perd SILENCIEUSEMENT les lignes\n'
          + 'qui portent une pointure, une taille ou un coloris.',
      ).toBe(true);
    }
  });

  it('et les ecritures aussi, sinon la symetrie ne prouve rien', () => {
    const ecritures = [...source.matchAll(/resolues\.set\(([^,]*),/g)];
    expect(ecritures.length).toBeGreaterThan(0);

    for (const [entier, argument] of ecritures) {
      expect(
        argument.trim().startsWith('clef('),
        `${ROUTE} : « ${entier} » range sous autre chose que clef().`,
      ).toBe(true);
    }
  });
});
