import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DocumentMarkdown from '@/components/legal/DocumentMarkdown';
import { DOCUMENTS_LEGAUX, lireDocument, trouverDocument } from '@/lib/legal';

/**
 * Une page par document juridique.
 *
 * LE CONTENU VIENT DU FICHIER, PAS D'ICI. `docs/legal/<fichier>.md` est la
 * source ; cette page l'habille. Modifier une clause se fait dans le document
 * que l'avocat relit, et la page suit — il n'y a pas deux textes a tenir
 * d'accord.
 *
 * LE BANDEAU ET LE NOINDEX SONT COMMANDES PAR LE FICHIER LUI-MEME. Tant qu'il
 * reste un `[A COMPLETER]`, la page s'annonce comme un projet et demande aux
 * moteurs de ne pas l'indexer. Le jour ou le dernier marqueur est comble, les
 * deux disparaissent sans que personne ait a s'en souvenir — c'est tout
 * l'interet de ne pas avoir mis un interrupteur a la main.
 */

/** Les cinq documents sont connus au build : ils sont rendus statiquement. */
export function generateStaticParams() {
  return DOCUMENTS_LEGAUX.map((doc) => ({ document: doc.slug }));
}

/** Un slug hors liste n'existe pas : pas de rendu a la demande. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const doc = trouverDocument(document);
  if (!doc) return {};

  const { publiable } = await lireDocument(doc);

  return {
    title: doc.titre,
    description: doc.resume,
    alternates: { canonical: `/legal/${doc.slug}` },
    /* UN PROJET NE S'INDEXE PAS. Une CGV incomplete qui remonte dans une
       recherche « conditions DjiguiFlow » est pire qu'absente : elle fait
       autorite sans en avoir le droit. `follow` reste vrai — les liens qu'elle
       porte vers les autres documents gardent leur sens. */
    robots: publiable ? undefined : { index: false, follow: true },
  };
}

export default async function PageDocumentLegal({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  const doc = trouverDocument(document);
  if (!doc) notFound();

  const { markdown, publiable, marqueursRestants } = await lireDocument(doc);

  return (
    <article>
      {!publiable && (
        <aside
          /* `role="note"` et pas `alert` : l'avertissement est present des le
             chargement, il n'interrompt rien. Un `alert` ferait parler le
             lecteur d'ecran par-dessus le titre de la page. */
          role="note"
          className="mb-10 border-l-2 border-bissap-500 bg-bissap-50 px-4 py-3.5"
        >
          <b className="block font-display font-semibold text-nuit-900">
            Projet — document non contractuel
          </b>
          <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-nuit-800">
            Ce texte comporte {marqueursRestants}{' '}
            {marqueursRestants > 1 ? 'mentions' : 'mention'} à compléter et n’a pas
            été relu par un conseil juridique. Il est publié ici pour relecture et
            n’engage pas DjiguiFlow.
          </p>
        </aside>
      )}

      <DocumentMarkdown markdown={markdown} />
    </article>
  );
}
