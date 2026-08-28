/**
 * Lire la réponse de `/api/mes-donnees/effacement`, sans se tromper de forme.
 *
 * ── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
 *
 * L'écran testait `res.ok && corps.bilan`. Or la route rend QUATRE formes, et
 * l'une d'elles est un succès SANS bilan : quand le dossier est déjà anonymisé,
 * elle répond `{ ok: true, dejaEfface: true }` — il n'y a rien à compter, donc
 * rien à inscrire au registre. La condition tombait à faux, et l'écran
 * affichait « L'effacement n'a pas abouti » à quelqu'un dont les données
 * étaient parties. C'était le seul endroit de l'écran qui mentait.
 *
 * Le plus instructif : le commentaire posé juste à côté de ce test CITAIT
 * `dejaEfface` pour expliquer pourquoi le réessai était sans danger. Le
 * raisonnement était juste, la lecture de la réponse ne le suivait pas. Un
 * commentaire ne vérifie rien — d'où cette fonction, et son test.
 *
 * ── POURQUOI ELLE EST PURE, ET SEULE DANS SON FICHIER ──────────────────────
 *
 * L'écran est un composant client : rien de ce qui vit à l'intérieur n'est
 * atteignable par un test unitaire sans monter React. Sortie ici, la
 * correspondance entre les formes du serveur et les états de l'écran devient
 * une table de vérité qu'on peut figer. Le jour où la route gagne une
 * cinquième forme, c'est ce fichier qui la refuse.
 *
 * ── CE QUI SE JOUE POUR LA PERSONNE ────────────────────────────────────────
 *
 * Rouvrir le lien gardé dans son message est LE geste qui suit un effacement.
 * La route de consultation l'avait prévu ; celle d'effacement non. Se tromper
 * ici, c'est répondre « votre droit n'a pas été honoré » à quelqu'un qui vient
 * de l'exercer — il recommencera, ou il écrira au marchand.
 */

export type Bilan = {
  commandesAnonymisees: number;
  paniersSupprimes: number;
  relancesSupprimees: number;
  avisRetires: number;
  commandesEnCours: number;
  refusEnregistres: number;
};

/**
 * Les trois issues que l'écran doit savoir distinguer.
 *
 * `dejaEfface` n'est PAS un échec, et ce n'est pas non plus un effacement : on
 * ne peut ni afficher un bilan (il n'y en a pas), ni parler d'échec (rien n'a
 * échoué). C'est un troisième cas, et c'est précisément celui que l'ancienne
 * condition binaire ne pouvait pas exprimer.
 */
export type IssueEffacement =
  | { sorte: 'efface'; complet: boolean; bilan: Bilan }
  | { sorte: 'dejaEfface' }
  | { sorte: 'echec'; message: string };

const ECHEC_PAR_DEFAUT = 'L’effacement n’a pas abouti.';

/**
 * Ce qui a été retiré, dit au passé, une ligne par catégorie touchée.
 *
 * ── POURQUOI CETTE FONCTION EXISTE, ET PAS UN TROISIÈME GABARIT ────────────
 *
 * L'écran des droits porte déjà `porteeDuGeste`, qui compose la même liste au
 * FUTUR pour la confirmation, en écrivant les accords en toutes lettres et en
 * omettant les catégories vides. Sa docstring déclare les deux règles :
 * « un commande(s) à l'écran est un gabarit qu'on lit, pas une phrase qu'on
 * écrit », et « afficher 0 laisserait croire que le geste n'a servi à rien ».
 *
 * Huit cents lignes plus bas, le bloc d'après-effacement faisait les deux :
 * « 0 commande(s) : votre identité en a été retirée. » Une règle écrite dans
 * un fichier ne s'applique pas toute seule à l'autre bout du même fichier —
 * c'est le motif que cette session a payé trois fois. Elle est donc sortie
 * ici, où un test la tient.
 *
 * ── POURQUOI LE PASSÉ ET LE FUTUR NE PARTAGENT PAS UNE MÊME FONCTION ───────
 *
 * On pourrait croire à une seule liste conjuguée deux fois. Ce n'en est pas
 * une : la confirmation annonce ce qui VA être touché, d'après le dossier
 * affiché ; le bilan rapporte ce que le SERVEUR a effectivement fait, et les
 * deux peuvent différer — une commande close entre-temps, un panier expiré.
 * Fusionner les deux ferait dire à l'écran ce qu'il croyait plutôt que ce qui
 * s'est passé.
 *
 * ── POURQUOI `refusEnregistres` N'EST PAS UNE LIGNE, APRÈS L'AVOIR ÉTÉ ─────
 *
 * Ma première version en faisait une : « c'est la seule ligne qui dit qu'on a
 * AJOUTÉ quelque chose, la taire laisserait croire que tout est parti alors
 * qu'un numéro reste ». Le raisonnement était juste et la prémisse fausse — le
 * panneau ferme DÉJÀ sur « nous gardons uniquement votre numéro sur une liste
 * de refus, pour ne plus jamais vous démarcher », et il le disait avant moi.
 *
 * Mesuré dans le navigateur : la ligne et ce paragraphe se lisaient à 250 px
 * l'un de l'autre, dans le même écran, disant la même chose deux fois. Le
 * compteur ne rachète pas la répétition : il compte des LIGNES en base, une
 * par boutique, et `relances_stop` est upserté pour chaque boutique du dossier
 * — donc il vaut au moins 1 à chaque effacement. La ligne serait apparue
 * toujours, et la répétition avec elle.
 *
 * Un bilan de RETRAITS ne mélange pas un ajout à ses lignes. Le paragraphe le
 * dit mieux, et il le dit déjà.
 */
