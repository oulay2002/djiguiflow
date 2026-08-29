'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LE ROBOT DU LANCEUR D'ASSISTANT.
 *
 * POURQUOI DU SVG EN LIGNE, ET RIEN D'AUTRE. Une image, un Lottie ou une scene
 * 3D auraient tous coute un telechargement supplementaire a des clients qui
 * commandent depuis un telephone sur reseau mobile ivoirien -- pour un ornement
 * de page d'accueil. Le robot est donc dessine en une trentaine de balises,
 * anime par `framer-motion` qui est DEJA une dependance de ce composant.
 *
 * LE TON EST « DISCRET ET COMPETENT », pas « mascotte ». Un marchand qui evalue
 * un outil de travail doit y voir du serieux : le robot respire, suit du regard
 * et cligne, il ne saute pas et ne fait pas de grimaces.
 *
 * MOUVEMENT REDUIT : tout se fige. `useReducedMotion` lit la meme preference
 * systeme que le bloc `@media (prefers-reduced-motion: reduce)` de
 * `globals.css`. Le robot reste parfaitement lisible immobile -- c'est la
 * condition pour qu'une animation soit un supplement et non un support
 * d'information.
 */

/** Amplitude du regard, en unites du repere SVG. Volontairement minuscule. */
const REGARD_MAX = 1.15;

export default function RobotAssistant({
  reflechit = false,
  ouvert = false,
  className = 'h-6 w-6',
}: {
  /** L'assistante compose sa reponse : l'antenne pulse. */
  reflechit?: boolean;
  /** Le panneau est ouvert : le robot se contracte, il a passe la main. */
  ouvert?: boolean;
  className?: string;
}) {
  const reduit = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [regard, setRegard] = useState({ x: 0, y: 0 });
  const [clignote, setClignote] = useState(false);

  /**
   * LE REGARD SUIT LE CURSEUR — SEULEMENT S'IL Y EN A UN.
   *
   * `pointer: coarse` designe le doigt : sur telephone il n'existe aucun
   * curseur a suivre, et `pointermove` n'y arriverait qu'au moment du toucher,
   * ce qui ferait loucher le robot une fois puis plus jamais. On s'abstient.
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
      // Normalise puis borne : au-dela de ~120 px le regard est au maximum, ce
      // qui evite que le robot louche quand le curseur traverse l'ecran.
      const n = (v: number) => Math.max(-1, Math.min(1, v / 120)) * REGARD_MAX;
      setRegard({ x: n(dx), y: n(dy) });
    };

    window.addEventListener('pointermove', suivre, { passive: true });
    return () => window.removeEventListener('pointermove', suivre);
  }, [reduit]);

  /**
   * LE CLIGNEMENT. Irregulier a dessein : un battement parfaitement periodique
   * se remarque et devient une horloge, ce qui est exactement ce qu'on ne veut
   * pas d'un element decoratif en coin d'ecran.
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

  const oeil = (cx: number) => (
    <motion.ellipse
      cx={cx}
      cy={13.4}
      rx={1.5}
      ry={1.5}
      fill="currentColor"
      animate={
        reduit
          ? undefined
          : { x: regard.x, y: regard.y, scaleY: clignote ? 0.12 : 1 }
      }
      transition={{ type: 'spring', stiffness: 220, damping: 20, mass: 0.4 }}
      style={{ transformOrigin: `${cx}px 13.4px` }}
    />
  );

  return (
    <motion.svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      // LA RESPIRATION. 1,5 % d'amplitude sur quatre secondes : on la percoit
      // sans jamais la regarder. Le robot se contracte legerement quand le
      // panneau est ouvert -- il a passe la main, il n'appelle plus.
      animate={reduit ? undefined : { scale: ouvert ? 0.94 : [1, 1.015, 1] }}
      transition={
        ouvert
          ? { type: 'spring', stiffness: 300, damping: 22 }
          : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
      }
    >
      {/* L'ANTENNE. Son point pulse pendant que l'assistante compose : c'est le
          seul signal d'attente, et il remplace le `animate-pulse` du badge. */}
      <line x1="12" y1="2.6" x2="12" y2="5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <motion.circle
        cx="12"
        cy="2.2"
        r="1.35"
        fill="currentColor"
        animate={reduit || !reflechit ? { opacity: 1 } : { opacity: [1, 0.25, 1] }}
        transition={{ duration: 1.1, repeat: reflechit ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* LA TETE. Des angles francs, comme tout le reste de la maison : la
          vitrine et le tableau de bord n'ont pas de coins arrondis. */}
      <rect
        x="3.6" y="5.4" width="16.8" height="13.2"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />

      {/* Les oreilles, qui ancrent la silhouette a petite taille. */}
      <line x1="1.4" y1="10" x2="3.6" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20.4" y1="10" x2="22.6" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

      {oeil(8.6)}
      {oeil(15.4)}

      {/* LA BOUCHE, une simple barre. Pas de sourire : le sourire fait jouet. */}
      <line x1="9" y1="16.2" x2="15" y2="16.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </motion.svg>
  );
}
