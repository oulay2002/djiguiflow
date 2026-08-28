import type { ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Le rendu d'un document juridique.
 *
 * POURQUOI UNE TABLE DE COMPOSANTS PLUTOT QUE `prose`. Le depot n'a pas le
 * greffon typographique de Tailwind, et l'ajouter pour cinq pages ferait
 * entrer un nuancier entier — gris, bleus, tailles — a cote d'une palette
 * maison que `scripts/palette-maison.mjs` defend precisement contre ce genre
 * d'importation. Chaque balise est donc habillee ici, avec les cinq familles
 * de la maison et rien d'autre.
 *
 * CE QUI EST DIFFERENT D'UNE PAGE DE VITRINE. Un texte juridique se PARCOURT :
 * on y cherche un article, on ne le lit pas d'un bout a l'autre. D'ou trois
 * choix qui ne viennent pas du reste du site :
 *
 *   - les titres d'article portent une ancre, pour qu'on puisse envoyer
 *     « article 6.2 » a quelqu'un plutot que « cherche dans la CGV » ;
 *   - la mesure monte a 78 caracteres au lieu des 66 de la vitrine : un
 *     tableau de tarifs a quatre colonnes ne tient pas dans une colonne de
 *     lecture, et le couper le rend illisible ;
 *   - les tableaux defilent horizontalement dans leur propre boite plutot que
 *     de pousser la page, qui ne doit jamais defiler de travers sur telephone.
 */

/** Compose une ancre stable a partir du texte d'un titre. */
function ancre(enfants: ReactNode): string | undefined {
  const texte = extraireTexte(enfants);
  if (!texte) return undefined;
  return texte
    .toLowerCase()
    .normalize('NFD')
    // Retire les diacritiques : « Résiliation » et « Resiliation » doivent
    // donner la meme ancre, sinon un lien copie hier casse demain.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || undefined;
}

function extraireTexte(noeud: ReactNode): string {
  if (typeof noeud === 'string' || typeof noeud === 'number') return String(noeud);
  if (Array.isArray(noeud)) return noeud.map(extraireTexte).join('');
  if (noeud && typeof noeud === 'object' && 'props' in noeud) {
    return extraireTexte((noeud as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

const COMPOSANTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight text-nuit-900 sm:text-4xl">
      {children}
    </h1>
  ),

  h2: ({ children }) => (
    <h2
      id={ancre(children)}
      className="mt-12 scroll-mt-24 border-t border-chaux-200 pt-8 font-display text-xl font-bold tracking-tight text-nuit-900 sm:text-2xl"
    >
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3
      id={ancre(children)}
      className="mt-8 scroll-mt-24 font-display text-lg font-semibold text-nuit-800"
    >
      {children}
    </h3>
  ),

  p: ({ children }) => (
    <p className="mt-4 max-w-[78ch] leading-relaxed text-nuit-700">{children}</p>
  ),

  ul: ({ children }) => (
    <ul className="mt-4 flex max-w-[78ch] list-disc flex-col gap-2 pl-5 leading-relaxed text-nuit-700 marker:text-chaux-400">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="mt-4 flex max-w-[78ch] list-decimal flex-col gap-2 pl-5 leading-relaxed text-nuit-700 marker:font-mono marker:text-chaux-500">
      {children}
    </ol>
  ),

  li: ({ children }) => <li className="pl-1">{children}</li>,

  strong: ({ children }) => (
    <strong className="font-semibold text-nuit-900">{children}</strong>
  ),

  em: ({ children }) => <em className="italic text-nuit-800">{children}</em>,

  /**
   * Le lien interne passe par `Link` — un `<a>` rechargerait la page entiere
   * pour aller d'une CGU a sa CGV, alors que ces documents se renvoient l'un a
   * l'autre en permanence.
   *
   * Les `.md` se lient entre eux par nom de fichier (`cgv.md`), ce qui marche
   * dans l'editeur et sur GitHub. A l'ecran, ces liens doivent viser la ROUTE.
   * La traduction se fait ici, une fois, plutot que d'imposer aux fichiers une
   * syntaxe qui ne marcherait que sur le site.
   */
  a: ({ href, children }) => {
    const cible = routeInterne(href);
    const style =
      'font-medium text-bissap-600 underline underline-offset-2 transition hover:text-bissap-700';

    if (cible) {
      return (
        <Link href={cible} className={style}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={style} rel="noreferrer noopener" target="_blank">
        {children}
      </a>
    );
  },

  /* Un tableau de tarifs a quatre colonnes ne se plie pas : il defile dans sa
     propre boite. Sans cette enveloppe, c'est la PAGE qui defile de travers,
     et sur telephone le corps du texte devient inatteignable. */
  table: ({ children }) => (
    <div className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),

  thead: ({ children }) => <thead className="bg-chaux-100">{children}</thead>,

  th: ({ children }) => (
    <th className="border border-chaux-200 px-3 py-2 font-semibold text-nuit-900">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="border border-chaux-200 px-3 py-2 align-top text-nuit-700">
      {children}
    </td>
  ),

  /**
   * La citation sert aux avertissements des documents — « À trancher avant
   * publication », « Avertissement au marchand ». Elle porte donc le filet
   * bissap : dans cette maison, c'est la couleur de ce qui demande une action.
   */
  blockquote: ({ children }) => (
    <blockquote className="mt-6 max-w-[78ch] border-l-2 border-bissap-500 bg-bissap-50 px-4 py-3 text-sm leading-relaxed text-nuit-800">
      {children}
    </blockquote>
  ),

  code: ({ children }) => (
    <code className="rounded-none bg-chaux-100 px-1 py-0.5 font-mono text-[0.85em] text-nuit-800">
      {children}
    </code>
  ),

  hr: () => <hr className="mt-10 border-t border-chaux-200" />,
};

/** `cgv.md` → `/legal/cgv`. Rend `null` pour tout lien externe ou ancre. */
function routeInterne(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith('#')) return null;
  if (/^[a-z]+:/i.test(href)) return null;

  const fichier = href.split('/').pop() ?? '';
  const correspondances: Record<string, string> = {
    'cgu.md': '/legal/cgu',
    'cgv.md': '/legal/cgv',
    'politique-confidentialite.md': '/legal/confidentialite',
    'politique-livreurs.md': '/legal/livreurs',
    'mentions-legales.md': '/legal/mentions',
  };
  return correspondances[fichier] ?? null;
}

export default function DocumentMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPOSANTS}>
      {markdown}
    </ReactMarkdown>
  );
}
