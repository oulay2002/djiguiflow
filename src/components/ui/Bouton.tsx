'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Jeu de boutons « indigo & ticket ».
 *
 * Chaque variante porte un role du systeme, pas une nuance decorative :
 *  - action    : bissap, la couleur du prix et de l'urgence. Un seul par ecran.
 *  - calme     : surface chaux sur filet, pour les gestes secondaires.
 *  - fantome   : sans surface, pour les gestes de service (fermer, annuler).
 *  - contraste : action posee sur une surface teintee (bandeau de page).
 *  - voile     : secondaire sur surface teintee.
 *
 * Les deux dernieres existent parce qu'un bouton bissap jurerait sur un
 * bandeau colore : c'est la surface qui decide, pas le geste.
 */
export type VarianteBouton = 'action' | 'calme' | 'fantome' | 'contraste' | 'voile';
export type TailleBouton = 'sm' | 'md';

/**
 * La silhouette. UNE SEULE, DESORMAIS.
 *
 * CE QUI ETAIT ECRIT ICI, ET POURQUOI CA A CHANGE. « Le tableau de bord est un
 * outil : ses boutons sont des pilules ; la vitrine est un imprime et n'a pas
 * un seul angle arrondi. » Deux langues, donc, et une seule tenue : le 22 aout
 * 2026, la vitrine, l'onboarding, le suivi et le guide ne portaient AUCUN
 * arrondi, quand le tableau de bord en comptait NEUF — `lg`, `xl`, `2xl`,
 * `3xl`, `full`, plus quatre valeurs ecrites a la main espacees de 0,25 rem.
 * Personne ne voit la difference entre 1,5 et 1,75 rem ; tout le monde sent
 * qu'aucune n'a ete choisie. C'est la signature d'un reglage iteratif, et
 * c'est exactement ce qui fait dire « c'est genere ».
 *
 * `pilule` A ETE SUPPRIMEE, PAS DEPRECIEE. Aucun appel ne la demandait :
 * elle ne survivait que comme valeur par defaut, et c'est ainsi que neuf
 * rayons etaient revenus. Le parametre reste, a un seul membre — un futur
 * `forme="pilule"` ne compile plus, et le seul endroit ou une seconde
 * geometrie peut naitre est ce fichier.
 *
 * LE CERCLE N'EST PAS UN ARRONDI, C'EST UNE FORME — mais la maison n'en
 * garde que DEUX, et il faut les nommer :
 *   - le rouet de chargement, qui tourne ;
 *   - le talon de `LienRetour`, dont le bord droit arrondi EST la silhouette
 *     du ticket qu'on arrache.
 *
 * Rien d'autre. J'avais d'abord ecrit ici qu'« un avatar reste rond, un point
 * qui pulse reste rond ». C'etait faux : le seul precedent de la maison est le
 * `Voyant` de l'onboarding, dont le point est CARRE, et la vitrine affiche le
 * logo d'une boutique dans une tuile carree la ou le tableau de bord en
 * faisait un cercle de 8 rem. Une pilule d'etat, une barre de progression, une
 * pastille de rang et un cadre de logo sont carres.
 */
export type FormeBouton = 'carree';

const SOCLE =
  'inline-flex items-center justify-center gap-2 font-semibold ' +
  'transition duration-150 active:translate-y-px ' +
  // 45 % et pas 55 : au-dessus, le bissap reste trop vif pour se lire
  // comme un bouton inactif.
  'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none';

const VARIANTES: Record<VarianteBouton, string> = {
  /**
   * UNE SEULE OMBRE DANS LA MAISON, celle declaree par `.soft-shadow`.
   *
   * Il y avait ici une ombre bissap diffuse, censee imiter « l'encre qui bave
   * sous un tampon appuye ». Sous une pilule, elle passait. Sous l'angle vif
   * du 22 aout 2026, elle ne bave plus : elle AUREOLE — un halo rouge flou
   * autour d'une arete nette, ce qu'aucun tampon ne fait.
   *
   * L'action se distingue par sa COULEUR, pas par une lueur. Le bissap sur la
   * chaux n'a besoin de rien de plus.
   */
  action: 'bg-bissap-500 text-white soft-shadow hover:bg-bissap-600',
  calme: 'border border-[var(--hairline)] bg-white text-nuit-700 hover:bg-white',
  fantome: 'text-nuit-600 hover:bg-nuit-50 hover:text-nuit-900',
  contraste: 'bg-white text-nuit-800 soft-shadow hover:bg-chaux-50',
  voile: 'border border-white/25 bg-white/15 text-white hover:bg-white/25',
};

const TAILLES: Record<TailleBouton, string> = {
  sm: 'min-h-9 px-3.5 text-xs',
  // 44 px de haut : le marchand pilote depuis son telephone, la cible doit
  // se toucher au pouce sans viser.
  md: 'min-h-11 px-5 text-sm',
};

const FORMES: Record<FormeBouton, string> = {
  carree: 'rounded-none',
};

export function classesBouton(
  variante: VarianteBouton = 'action',
  taille: TailleBouton = 'md',
  forme: FormeBouton = 'carree',
): string {
  return `${SOCLE} ${FORMES[forme]} ${VARIANTES[variante]} ${TAILLES[taille]}`;
}

type ProprietesBouton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBouton;
  taille?: TailleBouton;
  forme?: FormeBouton;
  /** Affiche le rouet et neutralise le bouton pendant l'envoi. */
  chargement?: boolean;
};

export function Bouton({
  variante = 'action',
  taille = 'md',
  forme = 'carree',
  chargement = false,
  className = '',
  disabled,
  children,
  ...reste
}: ProprietesBouton) {
  return (
    <button
      {...reste}
      disabled={disabled || chargement}
      aria-busy={chargement || undefined}
      className={`${classesBouton(variante, taille, forme)} ${className}`}
    >
      {chargement && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Le talon detachable : bouton de retour.
 *
 * Dans le monde du bon de commande, on ne « revient » pas — on arrache le
 * talon. D'ou la silhouette : bord gauche plat et perfore (classe `.stub`),
 * bord droit arrondi, et le decollement au survol.
 */
export function LienRetour({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      /* LE PAPIER EST OPAQUE, ET C'EST LE CORRECTIF.
         `bg-white` marchait sur fond clair. Les douze pages qui posent ce
         talon le posent sur le bandeau INDIGO : a 80 % d'opacite il y virait
         au gris sale, et la perforation en pointilles — qui EST le motif —
         devenait invisible. Un talon qu'on ne reconnait pas est une pilule.
         Le papier plein se detache du bandeau et rend ses pointilles. */
      className="stub group inline-flex min-h-10 items-center gap-2 rounded-r-full bg-chaux-50 py-2 pl-4 pr-5 text-sm font-semibold text-nuit-700 hover:bg-white hover:text-nuit-900"
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}
