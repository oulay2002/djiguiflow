/**
 * Le panier tel que le navigateur l'envoie, ramene a quelque chose de fiable.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * La route de commande lisait le panier en ligne, sans rien borner. Trois
 * defauts en decoulaient, trouves a l'audit du 22 novembre 2026 :
 *
 *  1. LES DOUBLONS CONTOURNAIENT LE STOCK. Le controle se faisait LIGNE PAR
 *     LIGNE. Avec un stock de 3, dix lignes du meme article en quantite 3
 *     passaient toutes : la commande portait 30 unites d'un article dont il
 *     restait 3. « Le serveur decide » — mais il decidait dix fois de suite sur
 *     le meme stock. On fond donc les doublons AVANT tout controle.
 *  2. AUCUNE BORNE. Ni le nombre de lignes ni la quantite n'avaient de plafond.
 *     Un panier de 50 000 lignes lancait 50 000 decomptes de stock en serie ; la
 *     fonction expirait APRES l'insertion et AVANT les notifications — une
 *     commande en base dont personne n'etait prevenu.
 *  3. UNE QUANTITE FRACTIONNAIRE PASSAIT. `2.5` plats, facture `2.5 × prix`.
 *
 * ── ON REFUSE, ON NE RABOTE PAS ────────────────────────────────────────────
 *
 * Ramener en silence 5 000 a 999 livrerait autre chose que ce qui a ete
 * demande. Meme regle que pour le stock : le refus dit quoi, le client ajuste.
 *
 * Module pur, sans base ni reseau : c'est ce qui permet de l'EPROUVER, ce que
 * la route — qui lit le catalogue — ne permettait pas.
 */

export type LigneDemandee = { id: string; quantite: number; variante: string };

export type PanierDemande =
  | { ok: true; lignes: LigneDemandee[] }
  | { ok: false; erreur: string };

/** Assez pour un tres gros panier ; les memes bornes que `/panier`. */
export const LIGNES_MAX = 50;
export const QUANTITE_MAX = 999;

/**
 * La clef d'une ligne : l'article ET son choix.
 *
 * Une clef limitee a l'identifiant fondrait deux pointures du meme modele en
 * une seule ligne : le client demandait un 39 et un 41, le marchand en
 * recevait deux d'une seule taille.
 */
export function clefLigne(l: { id: string; variante: string }): string {
  return l.variante ? `${l.id}::${l.variante}` : l.id;
}

export function lirePanierDemande(panier: unknown): PanierDemande {
  if (!Array.isArray(panier)) return { ok: true, lignes: [] };

  // Borne AVANT de parcourir : la taille du tableau est a la main de
  // l'appelant. Le double de la limite laisse la place aux doublons qu'un vrai
  // panier peut contenir, sans laisser parcourir n'importe quoi.
  if (panier.length > LIGNES_MAX * 2) {
    return { ok: false, erreur: `Votre panier compte trop de lignes (${LIGNES_MAX} au plus).` };
  }

  const fondues = new Map<string, LigneDemandee>();

  for (const brute of panier) {
    const l = (brute ?? {}) as { id?: unknown; quantite?: unknown; variante?: unknown };
    const id = String(l.id ?? '').trim().slice(0, 80);
    if (!id) continue;

    // Absente, la quantite vaut 1 : c'est ce que faisait deja la route, et un
    // ancien onglet peut ne pas l'envoyer. Presente, elle doit etre un entier.
    const quantite =
      l.quantite === undefined || l.quantite === null || l.quantite === ''
        ? 1
        : Number(l.quantite);

    if (!Number.isInteger(quantite) || quantite < 1) {
      return { ok: false, erreur: 'Une quantité de votre panier n’est pas valide.' };
    }

    // On borne : cette valeur part telle quelle dans le message du marchand et
    // du livreur. Un client ne tape pas trente caracteres de pointure.
    const variante = String(l.variante ?? '').trim().slice(0, 40);

    const ligne = { id, quantite, variante };
    const cle = clefLigne(ligne);
    const deja = fondues.get(cle);
    if (deja) deja.quantite += quantite;
    else fondues.set(cle, ligne);
  }

  const lignes = [...fondues.values()];

  if (lignes.length > LIGNES_MAX) {
    return { ok: false, erreur: `Votre panier compte trop de lignes (${LIGNES_MAX} au plus).` };
  }

  // APRES la fusion : c'est la somme qui compte, pas chaque doublon.
  if (lignes.some((l) => l.quantite > QUANTITE_MAX)) {
    return {
      ok: false,
      erreur: `Une quantité de votre panier dépasse ${QUANTITE_MAX}. Contactez la boutique pour une commande de cette taille.`,
    };
  }

  return { ok: true, lignes };
}
