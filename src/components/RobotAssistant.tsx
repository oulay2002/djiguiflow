'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LE ROBOT DE L'ASSISTANT — une tête, sans plaque sous elle.
 *
 * ── POURQUOI LA PLAQUE A DISPARU, ET CE QUI LA REMPLACE ────────────────────
 *
 * Il a d'abord été une icône de 24 px, puis un personnage entier, puis une tête
 * anguleuse en fil de fer posée sur un panneau clair. Ce panneau n'était pas un
 * choix esthétique : il rattrapait un défaut. Le trait était en `currentColor`,
 * donc d'UNE seule valeur — et un élément fixe traverse des fonds qui changent.
 * Sur le pied de page sombre, il tombait à 1,00:1 : exactement la couleur de
 * son fond, donc invisible.
 *
 * La tête porte désormais SES DEUX VALEURS : corps clair, visière et contour
 * sombres. Sur le fond clair du corps de page, ce sont le contour et la visière
 * qui la détachent ; sur le pied de page sombre, c'est le corps clair. Aucun
 * fond ne peut plus l'avaler — non par réglage, mais par construction.
 *
 * C'est la bonne façon de fermer ce défaut : une seule valeur exige un support,
 * deux valeurs se suffisent.
 *
 * ── LES ANGLES SONT ARRONDIS ICI, ET NULLE PART AILLEURS ───────────────────
 *
 * La maison n'a pas un seul coin arrondi : ni les boutons, ni les cartes, ni
 * les champs. La règle vaut pour les BLOCS D'INTERFACE — ce sont des contenants,
 * et leur franchise fait la tenue de l'ensemble.
 *
 * Une tête n'est pas un contenant, c'est un personnage. Anguleuse, elle se
 * lisait comme un écran de plus dans une page qui n'en manque pas. La règle ne
 * s'applique donc pas ici, et c'est un écart assumé, pas un oubli.
 *
 * ── LES COULEURS VIENNENT DES VARIABLES, PAS DE CLASSES ────────────────────
 *
 * Une classe utilitaire écrite ici et nulle part ailleurs serait purgée à la
 * compilation, et la tête sortirait sans couleur — c'est le défaut des classes
 * mortes, déjà payé. Les variables de `globals.css` n'ont pas ce risque.
 *
 * Le point d'antenne est le SEUL accent de la figure : le bissap de la maison,
 * et il ne sert qu'une fois.
 *
 * ── TOUJOURS DU SVG EN LIGNE ───────────────────────────────────────────────
 *
 * Une image, un Lottie ou une scène 3D coûteraient chacun un téléchargement de
 * plus à des clients sur réseau mobile ivoirien. La tête tient en une quinzaine
 * de balises et s'anime avec `framer-motion`, déjà dépendance de ce composant.
 * Aucune bibliothèque ajoutée.
 *
 * MOUVEMENT RÉDUIT : tout se fige, hochement compris. La tête reste
 * parfaitement lisible immobile — condition pour qu'une animation soit un
 * supplément et non un support d'information.
 */

/** Amplitude du regard, en unités du repère SVG (le viewBox fait 72 de large). */
const REGARD_MAX = 2;

const CLAIR = 'var(--color-chaux-50)';
const SOMBRE = 'var(--color-nuit-900)';
const ACCENT = 'var(--color-bissap-500)';

