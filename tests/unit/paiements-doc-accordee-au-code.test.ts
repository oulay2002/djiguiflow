import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `docs/PAIEMENTS.md` EST UN MODE D'EMPLOI D'ARGENT. Il doit dire la verite.
 *
 * ── LE DEFAUT QUI A JUSTIFIE CE FICHIER, ET IL A UNE DATE ──────────────────
 *
 * Le 4 septembre 2026, ce document s'intitulait encore « le jour ou les cles
 * arrivent » et s'ouvrait sur « Aujourd'hui, la plateforme n'encaisse rien ».
 * Les cles etaient posees depuis le 26 aout, le webhook declare, le drapeau de
 * bac a sable retire : trois de ses quatre gestes etaient FAITS. Quelqu'un qui
 * l'aurait lu avant de payer y aurait appris que c'etait impossible.
 *
 * Un document qui decrit un etat revolu est pire qu'un document absent : on le
 * lit, et on renonce.
 *
 * ── CE QUE CE TEST GARDE, ET CE QU'IL NE PEUT PAS GARDER ───────────────────
 *
 * Il ne peut PAS verifier l'etat de la production : une suite unitaire ne joint
 * ni Vercel ni GeniusPay, et un test qui le tenterait serait rouge chaque fois
 * qu'une liaison tousse. Ce controle-la reste humain, et le document dit
 * comment le faire (`/api/internal/billing/diagnostic`).
 *
 * Il garde ce qui EST verifiable sans sortir du depot : que le tableau
 * « ce que chaque etat veut dire » nomme **tous** les etats que le code sait
 * rendre. C'est la moitie du document qu'on lit un jour de panne, quand un
 * marchand a paye et attend — le pire moment pour tomber sur un etat que
 * personne n'a documente.
 *
 * ⚠ IL MANQUAIT DEJA `introuvable`, depuis l'ecriture du document le 22 aout.
 *
 * Meme methode que `legal-accorde-au-code` : accorder le document au code,
 * plutot que garder l'intention.
 */

const DOC = readFileSync('docs/PAIEMENTS.md', 'utf8');
const CODE = readFileSync('src/lib/billing/encaissement.ts', 'utf8');

/**
 * Les etats declares par le type de retour de `honorerPaiement`.
 *
 * On lit le TYPE, pas les `return` : un etat declare mais jamais rendu doit
 * quand meme etre documente — il le sera un jour, et c'est justement celui-la
 * qu'on ne saura pas lire.
 */
function etatsDuCode(): string[] {
  const etats = [...CODE.matchAll(/\{\s*etat:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  return [...new Set(etats)].sort();
}

describe('le mode d emploi des paiements suit le code', () => {
  it('le code declare bien une poignee d etats', () => {
    // Garde-fou du garde : si la lecture du type cassait, la liste tomberait a
    // zero et TOUS les controles ci-dessous passeraient sans rien verifier.
    const etats = etatsDuCode();
    expect(etats.length).toBeGreaterThanOrEqual(6);
    expect(etats).toContain('honore');
    expect(etats).toContain('acces_non_ouvert');
  });

  it('CHAQUE etat que le code sait rendre est explique dans le document', () => {
    const oublies = etatsDuCode().filter((e) => !DOC.includes(`\`${e}\``));

    expect(
      oublies,
      `Etat(s) absent(s) de docs/PAIEMENTS.md : ${oublies.join(', ')}.\n`
        + "C'est le tableau qu'on lit quand un marchand a paye et attend.\n"
        + 'Ajouter la ligne, ou retirer l etat du code.',
    ).toEqual([]);
  });

  it('le document ne REDIT pas que la plateforme n encaisse pas', () => {
    /*
      LE TITRE DE SECTION, PAS LA PHRASE. Le document RACONTE son propre defaut
      du 22 aout, en citant « Aujourd'hui, la plateforme n'encaisse rien » — et
      il a raison de le faire : c'est ce qui empeche d'y revenir sans y penser.

      Ce qu'on interdit, c'est qu'elle redevienne un EN-TETE, c'est-a-dire ce
      qu'un lecteur presse retient. La citation vit dans un bloc de mise en
      garde ; l'en-tete, lui, annonce l'etat du jour.
    */
    const enTetes = [...DOC.matchAll(/^#{1,3} (.+)$/gm)].map((m) => m[1]);
    expect(enTetes.some((t) => /n'encaisse rien/.test(t))).toBe(false);
    expect(enTetes.some((t) => /le jour où les clés arrivent/.test(t))).toBe(false);
  });

  it('et il porte les deux regles qui empechent d enterrer de l argent', () => {
    // Un indetermine confondu avec un refus enterre un paiement encaisse.
    expect(DOC).toContain("Un paiement indéterminé n'est pas un paiement refusé");
    // Le filet doit rester bruyant : c'est sa levee qui reveille l exploitant.
    expect(DOC).toMatch(/[Nn]e jamais lui poser `onError`/);
  });
});