export function lignesDuBilan(bilan: Bilan): string[] {
  const lignes: string[] = [];

  if (bilan.commandesAnonymisees > 0) {
    lignes.push(
      bilan.commandesAnonymisees === 1
        ? 'Votre identité a été retirée d’une commande terminée.'
        : `Votre identité a été retirée de ${bilan.commandesAnonymisees} commandes terminées.`,
    );
  }
  if (bilan.paniersSupprimes > 0) {
    lignes.push(
      bilan.paniersSupprimes === 1
        ? 'Un panier non validé a été supprimé.'
        : `${bilan.paniersSupprimes} paniers non validés ont été supprimés.`,
    );
  }
  if (bilan.relancesSupprimees > 0) {
    lignes.push(
      bilan.relancesSupprimees === 1
        ? 'Une trace de relance a été supprimée.'
        : `${bilan.relancesSupprimees} traces de relance ont été supprimées.`,
    );
  }
  if (bilan.avisRetires > 0) {
    lignes.push(
      bilan.avisRetires === 1
        ? 'Un commentaire de livraison a été retiré.'
        : `${bilan.avisRetires} commentaires de livraison ont été retirés.`,
    );
  }
  return lignes;
}

function estBilan(v: unknown): v is Bilan {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return typeof b.commandesAnonymisees === 'number'
    && typeof b.paniersSupprimes === 'number'
    && typeof b.relancesSupprimees === 'number'
    && typeof b.avisRetires === 'number';
}

/**
 * @param ok      `res.ok` de la réponse HTTP.
 * @param corps   Le JSON rendu, ou `null` s'il était illisible.
 *
 * L'ORDRE DES TESTS COMPTE. `dejaEfface` est examiné AVANT le bilan : la route
 * peut très bien rendre les deux un jour, et dans ce cas c'est « déjà effacé »
 * qui décrit la vérité pour la personne.
 */
export function lireReponseEffacement(ok: boolean, corps: unknown): IssueEffacement {
  if (typeof corps !== 'object' || corps === null) {
    return { sorte: 'echec', message: ECHEC_PAR_DEFAUT };
  }
  const c = corps as Record<string, unknown>;

  // Un corps porteur d'`error` est un refus, quel que soit le statut : on ne
  // fabrique pas un succès a partir d'un 200 accidentel.
  if (typeof c.error === 'string' && c.error.trim() !== '') {
    return { sorte: 'echec', message: c.error };
  }
  if (!ok) return { sorte: 'echec', message: ECHEC_PAR_DEFAUT };

  if (c.dejaEfface === true) return { sorte: 'dejaEfface' };
  if (estBilan(c.bilan)) {
    return { sorte: 'efface', complet: c.complet === true, bilan: c.bilan };
  }

  // Succes annonce sans matiere : on ne prétend pas avoir efface.
  return { sorte: 'echec', message: ECHEC_PAR_DEFAUT };
}
