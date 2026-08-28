import { promises as fs } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  JOURS_PANIER_ABANDONNE,
  JOURS_TRACE_RELANCE,
  MOIS_AVANT_ANONYMISATION,
} from '@/lib/conservation';
import { HORS_DE_PORTEE, TRAITEMENTS } from '@/lib/donneesPersonnelles';

/**
 * Le document juridique et le code disent-ils la même chose ?
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * La politique de confidentialité se termine sur cette phrase : « Toute
 * modification de ce document doit être répercutée dans le code, et
 * inversement : un document qui décrit une durée que le code n'applique pas est
 * pire que pas de document. »
 *
 * C'était une CONSIGNE, et rien ne la tenait. Or c'est précisément le motif que
 * ce dépôt paie sans cesse : deux copies d'une même règle, une intention écrite
 * de les garder d'accord, et la divergence qui arrive quand même — en silence,
 * parce que personne ne relit un document juridique en modifiant une constante.
 *
 * Ici la divergence est particulière : le document est **opposable**. Annoncer
 * trente jours et en appliquer quatre-vingt-dix n'est pas une incohérence de
 * code, c'est un engagement non tenu envers une personne, et une déclaration
 * fausse devant l'ARTCI.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 *
 * Il ne relit pas la prose. Il vérifie que les CHIFFRES du tableau de l'article
 * 5 sont ceux de `conservation.ts`, et que les limites reconnues dans le code
 * sont avouées dans le document. Le reste demande un conseil juridique, pas un
 * test.
 */

const RACINE = path.join(process.cwd(), 'docs', 'legal');

async function lire(fichier: string): Promise<string> {
  return fs.readFile(path.join(RACINE, fichier), 'utf8');
}

describe('la politique annonce les durées que le code applique', () => {
  it('le panier non converti : le document dit ce que la purge fait', async () => {
    const texte = await lire('politique-confidentialite.md');
    expect(texte).toContain(`${JOURS_PANIER_ABANDONNE} jours`);
  });

  it('la commande close : douze mois de part et d’autre', async () => {
    const texte = await lire('politique-confidentialite.md');
    expect(texte).toContain(`${MOIS_AVANT_ANONYMISATION} mois`);
  });

  it('la trace de relance : quatre-vingt-dix jours de part et d’autre', async () => {
    const texte = await lire('politique-confidentialite.md');
    expect(texte).toContain(`${JOURS_TRACE_RELANCE} jours`);
  });

  /**
   * LA SEULE DONNÉE QU'ON GARDE SANS LIMITE, ET IL FAUT QUE LE DOCUMENT LE DISE.
   *
   * Le code refuse d'effacer un refus de démarchage — c'est la trace d'un droit
   * exercé. Une politique qui promettrait de tout effacer contredirait le code
   * sur le seul point où celui-ci garde délibérément quelque chose.
   */
  it('le refus de démarchage est déclaré comme jamais effacé', async () => {
    const texte = await lire('politique-confidentialite.md');
    expect(texte).toMatch(/STOP.*\|\s*\*\*Sans limite\*\*/);
    expect(texte).toContain('Jamais effacé');
  });
});

describe('la politique avoue ce que l’effacement n’atteint pas', () => {
  /**
   * CE CONTRÔLE A ÉTÉ RETOURNÉ LE 28 AOÛT 2026, ET C'EST TOUT SON INTÉRÊT.
   *
   * Il exigeait l'inverse : que le document DÉCLARE la copie Google Sheets,
   * parce qu'une copie complète de chaque commande — nom, téléphone, adresse —
   * partait dans une feuille de calcul que la purge n'atteignait pas. Le taire
   * aurait fait promettre des durées ne valant que pour la moitié des données.
   *
   * La copie a été supprimée. Le contrôle garde donc la même fonction —
   * empêcher le document de mentir sur son périmètre — mais dans l'autre sens :
   * plus aucun destinataire Google ne doit réapparaître sans que le code
   * l'accompagne. Le jour où un nœud Google Sheets reviendrait dans un
   * workflow, c'est ici qu'il faudrait le déclarer, et ce test rappellerait
   * qu'on ne le fait pas.
   */
  it('aucune copie chez un tiers ne subsiste dans l’inventaire', () => {
    const sujets = HORS_DE_PORTEE.map((h) => h.quoi.toLowerCase());
    expect(sujets.some((s) => s.includes('feuille de calcul') || s.includes('tableur'))).toBe(false);
  });

  it('Google ne figure plus au tableau des sous-traitants', async () => {
    const texte = await lire('politique-confidentialite.md');
    const tableau = texte.split('### 6.2')[1]?.split('### 6.3')[0] ?? '';
    expect(tableau).not.toContain('Google');
  });

  // Ce que le code avoue au client doit l'être aussi dans le document : sinon
  // l'écran serait plus honnête que la politique, ce qui n'a aucun sens.
  it('chaque limite dite au client est dite dans le document', async () => {
    const texte = (await lire('politique-confidentialite.md')).toLowerCase();
    const sujets = HORS_DE_PORTEE.map((h) => h.quoi.toLowerCase());

    expect(sujets.some((s) => s.includes('whatsapp') || s.includes('telegram'))).toBe(true);
    expect(sujets.some((s) => s.includes('sauvegarde'))).toBe(true);
    expect(texte).toContain('sauvegarde');
    expect(texte).toMatch(/whatsapp|telegram/);
  });

  /**
   * L'INVENTAIRE NE DOIT PLUS PORTER DE DESTINATAIRE GOOGLE.
   *
   * C'est le contrôle qui tient la promesse de l'article 5.3 : « ces durées
   * valent pour la totalité des données ». Un traitement qui redéclarerait
   * Google parmi ses destinataires rendrait cette phrase fausse.
   */
  it('aucun traitement ne déclare Google comme destinataire', () => {
    const fautifs = TRAITEMENTS.filter((t) =>
      t.destinataires.some((d) => /google/i.test(d)) || /google/i.test(t.ou));
    expect(fautifs.map((t) => t.cle)).toEqual([]);
  });
});

describe('les CGU fondent ce que l’écran des droits fait', () => {
  /**
   * SANS CETTE CLAUSE, L'ÉCRAN AGIT SANS TITRE.
   *
   * Le Marchand est responsable de traitement des données de ses clients ;
   * l'Éditeur n'est que sous-traitant et ne peut agir que sur instruction. Un
   * écran qui efface immédiatement, sans passer par le Marchand, a donc besoin
   * que cette instruction existe quelque part — et le seul endroit où le
   * Marchand la donne, ce sont les CGU qu'il accepte.
   */
  it('les CGU donnent l’instruction permanente d’accès et d’effacement', async () => {
    const texte = await lire('cgu.md');
    expect(texte).toContain('Instruction permanente');
    expect(texte.toLowerCase()).toContain('effacement');
  });

  it('la politique renvoie à la page « Mes données »', async () => {
    const texte = await lire('politique-confidentialite.md');
    expect(texte).toContain('Mes données');
    expect(texte).toContain('8.3');
  });
});
