'use client';

import type { ReactNode } from 'react';
import { LifeBuoy, Store } from 'lucide-react';
import { useBoutique } from '@/lib/boutique';

/**
 * La decision, sortie du JSX pour pouvoir etre eprouvee.
 *
 * Les deux erreurs possibles n'ont pas le meme prix. Montrer l'ecran a tort le
 * montre a un marchand QUI A une boutique — il croit l'avoir perdue. Ne pas le
 * montrer laisse le nouveau devant un tableau de bord vide. On tranche donc sur
 * `pret` : tant que le registre n'a pas repondu, une liste vide ne veut rien
 * dire.
 */
export function afficherEcranSansBoutique(pret: boolean, nombreDeBoutiques: number): boolean {
  return pret && nombreDeBoutiques === 0;
}

/**
 * Ce que voit un marchand qui vient de creer son compte.
 *
 * LE TROU QU'IL COMBLE. `/register` ne cree qu'un COMPTE : la boutique est
 * provisionnee par la plateforme. Entre les deux, le marchand se connecte et
 * `mes-boutiques` lui rend `{"marchands":[]}`. `boutiqueId` reste vide, chaque
 * ecran appelle donc son API sans boutique, et l'API repond « Marchand
 * introuvable » — 404 sur les produits, les statistiques, l'onboarding.
 *
 * Verifie le 22 aout 2026 en fabriquant un vrai compte contre la production.
 *
 * Et l'echec ne se voyait NULLE PART : le tableau de bord attrape l'erreur et
 * la met dans la console. Le marchand se voyait donc accueillir par
 * « Bonjour, DjiguiFlow » — le nom de repli — au-dessus d'un ecran vide, sans
 * chiffres, sans message et sans issue. Au tout premier instant de la relation,
 * le produit avait l'air casse.
 *
 * POURQUOI ICI ET PAS DANS CHAQUE PAGE. Le manque est le meme partout, et le
 * repeter quatorze fois garantit d'en oublier une — celle qu'on ajoutera
 * demain. Ce garde est pose une fois, dans la mise en page.
 *
 * IL NE PARLE QU'APRES `pret`. Une liste vide pendant le chargement n'est pas
 * une absence de boutique : afficher ce message plus tot le montrerait a chaque
 * ouverture, a des marchands qui en ont une.
 */
export default function SansBoutique({ children }: { children: ReactNode }) {
  const { boutiques, pret } = useBoutique();

  if (!afficherEcranSansBoutique(pret, boutiques.length)) return <>{children}</>;

  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ?? '';
  const telephone = process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() ?? '';

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <section className="border border-[var(--hairline)] bg-white p-8 soft-shadow">
        <div className="flex h-12 w-12 items-center justify-center bg-chaux-100 text-nuit-700">
          <Store aria-hidden className="h-6 w-6" />
        </div>

        <h1 className="mt-5 font-display text-2xl font-black text-nuit-900">
          Votre compte est créé. Votre boutique, pas encore.
        </h1>

        {/* On dit ce qui manque ET qui doit agir. « Une erreur est survenue »
            laisse le marchand essayer de recharger la page pendant dix
            minutes ; ici il sait que la balle n'est pas dans son camp. */}
        <p className="mt-3 text-sm leading-relaxed text-chaux-600">
          Il n’y a rien à réparer de votre côté : c’est nous qui ouvrons votre
          boutique, avec vous. Une fois qu’elle existe, ce tableau de bord se
          remplit tout seul — commandes, articles, livreurs.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-chaux-600">
          Écrivez-nous le nom de votre commerce et la zone que vous livrez, et
          nous vous rappelons.
        </p>

        {(whatsapp || telephone) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}
                className="inline-flex items-center gap-2 bg-bissap-500 px-4 py-3 text-sm font-semibold text-white soft-shadow hover:bg-bissap-600"
              >
                <LifeBuoy aria-hidden className="h-4 w-4" />
                Nous écrire sur WhatsApp
              </a>
            )}
            {telephone && (
              <a
                href={`tel:${telephone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-2 border border-[var(--hairline)] bg-chaux-50 px-4 py-3 text-sm font-semibold text-nuit-900 hover:bg-chaux-100"
              >
                {telephone}
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
