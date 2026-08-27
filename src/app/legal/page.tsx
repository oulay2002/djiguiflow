import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DOCUMENTS_LEGAUX, lireDocument } from '@/lib/legal';

/**
 * L'index des documents juridiques.
 *
 * IL LIT L'ETAT REEL DE CHAQUE FICHIER. Un document encore incomplet s'affiche
 * ici avec sa mention « projet », mais il s'affiche : c'est cette page que
 * l'exploitant envoie a son avocat, et masquer les projets la rendrait
 * inutilisable au moment precis ou elle sert.
 *
 * Ce que le marqueur commande vraiment, c'est le PIED DE PAGE du site et le
 * SITEMAP — les deux endroits ou un marchand ou un moteur tombe dessus sans
 * l'avoir cherche.
 */

export const metadata: Metadata = {
  title: 'Documents légaux',
  description:
    'Conditions d’utilisation et de vente, politique de confidentialité, '
    + 'politique livreurs et mentions légales de DjiguiFlow.',
};

export default async function PageLegal() {
  const documents = await Promise.all(
    DOCUMENTS_LEGAUX.map(async (doc) => ({
      ...doc,
      ...(await lireDocument(doc)),
    })),
  );

  const projets = documents.filter((d) => !d.publiable).length;

  return (
    <>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-nuit-900 sm:text-4xl">
        Documents légaux
      </h1>

      <p className="mt-4 max-w-[66ch] leading-relaxed text-nuit-700">
        Ce que vous acceptez en utilisant DjiguiFlow, ce que vous payez, et ce que
        nous faisons des données qui passent par la plateforme.
      </p>

      {projets > 0 && (
        /* LE COMPTE EST DIT, PAS SEULEMENT L'ETAT. « Certains documents sont des
           projets » se lit comme une precaution de style ; « quatre documents sur
           cinq » se lit comme un travail a finir. */
        <p className="mt-6 border-l-2 border-bissap-500 bg-bissap-50 px-4 py-3 text-sm leading-relaxed text-nuit-800">
          <b className="font-semibold">
            {projets === documents.length
              ? `Ces ${documents.length} documents sont des projets.`
              : `${projets} de ces ${documents.length} documents sont des projets.`}
          </b>{' '}
          Ils comportent encore des mentions à compléter et n’ont pas été relus par
          un conseil juridique. Ils ne sont pas contractuels en l’état.
        </p>
      )}

      <ul className="mt-10 flex flex-col">
        {documents.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="group flex items-start justify-between gap-6 border-t border-chaux-200 bg-white px-5 py-5 transition hover:bg-chaux-100"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <b className="font-display text-lg font-semibold text-nuit-900">
                    {doc.titre}
                  </b>
                  {!doc.publiable && (
                    <span className="border border-bissap-200 bg-bissap-50 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-bissap-600">
                      Projet
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block max-w-[60ch] text-sm leading-snug text-chaux-600">
                  {doc.resume}
                </span>
              </span>

              <ArrowRight
                className="mt-1 size-5 shrink-0 text-chaux-400 transition group-hover:translate-x-0.5 group-hover:text-nuit-900"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 border-t border-chaux-200 pt-6 text-sm leading-relaxed text-chaux-600">
        DjiguiFlow est un outil technique. Les ventes que vous concluez avec vos
        clients ne nous lient pas : la plateforme n’encaisse jamais leur paiement.
      </p>
    </>
  );
}
