/**
 * Les documents juridiques, lus depuis `docs/legal/` au moment du build.
 *
 * POURQUOI LIRE LE FICHIER PLUTOT QUE RECOPIER LE TEXTE EN TSX.
 *
 * Une CGV existe deja quelque part : dans `docs/legal/cgv.md`, que l'exploitant
 * relit en `git diff` et fait relire a un avocat. La recopier en JSX en ferait
 * une seconde source, et ce depot repete partout ce qui arrive ensuite — « un
 * domaine present a deux endroits finit toujours par diverger » (`site.ts`).
 * Une page qui annonce une duree de conservation que le document ne dit plus
 * est pire qu'une page absente : elle est opposable.
 *
 * ── LE GARDE-FOU, ET POURQUOI IL EST AUTOMATIQUE ───────────────────────────
 *
 * Ces documents sont des PROJETS. Ils portent des marqueurs `[A COMPLETER : …]`
 * la ou manquent le nom de l'exploitant, son RCCM, ou une decision commerciale
 * non tranchee. Publies tels quels, un marchand — ou l'ARTCI — lit des mentions
 * legales avec des trous dedans.
 *
 * On aurait pu poser un drapeau `publiable: true` a la main dans une liste.
 * C'est exactement le defaut que ce depot chasse : un interrupteur qu'on oublie
 * de basculer, ou qu'on bascule trop tot. LE MARQUEUR EST DONC LA SEULE SOURCE.
 * Tant qu'il en reste un, le document est un projet : bandeau visible, page en
 * noindex, absente du sitemap et du pied de page. Quand le dernier est comble,
 * la page devient publique D'ELLE-MEME, sans que personne ait a y penser.
 *
 * L'inverse est vrai aussi, et compte autant : reintroduire un marqueur — parce
 * qu'une clause redevient incertaine — retire la page de l'index sans qu'on ait
 * a s'en souvenir.
 */
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Le marqueur, ecrit SANS ACCENT dans cette expression.
 *
 * Les fichiers ecrivent « [À COMPLÉTER ». Chercher la forme accentuee ici
 * ferait dependre le garde-fou de l'encodage du fichier source au moment du
 * build — et un garde-fou qui echoue silencieusement laisse passer exactement
 * ce qu'il devait retenir. On tolere donc les deux formes.
 */
const MARQUEUR = /\[\s*(?:À|A)\s*COMPL(?:É|E)TER/i;

/**
 * La note de redaction, retiree au rendu.
 *
 * Elle est utile en `git diff` — elle dit a l'avocat ou regarder — et n'a rien
 * a faire a l'ecran. Elle est toujours en fin de fichier, precedee d'une regle
 * horizontale, et chacune de ses lignes commence par `>`.
 */
const NOTE_REDACTION = /\n---\s*\n+(?:>.*\n?)+$/;

export type DocumentLegal = {
  /** Segment d'URL : `/legal/<slug>`. */
  slug: string;
  /** Nom du fichier dans `docs/legal/`. */
  fichier: string;
  /** Titre affiche dans l'index, l'onglet et le fil d'Ariane. */
  titre: string;
  /** Une phrase pour l'index et la meta description. */
  resume: string;
};

/**
 * L'ordre est celui de la lecture, pas l'alphabetique.
 *
 * Un marchand qui arrive ici cherche d'abord ce qu'il signe (CGU), puis ce
 * qu'il paie (CGV). Les mentions legales ferment la marche : elles sont
 * obligatoires, elles ne sont pas ce qu'on vient lire.
 */
export const DOCUMENTS_LEGAUX: DocumentLegal[] = [
  {
    slug: 'cgu',
    fichier: 'cgu.md',
    titre: "Conditions générales d'utilisation",
    resume:
      "Ce que la plateforme fait, ce qu'elle ne fait pas, et les obligations "
      + 'de chacun.',
  },
  {
    slug: 'cgv',
    fichier: 'cgv.md',
    titre: 'Conditions générales de vente',
    resume:
      'Les formules, les plafonds de commandes, le prépaiement et ses remises.',
  },
  {
    slug: 'confidentialite',
    fichier: 'politique-confidentialite.md',
    titre: 'Politique de confidentialité',
    resume:
      'Les données traitées, combien de temps elles sont gardées, et vos droits.',
  },
  {
    slug: 'livreurs',
    fichier: 'politique-livreurs.md',
    titre: 'Politique livreurs',
    resume:
      'Pour les livreurs rattachés à une boutique : vos données et votre position.',
  },
  {
    slug: 'mentions',
    fichier: 'mentions-legales.md',
    titre: 'Mentions légales',
    resume: "L'éditeur du service, ses hébergeurs et ses contacts.",
  },
];

export function trouverDocument(slug: string): DocumentLegal | null {
  return DOCUMENTS_LEGAUX.find((d) => d.slug === slug) ?? null;
}

export type ContenuLegal = {
  /** Le markdown, note de redaction retiree. */
  markdown: string;
  /**
   * Faux tant qu'un marqueur `[A COMPLETER]` subsiste.
   *
   * Commande le bandeau « projet », le noindex, la presence au sitemap et le
   * lien dans le pied de page. Une seule valeur pour ces quatre decisions :
   * elles ne peuvent pas se contredire.
   */
  publiable: boolean;
  /** Nombre de marqueurs restants — sert au bandeau et aux tests. */
  marqueursRestants: number;
};

/**
 * Retire la note de redaction et compte les marqueurs.
 *
 * Separee de la lecture disque pour etre testable sans fichier.
 */
export function analyserDocument(brut: string): ContenuLegal {
  const markdown = brut.replace(NOTE_REDACTION, '\n').trimEnd();

  // `matchAll` sur une copie globale : `MARQUEUR` n'est pas globale, et lui
  // ajouter le drapeau `g` la rendrait porteuse d'un `lastIndex` partage entre
  // appels — un compteur juste une fois sur deux.
  const marqueursRestants = [
    ...markdown.matchAll(new RegExp(MARQUEUR.source, 'gi')),
  ].length;

  return {
    markdown,
    publiable: marqueursRestants === 0,
    marqueursRestants,
  };
}

/**
 * Lit un document depuis `docs/legal/`.
 *
 * `process.cwd()` est la racine du projet au build comme au rendu serveur.
 * Le fichier est resolu depuis la LISTE, jamais depuis le slug de l'URL :
 * un slug inconnu ne compose donc aucun chemin, et « ../../.env » n'est pas
 * un nom de document.
 */
export async function lireDocument(doc: DocumentLegal): Promise<ContenuLegal> {
  const chemin = path.join(process.cwd(), 'docs', 'legal', doc.fichier);
  return analyserDocument(await fs.readFile(chemin, 'utf8'));
}

/** Les documents sans marqueur : les seuls a lier et a soumettre aux moteurs. */
export async function documentsPubliables(): Promise<DocumentLegal[]> {
  const états = await Promise.all(
    DOCUMENTS_LEGAUX.map(async (doc) => ({
      doc,
      publiable: (await lireDocument(doc)).publiable,
    })),
  );
  return états.filter((e) => e.publiable).map((e) => e.doc);
}
