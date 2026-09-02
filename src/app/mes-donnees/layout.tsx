import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * LE TITRE D'UN ÉCRAN DE DROITS N'EST PAS UN SLOGAN.
 *
 * ── CE QUI ÉTAIT ANNONCÉ ───────────────────────────────────────────────────
 *
 * `/mes-donnees` est un composant client : il ne peut pas exporter de
 * `metadata`, et rien n'en portait pour lui. La route héritait donc du titre
 * par défaut de la coque — **« DjiguiFlow — vos commandes tournent sans
 * vous »**, mesuré dans le navigateur le 2 septembre 2026.
 *
 * C'est la première chose qu'un lecteur d'écran prononce en arrivant, et c'est
 * une phrase de vente. Quelqu'un qui ouvre cet écran vient exercer un droit :
 * lui vendre le produit au moment où il demande ce qu'on détient sur lui est
 * le pire endroit du site pour le faire. C'est aussi ce que porte l'onglet
 * qu'il gardera ouvert pendant qu'il réfléchit.
 *
 * Le gabarit de la coque (`%s — DjiguiFlow`) fait le reste : un titre suffit.
 *
 * ── PAS D'INDEXATION, ET CE N'EST PAS DE LA PRUDENCE ───────────────────────
 *
 * L'adresse porte une référence de commande et son jeton. Un lien partagé,
 * copié dans une conversation ou suivi par un robot ne doit jamais entrer dans
 * un index : ce serait publier la porte du dossier d'une personne. Le jeton la
 * protège déjà ; l'indexation la rendrait trouvable, ce qui n'est pas la même
 * question.
 */
export const metadata: Metadata = {
  title: 'Vos données',
  description:
    'Voyez ce que DjiguiFlow détient à votre sujet, pourquoi, et pendant combien '
    + 'de temps. Vous pouvez en demander l’effacement.',
  robots: { index: false, follow: false },
};

export default function LayoutMesDonnees({ children }: { children: ReactNode }) {
  return children;
}
