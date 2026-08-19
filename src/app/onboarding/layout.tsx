'use client';

import type { ReactNode } from 'react';
import { BoutiqueProvider } from '@/lib/boutique';
import SelecteurBoutique from '@/components/SelecteurBoutique';

/**
 * Le branchement se fait TOUJOURS sur une enseigne nommee.
 *
 * Cette page vivait hors du fournisseur de boutique, donc sans selecteur : elle
 * branchait « la boutique par defaut » sans jamais dire laquelle. Le 19 aout
 * 2026, un marchand y a saisi le jeton Telegram, le groupe de livreurs et
 * l'identifiant du gerant de sa DEUXIEME enseigne — tout est parti chez la
 * premiere. Le groupe de livreurs de la boutique en service a ete ecrase, ses
 * livreurs ne recevaient plus rien, et le nouveau bot repondait aux clients
 * avec le catalogue de l'autre.
 *
 * Le selecteur reste invisible tant qu'il n'y a qu'une boutique : le marchand
 * qui n'en a qu'une ne voit aucun changement.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <BoutiqueProvider>
      <SelecteurBoutique />
      {children}
    </BoutiqueProvider>
  );
}
