import type { ReactNode } from 'react';
import Link from 'next/link';
import { LienRetour } from '@/components/ui/Bouton';

/**
 * Le gabarit commun aux pages juridiques.
 *
 * ELLES SONT PUBLIQUES, ET C'EST NECESSAIRE. Une CGU qu'il faut etre connecte
 * pour lire n'est pas opposable : le marchand doit pouvoir la lire AVANT de
 * creer son compte, et un client final n'aura jamais de compte du tout.
 *
 * LE FOND EST BLANC, PAS INDIGO. Le reste du site pose ses bandeaux sur
 * `nuit-800` ; ici on lit dix pages de texte d'affilee. Le papier est la seule
 * surface qui tienne cette duree, et c'est aussi ce que la maison appelle la
 * chaux : les filets et les mentions secondaires en viennent.
 */
export default function LayoutLegal({ children }: { children: ReactNode }) {
  return (
    <main id="contenu" className="min-h-screen bg-chaux-50">
      <div className="border-b border-chaux-200 bg-white">
        {/*
          `flex-wrap` : le talon et le lien tiennent cote a cote a 100 %, et
          passent l'un sous l'autre des que le texte grossit. Sans lui, la
          rangee gardait sa largeur intrinseque et poussait le document a
          447 px pour une fenetre de 360 — un defilement lateral sur des pages
          qui ne sont QUE du texte long.
        */}
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <LienRetour href="/">Accueil</LienRetour>

          <Link
            href="/legal"
            className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600 transition hover:text-nuit-900"
          >
            Documents légaux
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">{children}</div>

      <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <p className="border-t border-chaux-200 pt-6 text-sm leading-relaxed text-chaux-600">
          Une question sur ces documents ?{' '}
          <a
            href="mailto:contact@djiguiflow.com"
            className="font-medium text-bissap-600 underline underline-offset-2 transition hover:text-bissap-700"
          >
            contact@djiguiflow.com
          </a>
        </p>
      </div>
    </main>
  );
}
