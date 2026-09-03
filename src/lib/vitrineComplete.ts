import { boutiqueLivre } from '@/lib/boutiquePrete';

/**
 * CE QUE LE CLIENT A BESOIN DE SAVOIR AVANT DE COMMANDER.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * `boutiquePeutVendre` verifie deux choses : un canal branche, et un groupe de
 * livreurs. C'est le minimum TECHNIQUE — les commandes peuvent circuler. Rien
 * ne verifiait que la boutique donne envie d'acheter.
 *
 * Mesure du 1er septembre 2026 sur les trois boutiques existantes : AUCUNE
 * n'avait de delai de preparation, et l'une d'elles ne disait a ses clients ni
 * ce qu'elle vend, ni ou elle livre, ni comment on la paie. Sa vitrine etait
 * techniquement parfaite et completement muette.
 *
 * Le marchand, lui, ne vend pas et NE SAURA JAMAIS POURQUOI. Il conclura que
 * la plateforme ne marche pas.
 *
 * ── LA LIGNE : LES QUESTIONS DU CLIENT, PAS L'USAGE DES FONCTIONS ──────────
 *
 * `commande_minimum` et `livraison_offerte_des` sont EXCLUS a dessein. Ce sont
 * des leviers commerciaux, pas des informations dont le client a besoin : une
 * boutique sans minimum est parfaitement complete. Les compter comme manquants
 * transformerait cet indicateur en liste de fonctions a cocher — et un
 * indicateur qui reclame tout ne se lit plus.
 *
 * Chaque entree porte donc LA QUESTION DU CLIENT, en francais simple. Le
 * marchand ne remplit pas « delai_livraison » : il repond a « en combien de
 * temps livrez-vous ? ».
 *
 * ── CE N'EST PAS UN BLOCAGE ────────────────────────────────────────────────
 *
 * Une boutique incomplete vend quand meme. Empecher la vente ferait
 * disparaitre le marchand pendant qu'il remplit sa vitrine — exactement ce que
 * `boutiquePeutVendre` prend soin de ne pas faire.
 */

export type ManqueVitrine = {
  /** Le champ concerne, pour mener le marchand au bon endroit. */
  cle: string;
  /** La question du CLIENT a laquelle ce champ repond. */
  question: string;
  /** Ce que le client voit tant que la reponse manque. */
  sinon: string;
};

export type EtatVitrine = {
  posees: number;
  total: number;
  manquantes: ManqueVitrine[];
};

export type BoutiqueVitrine = {
  description?: unknown;
  horaires?: unknown;
  delai_livraison?: unknown;
  delai_preparation_min?: unknown;
  zones_livrees?: unknown;
  paiements_acceptes?: unknown;
  mode_recuperation?: unknown;
  /**
   * Une ligne de `boutiques` en porte bien d'autres, et c'est normal : cette
   * fonction en LIT quelques-unes, elle ne les decrit pas toutes. Fermer le
   * type obligerait chaque appelant a trier avant d'appeler.
   */
  [autre: string]: unknown;
};

/** Rempli veut dire : une valeur qu'un client pourrait lire. */
const rempli = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return Boolean(v);
};

export function etatVitrine(b: BoutiqueVitrine): EtatVitrine {
  const livre = boutiqueLivre(b.mode_recuperation);
  const manquantes: ManqueVitrine[] = [];
  let total = 0;

  const controler = (ok: boolean, m: ManqueVitrine) => {
    total += 1;
    if (!ok) manquantes.push(m);
  };

  controler(rempli(b.description), {
    cle: 'description',
    question: 'Que vend votre boutique ?',
    sinon: 'Le client arrive sur une page qui ne dit pas ce qu’il y trouvera.',
  });

  /**
   * LE DELAI DEPEND DU MODE, et c'est le meme soin que `boutiquePeutVendre`
   * prend pour les livreurs : on ne reclame pas a une boutique de retrait un
   * delai de livraison qu'elle n'aura jamais.
   */
  if (livre) {
    controler(rempli(b.delai_livraison), {
      cle: 'delai_livraison',
      question: 'En combien de temps livrez-vous ?',
      sinon: 'Le client commande sans savoir quand il sera servi.',
    });
    controler(rempli(b.zones_livrees), {
      cle: 'zones_livrees',
      question: 'Dans quels quartiers livrez-vous ?',
      sinon: 'Le client ne sait pas si vous venez jusque chez lui.',
    });
  } else {
    controler(rempli(b.delai_preparation_min), {
      cle: 'delai_preparation_min',
      question: 'En combien de temps préparez-vous une commande ?',
      sinon: 'Le client ne sait pas quand venir chercher.',
    });
  }

  controler(rempli(b.paiements_acceptes), {
    cle: 'paiements_acceptes',
    question: 'Comment vous paie-t-on ?',
    sinon: 'Le client hésite : espèces, Wave, Orange Money ?',
  });

  /**
   * LES HORAIRES SONT UNE DECISION, PAS UN OUBLI.
   *
   * `NULL` veut dire « ouvert en permanence » — c'est un choix valide, et le
   * verrou d'ouverture le respecte. Impossible de distinguer le marchand qui
   * ouvre 24 h/24 de celui qui n'a pas rempli. La ligne le dit donc comme une
   * chose a confirmer, jamais comme une faute : celui qui ouvre vraiment en
   * permanence lit une phrase juste et passe.
   */
  controler(rempli(b.horaires), {
    cle: 'horaires',
    question: 'Quand êtes-vous ouvert ?',
    sinon: 'Sans horaires, la boutique accepte des commandes 24 h/24 — y compris la nuit.',
  });

  return { posees: total - manquantes.length, total, manquantes };
}