export default function RobotAssistant({
  reflechit = false,
  ouvert = false,
  className = 'h-24 w-24',
}: {
  /** L'assistante compose sa réponse : un curseur clignote dans la visière. */
  reflechit?: boolean;
  /** Le panneau est ouvert : la tête se retire un peu, elle a passé la main. */
  ouvert?: boolean;
  className?: string;
}) {
  const reduit = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [regard, setRegard] = useState({ x: 0, y: 0 });
  const [clignote, setClignote] = useState(false);
  const [salue, setSalue] = useState(false);

  /**
   * LE HOCHEMENT, UNE SEULE FOIS.
   *
   * Une tête qui salue en boucle devient un panneau publicitaire ; celle-ci dit
   * bonjour puis se tait. Le délai laisse la page finir d'apparaître — un
   * bonjour pendant le chargement n'est vu par personne.
   */
  useEffect(() => {
    if (reduit) return;
    const t = setTimeout(() => {
      setSalue(true);
      setTimeout(() => setSalue(false), 1100);
    }, 900);
    return () => clearTimeout(t);
  }, [reduit]);

  /**
   * LE REGARD SUIT LE CURSEUR — SEULEMENT S'IL Y EN A UN.
   *
   * `pointer: coarse` désigne le doigt : sur téléphone il n'existe aucun
   * curseur à suivre, et `pointermove` n'arriverait qu'au moment du toucher,
   * ce qui ferait loucher la tête une fois puis plus jamais.
   */
  useEffect(() => {
    if (reduit) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const suivre = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const b = el.getBoundingClientRect();
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      // Bornes : au-delà de ~200 px le regard est au maximum, ce qui évite que
      // la tête louche quand le curseur traverse l'écran.
      const n = (v: number) => Math.max(-1, Math.min(1, v / 200)) * REGARD_MAX;
      setRegard({ x: n(dx), y: n(dy) });
    };

    window.addEventListener('pointermove', suivre, { passive: true });
    return () => window.removeEventListener('pointermove', suivre);
  }, [reduit]);

  /**
   * LE CLIGNEMENT, IRRÉGULIER À DESSEIN. Un battement périodique se remarque et
   * devient une horloge — exactement ce qu'on ne veut pas d'un élément posé en
   * coin d'écran.
   */
  useEffect(() => {
    if (reduit) return;
    let t: ReturnType<typeof setTimeout>;
    const programmer = () => {
      t = setTimeout(() => {
        setClignote(true);
        setTimeout(() => setClignote(false), 130);
        programmer();
      }, 4200 + Math.random() * 4200);
    };
    programmer();
    return () => clearTimeout(t);
  }, [reduit]);

  /** Un œil : une pastille claire sur la visière, qui se ferme en s'écrasant. */
  const oeil = (cx: number) => (
    <motion.circle
      cx={cx}
      cy={38}
      r={4.2}
      fill={CLAIR}
      animate={
        reduit ? undefined : { x: regard.x, y: regard.y, scaleY: clignote ? 0.1 : 1 }
      }
      transition={{ type: 'spring', stiffness: 220, damping: 20, mass: 0.4 }}
      style={{ transformOrigin: `${cx}px 38px` }}
    />
  );

  return (
    <motion.svg
      ref={ref}
      viewBox="0 0 72 72"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      /**
       * LA RESPIRATION ET LE HOCHEMENT PARTAGENT LE MÊME MOUVEMENT.
       *
       * Deux pour cent sur quatre secondes : on la perçoit sans jamais la
       * regarder. Le hochement l'interrompt une fois, puis elle reprend. La
       * tête se retire quand le panneau est ouvert : elle a passé la main,
       * elle n'appelle plus.
       */
      animate={
        reduit
          ? undefined
          : ouvert
            ? { scale: 0.92, y: 0, rotate: 0 }
            : salue
              ? { scale: 1, y: [0, 3.5, 0, 2, 0], rotate: [0, 3, 0, 1.5, 0] }
              : { scale: [1, 1.02, 1], y: 0, rotate: 0 }
      }
      transition={
        ouvert
          ? { type: 'spring', stiffness: 300, damping: 22 }
          : salue
            ? { duration: 1.1, ease: 'easeInOut', times: [0, 0.25, 0.5, 0.75, 1] }
            : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
      }
      style={{ transformOrigin: '36px 62px' }}
    >
      {/* ---- L'ANTENNE. Le pied s'arrête SUR le bord de la tête, et sans bout
              rond : il débordait à l'intérieur et y laissait un point qu'on
              lisait comme une vis. */}
      <line x1="36" y1="11" x2="36" y2="21" stroke={SOMBRE} strokeWidth="2.6" />
      <circle cx="36" cy="8" r="4" fill={ACCENT} />

      {/* ---- LES OREILLES, posées AVANT la tête pour passer derrière elle.
              Elles ancrent la silhouette : sans elles, une tête arrondie seule
              se lit comme une bulle de conversation. */}
      <rect x="4" y="33" width="8" height="15" rx="4" fill={SOMBRE} />
      <rect x="60" y="33" width="8" height="15" rx="4" fill={SOMBRE} />

      {/* ---- LA TÊTE. Corps CLAIR, contour SOMBRE : c'est ce couple qui la rend
              lisible sur le fond clair de la page comme sur le pied de page
              sombre, sans aucune plaque sous elle. */}
      <rect
        x="9" y="19" width="54" height="44" rx="19"
        fill={CLAIR} stroke={SOMBRE} strokeWidth="2.6"
      />

      {/* ---- LA VISIÈRE. Pleine et sombre : c'est elle qui fait l'appareil, et
              c'est sur elle que le regard s'allume. */}
      <rect x="17" y="28" width="38" height="20" rx="10" fill={SOMBRE} />

      {oeil(29)}
      {oeil(43)}

      {/* ---- LE CURSEUR DE SAISIE. Il ne paraît QUE pendant qu'elle écrit, et
              c'est le seul signal d'attente. Il dit ce qui se passe vraiment —
              elle compose — là où une antenne qui clignote ne dit rien. */}
      {reflechit && (
        <motion.rect
          x="49" y="34.5" width="2.2" height="7" rx="1.1"
          fill={CLAIR}
          animate={reduit ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear', times: [0, 0.45, 0.5, 1] }}
        />
      )}
    </motion.svg>
  );
}
