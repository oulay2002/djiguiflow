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