/**
 * CETTE BOUTIQUE EST-ELLE MUETTE ? — la question que la veille pose.
 *
 * ── L'ANGLE MORT QU'ELLE FERME ─────────────────────────────────────────────
 *
 * `etatVitrine` parle au MARCHAND, dans son tableau de bord : il voit ce qui
 * manque et il le remplit. Cette regle-ci parle a l'EXPLOITANT, et elle repond
 * a une autre question : y a-t-il, en ce moment, une boutique publiquement en
 * ligne qui ne dit rien a ses clients ?
 *
 * L'entonnoir ne pouvait pas la poser. Il EXCLUT nos propres boutiques — a
 * dessein depuis le 3 septembre 2026, et c'est juste : les compter ferait
 * croire a une activation parfaite. Mais l'exclusion, juste pour un ratio, a
 * ferme le seul oeil qui regardait. Mesure du 3 septembre : Rose Monde,
 * `actif = true`, repondait a UNE question sur cinq.
 *
 * ── POURQUOI UN SEUIL, ET POURQUOI CELUI-LA ────────────────────────────────
 *
 * Alerter des qu'une reponse manque ferait sonner la veille sur toute boutique
 * neuve le jour de son ouverture — et une veille qu'on bruite est une veille
 * qu'on cesse de lire. Une boutique a qui il ne manque que les horaires n'est
 * pas muette : elle est perfectible, et son tableau de bord le lui dit deja.
 *
 * La moitie est la ou les deux etats cessent de se ressembler. En dessous, le
 * client n'a plus de quoi decider d'acheter.
 *
 * ── ELLE SE CALCULE, ELLE NE SE CHOISIT PAS ────────────────────────────────
 *
 * Le seuil sort de `total`, jamais d'un nombre ecrit en dur : une boutique de
 * retrait a QUATRE questions et non cinq, et un « moins de 3 » la jugerait sur
 * une echelle qui n'est pas la sienne.
 */
export function vitrineMuette(etat: EtatVitrine): boolean {
  return etat.posees * 2 < etat.total;
}

/**
 * LA VEILLE DOIT-ELLE PARLER DE CETTE BOUTIQUE ?
 *
 * ── POURQUOI CETTE DECISION N'EST PAS RESTEE DANS LA ROUTE ─────────────────
 *
 * `vitrineMuette` dit si une vitrine est muette. Elle ne dit RIEN de la
 * question que se pose la veille, qui en compte trois : muette, oui — mais
 * aussi publiquement en ligne, et pas une boutique de banc.
 *
 * Ces deux conditions-la portent tout le sens du controle. « En ligne et
 * muette » est une urgence : des visiteurs arrivent en ce moment sur une page
 * qui ne dit rien. « Hors ligne et muette » n'est rien du tout — c'est une
 * boutique en preparation, et le 3 septembre 2026 c'etait le cas d'Atelier
 * Temoin, `actif = false`, elle aussi a 1 reponse sur 5.
 *
 * Laissees dans la boucle de la route, elles auraient ete les seules lignes du
 * controle qu'aucun test n'atteint — le defaut exact du 2 septembre, ou une
 * fonction parfaitement eprouvee n'etait pas appelee au bon endroit. Elles
 * vivent donc ici, ou une mutation les fait rougir.
 */
export function vitrineASignaler(v: {
  /** `actif` : la boutique est-elle servie au public en ce moment ? */
  enLigne: boolean;
  /** Une boutique de banc n'est pas une panne — meme raison que cote dispatch. */
  deBanc: boolean;
  etat: EtatVitrine;
}): boolean {
  if (!v.enLigne) return false;
  if (v.deBanc) return false;
  return vitrineMuette(v.etat);
}
