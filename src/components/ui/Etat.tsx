import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Vocabulaire d'etats « indigo & ticket ».
 *
 * Les couleurs du systeme ont un sens metier, pas une valeur decorative.
 * Un ecran qui invente son propre bleu ou son propre violet fait perdre au
 * lecteur le seul reperage fiable qu'il a : la couleur dit ou en est la
 * commande.
 *
 *  - urgent  : bissap. Demande un geste maintenant (a assigner, echec).
 *  - encours : mangue. Commence, pas fini (en livraison, en preparation).
 *  - fait    : feuille. Confirme, livre, encaisse, disponible.
 *  - neutre  : nuit. Totaux, structure, informations sans etat.
 *  - eteint  : chaux. Inactif, indisponible, desactive.
 */
export type Ton = 'urgent' | 'encours' | 'fait' | 'neutre' | 'eteint';

type Jeu = { pastille: string; texte: string; surface: string; filet: string };

export const TONS: Record<Ton, Jeu> = {
  urgent: {
    pastille: 'bg-bissap-100 text-bissap-600',
    texte: 'text-bissap-600',
    surface: 'bg-bissap-50',
    filet: 'border-bissap-200',
  },
  encours: {
    pastille: 'bg-mangue-100 text-mangue-700',
    texte: 'text-mangue-700',
    surface: 'bg-mangue-50',
    filet: 'border-mangue-200',
  },
  fait: {
    pastille: 'bg-accent-100 text-accent-700',
    texte: 'text-accent-700',
    surface: 'bg-accent-50',
    filet: 'border-accent-200',
  },
  neutre: {
    pastille: 'bg-nuit-100 text-nuit-700',
    texte: 'text-nuit-700',
    surface: 'bg-nuit-50',
    filet: 'border-nuit-200',
  },
  eteint: {
    pastille: 'bg-chaux-100 text-chaux-600',
    texte: 'text-chaux-600',
    surface: 'bg-chaux-50',
    filet: 'border-chaux-200',
  },
};

/** Etiquette d'etat : la pastille qu'on lit d'un coup d'oeil dans une liste. */
export function Etiquette({
  ton = 'neutre',
  children,
  className = '',
}: {
  ton?: Ton;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ${TONS[ton].pastille} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Tuile de comptage.
 *
 * Le chiffre est en mono : c'est une donnee, elle doit s'aligner d'une tuile
 * a l'autre et ne pas danser quand elle change.
 */
export function TuileStat({
  icone: Icone,
  intitule,
  valeur,
  unite,
  ton = 'neutre',
}: {
  icone: LucideIcon;
  intitule: string;
  valeur: number | string;
  /** Detachee du nombre : « 29 500 FCFA » se coupait en deux au milieu
   *  du montant. C'est le chiffre qu'on lit, pas la devise. */
  unite?: string;
  ton?: Ton;
}) {
  return (
    <div className=" border border-[var(--hairline)] bg-white/75 p-4 soft-shadow">
      {/* Le chiffre est en haut, l'intitule en dessous : c'est le chiffre
          qu'on compare d'une tuile a l'autre, il doit rester sur la meme
          ligne quelle que soit la longueur de l'intitule. */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-3xl font-bold leading-none text-nuit-900">
          {valeur}
          {unite && <span className="ml-1 text-sm font-semibold text-chaux-600">{unite}</span>}
        </p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center ${TONS[ton].pastille}`}
        >
          <Icone className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-chaux-600">
        {intitule}
      </p>
    </div>
  );
}
