'use client';

import Link from 'next/link';
import { ShoppingBag, Store } from 'lucide-react';

/**
 * Deux portes, en haut de l'accueil.
 *
 * LE PROBLEME. Cette page vend DjiguiFlow aux commercants — metier, caisse,
 * tarifs. Un visiteur venu ACHETER y arrive sur un argumentaire, et doit
 * descendre jusqu'au bas de page pour trouver une boutique. On ne sait pas
 * lequel des deux publics arrive vraiment, et on a decide de ne pas le
 * deviner : plutot que de parier, on offre les deux portes et ON COMPTE.
 *
 * ON NE BLOQUE PAS LE PASSAGE. Ni fenetre modale, ni page intermediaire : la
 * page continue dessous, entiere. Un visiteur qui ignore les deux portes lit
 * l'accueil comme avant — et les moteurs de recherche aussi.
 *
 * LE CLIC EST COMPTE, ET C'EST TOUT L'INTERET. Sans mesure, cet aiguillage ne
 * serait qu'un ecran de plus. Dans quelques semaines, les chiffres diront s'il
 * faut basculer l'accueil vers le catalogue, le garder tourne vers les
 * marchands, ou laisser les deux portes.
 *
 * Le comptage ne retarde JAMAIS la navigation : il part sans qu'on l'attende,
 * et son echec ne se voit pas. Faire patienter un visiteur pour une
 * statistique serait le plus mauvais des echanges.
 */

const PORTES = [
  {
    cle: 'acheter',
    href: '/boutiques',
    Icone: ShoppingBag,
    titre: 'Je veux commander',
    detail: 'Voir les boutiques ouvertes près de chez vous',
  },
  {
    cle: 'vendre',
    href: '/register',
    Icone: Store,
    titre: 'J’ai un commerce',
    detail: 'Ouvrir ma boutique — 30 jours offerts',
  },
] as const;

export default function AiguillageVisiteur() {
  const compter = (porte: string) => {
    // `keepalive` : la requete survit a la navigation qui suit immediatement.
    // Sans lui, le navigateur l'annule en quittant la page et la moitie des
    // clics ne serait jamais comptee — le chiffre pencherait alors du cote de
    // ceux qui hesitent, pas de ceux qui decident.
    try {
      void fetch('/api/porte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ porte }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Le comptage est un confort d'exploitation, jamais une condition.
    }
  };

  return (
    <section aria-label="Que cherchez-vous ?" className="border-b border-[var(--hairline)] bg-chaux-100">
      <div className="mx-auto grid max-w-6xl gap-3 px-4 py-5 sm:grid-cols-2 sm:px-6">
        {PORTES.map(({ cle, href, Icone, titre, detail }) => (
          <Link
            key={cle}
            href={href}
            onClick={() => compter(cle)}
            className="group flex items-center gap-4 border border-[var(--hairline)] bg-white px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-nuit-900 soft-shadow"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--hairline)] text-nuit-700 transition group-hover:border-nuit-900 group-hover:bg-nuit-900 group-hover:text-white">
              <Icone aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold leading-tight text-nuit-900">
                {titre}
              </span>
              <span className="mt-0.5 block truncate text-sm text-chaux-600">{detail}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
