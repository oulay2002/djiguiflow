/**
 * CE QU'IL MANQUE AU PANIER — le minimum de commande, et la livraison offerte.
 *
 * LE DEFAUT QUE CE FICHIER FERME. La route refuse deja les commandes sous le
 * minimum, et elle sait meme dire de combien :
 *
 *     src/app/api/boutiques/[id]/commander/route.ts:530
 *     « Chez X, les commandes commencent a 5 000 F. Il vous manque 500 F. »
 *
 * Mais elle ne le dit qu'a la FIN : le client a deja choisi ses articles, saisi
 * son nom, son telephone, son adresse, et clique. Il decouvre alors qu'il ne
 * peut pas commander. Certains ajoutent un article ; les autres s'en vont, et
 * personne ne saura jamais qu'ils sont partis pour 500 francs.
 *
 * Le seuil est donc dit PENDANT qu'il choisit encore.
 *
 * AUCUN IMPORT VERS SUPABASE NI VERS REACT, comme `retrait.ts` et `horaires.ts`
 * dont ce fichier est le voisin : la regle traverse la frontiere
 * navigateur/serveur sans rien entrainer avec elle.
 *
 * LA VITRINE NE DOIT PAS DIRE AUTRE CHOSE QUE CE QUE LA ROUTE APPLIQUE. La
 * condition du minimum est recopiee a l'identique depuis la route, et
 * `tests/unit/objectifs-panier.test.ts` tombe si l'un des deux bouts bouge.
 */

import type { ModeCommande } from './retrait';

/** Un objectif atteignable, ou rien a dire. */
export type Objectif =
  | { type: 'minimum'; manque: number; seuil: number }
  | { type: 'livraison'; manque: number; seuil: number }
  | null;

const fcfa = (n: number) => Math.round(n).toLocaleString('fr-FR');

/**
 * UN MONTANT, OU RIEN.
 *
 * `Number()` accepte trop : `Number(true)` vaut 1, `Number('')` vaut 0, et un
 * tableau vide vaut 0 lui aussi. Un seuil ne peut venir que d'un vrai nombre —
 * tout le reste est une donnee absente qui se deguise, et un objectif
 * imaginaire vaut moins que pas d'objectif du tout.
 *
 * Voir la memoire « lire un montant saisi a la main » : le meme `Number()`
 * complaisant a deja livre un article gratuitement.
 */
function seuilUtilisable(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

export function objectifPanier(a: {
  mode: ModeCommande;
  total: number;
  /** `boutiques.commande_minimum` */
  minimum: unknown;
  /** `boutiques.livraison_offerte_des` */
  offerteDes: unknown;
}): Objectif {
  // UN PANIER VIDE N'A PAS D'OBJECTIF. Le client n'a encore rien choisi :
  // lui annoncer qu'il lui manque 5 000 F ferme la porte au lieu de l'ouvrir.
  if (!Number.isFinite(a.total) || a.total <= 0) return null;

  // ---- 1. Le minimum passe devant : il BLOQUE la commande.
  const minimum = seuilUtilisable(a.minimum);
  if (minimum !== null && minimum > 0 && a.total < minimum) {
    return { type: 'minimum', manque: minimum - a.total, seuil: minimum };
  }

  // ---- 2. La livraison offerte n'est qu'un bonus, et n'existe pas en retrait.
  if (a.mode === 'retrait') return null;

  // ZERO VEUT DIRE « TOUJOURS OFFERTE », jamais « seuil de zero franc ». Le
  // confondre annoncerait un objectif deja atteint, avec un manque negatif.
  const seuil = seuilUtilisable(a.offerteDes);
  if (seuil !== null && seuil > 0 && a.total < seuil) {
    return { type: 'livraison', manque: seuil - a.total, seuil };
  }

  return null;
}

/**
 * LA PHRASE, ET SON TON.
 *
 * Le minimum est une contrainte : on dit ce qui manque, et on rappelle le
 * seuil pour que le chiffre ne tombe pas de nulle part. La livraison offerte
 * est une occasion : on dit ce qu'il gagne, pas ce qu'il n'a pas.
 */
export function phraseObjectif(o: Objectif): string {
  if (!o) return '';
  if (o.type === 'minimum') {
    return `Il vous manque ${fcfa(o.manque)} FCFA pour atteindre le minimum de ${fcfa(o.seuil)} FCFA.`;
  }
  return `Plus que ${fcfa(o.manque)} FCFA et la livraison vous est offerte.`;
}

/**
 * CE QUE LE MARCHAND A POSE — dit au marchand, pas au client.
 *
 * ── POURQUOI CETTE FONCTION VIT ICI ────────────────────────────────────────
 *
 * Tout ce fichier traduit deux colonnes en phrases pour le CLIENT. Celle-ci
 * les traduit pour le MARCHAND, et c'est le seul endroit ou les deux lectures
 * peuvent rester d'accord.
 *
 * ⚠ LE PIEGE, ET IL EST LE MEME DES DEUX COTES. `livraison_offerte_des` a
 * TROIS etats, pas deux :
 *
 *     NULL   le livreur annonce ses frais       (l etat par defaut)
 *     0      la livraison est TOUJOURS offerte  (un choix, pas un vide)
 *     N > 0  offerte a partir de N francs
 *
 * Un ecran qui lit `!valeur` confond le zero et le vide, et annonce « pas
 * encore pose » a un marchand qui a EXPRESSEMENT choisi d offrir la livraison.
 * C est le motif du defaut silencieux, et c est pour ne l ecrire qu une fois
 * que cette fonction existe.
 *
 * ── CE QU ELLE NE FAIT PAS ─────────────────────────────────────────────────
 *
 * Elle ne juge pas. « Pas encore pose » n est pas un reproche : une boutique
 * sans minimum est parfaitement complete, et `vitrineComplete` exclut ces deux
 * colonnes a dessein. On dit l etat, on laisse le marchand decider.
 */
export type EtatLevier = {
  /** La phrase a afficher, toujours non vide. */
  phrase: string;
  /** Le marchand a-t-il fait un choix ? Sert a distinguer visuellement. */
  pose: boolean;
};

export function etatMinimum(minimum: unknown): EtatLevier {
  const n = seuilUtilisable(minimum);
  if (n === null || n <= 0) return { phrase: 'pas encore posé', pose: false };
  return { phrase: `${fcfa(n)} FCFA`, pose: true };
}

export function etatLivraisonOfferte(offerteDes: unknown): EtatLevier {
  const n = seuilUtilisable(offerteDes);
  if (n === null) return { phrase: 'le livreur annonce ses frais', pose: false };

  // LE ZERO EST UN CHOIX, ET IL SE DIT COMME TEL. Le confondre avec le vide
  // annoncerait « pas encore pose » a un marchand qui offre la livraison a
  // tout le monde depuis le premier jour.
  if (n <= 0) return { phrase: 'toujours offerte', pose: true };

  return { phrase: `offerte à partir de ${fcfa(n)} FCFA`, pose: true };
}
