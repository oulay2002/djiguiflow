'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LE ROBOT DE L'ASSISTANT — un personnage, pas une icone.
 *
 * PREMIERE VERSION, ET POURQUOI ELLE NE SUFFISAIT PAS. Le lanceur portait un
 * robot de 24 px dans un bouton de 144 x 48 : au rendu, cela restait une icone
 * a cote d'un libelle. « Un robot anime » demande une PRESENCE, pas un
 * pictogramme mieux dessine.
 *
 * Il a donc une tete, un buste, deux bras et un socle, et il occupe ~96 px dans
 * le coin de la page. La bulle qui le surmonte est sa parole.
 *
 * TOUJOURS DU SVG EN LIGNE, ET RIEN D'AUTRE. Une image, un Lottie ou une scene
 * 3D auraient chacun coute un telechargement de plus a des clients sur reseau
 * mobile ivoirien. Le personnage entier tient en une cinquantaine de balises et
 * s'anime avec `framer-motion`, deja dependance de ce composant. Aucune
 * bibliotheque ajoutee.
 *
 * LE TON RESTE « DISCRET ET COMPETENT ». Il salue UNE fois en arrivant puis se
 * tient tranquille : il respire, suit du regard, cligne. Il ne saute pas, ne
 * danse pas, et n'appelle pas l'attention quand on ne le regarde pas.
 *
 * MOUVEMENT REDUIT : tout se fige, salut compris. Le robot reste parfaitement
 * lisible immobile — condition pour qu'une animation soit un supplement et non
 * un support d'information.
 */

/** Amplitude du regard, en unites du repere SVG (le viewBox fait 72 de large). */
const REGARD_MAX = 1.5;

export default function RobotAssistant({
  reflechit = false,
  ouvert = false,
  className = 'h-24 w-24',
}: {
  /** L'assistante compose sa reponse : l'antenne pulse. */
  reflechit?: boolean;
  /** Le panneau est ouvert : le robot se tasse, il a passe la main. */
  ouvert?: boolean;
  className?: string;
}) {
  const reduit = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [regard, setRegard] = useState({ x: 0, y: 0 });
  const [clignote, setClignote] = useState(false);
  const [salue, setSalue] = useState(false);

  /**
   * LE SALUT, UNE SEULE FOIS. Un robot qui salue en boucle devient un panneau
   * publicitaire ; celui-ci dit bonjour puis se tait. Le delai laisse la page
   * finir d'apparaitre — un salut pendant le chargement n'est vu par personne.
   */
  useEffect(() => {
    if (reduit) return;
    const t = setTimeout(() => {
      setSalue(true);
      setTimeout(() => setSalue(false), 1500);
    }, 900);
    return () => clearTimeout(t);
  }, [reduit]);

  /**
   * LE REGARD SUIT LE CURSEUR — SEULEMENT S'IL Y EN A UN.
   *
   * `pointer: coarse` designe le doigt : sur telephone il n'existe aucun
   * curseur a suivre, et `pointermove` n'arriverait qu'au moment du toucher,
   * ce qui ferait loucher le robot une fois puis plus jamais.
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
      // Bornes : au-dela de ~200 px le regard est au maximum, ce qui evite que
      // le robot louche quand le curseur traverse l'ecran.
      const n = (v: number) => Math.max(-1, Math.min(1, v / 200)) * REGARD_MAX;
      setRegard({ x: n(dx), y: n(dy) });
    };

    window.addEventListener('pointermove', suivre, { passive: true });
    return () => window.removeEventListener('pointermove', suivre);
  }, [reduit]);

  /**
   * LE CLIGNEMENT, IRREGULIER A DESSEIN. Un battement periodique se remarque et
   * devient une horloge — exactement ce qu'on ne veut pas d'un element pose en
   * coin d'ecran.
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
      cy={30}
      rx={2.6}
      ry={2.6}
      fill="currentColor"
      animate={
        reduit ? undefined : { x: regard.x, y: regard.y, scaleY: clignote ? 0.12 : 1 }
      }
      transition={{ type: 'spring', stiffness: 220, damping: 20, mass: 0.4 }}
      style={{ transformOrigin: `${cx}px 30px` }}
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
      // LA RESPIRATION. Deux pour cent sur quatre secondes : on la percoit sans
      // jamais la regarder. Le robot se tasse quand le panneau est ouvert : il a
      // passe la main, il n'appelle plus.
      animate={reduit ? undefined : { scale: ouvert ? 0.93 : [1, 1.02, 1] }}
      transition={
        ouvert
          ? { type: 'spring', stiffness: 300, damping: 22 }
          : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
      }
      style={{ transformOrigin: '36px 66px' }}
    >
      {/* ---- L'ANTENNE. Son point pulse pendant que l'assistante compose :
              c'est le seul signal d'attente. */}
      <line x1="36" y1="9" x2="36" y2="15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <motion.circle
        cx="36" cy="6.5" r="3"
        fill="currentColor"
        animate={reduit || !reflechit ? { opacity: 1 } : { opacity: [1, 0.2, 1] }}
        transition={{ duration: 1.1, repeat: reflechit ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* ---- LA TETE. Angles francs : la maison n'a pas de coins arrondis, ni
              la vitrine ni le tableau de bord. */}
      <rect x="17" y="15" width="38" height="28" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      {/* Les oreilles ancrent la silhouette. */}
      <line x1="13" y1="26" x2="17" y2="26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="55" y1="26" x2="59" y2="26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />

      {oeil(28)}
      {oeil(44)}

      {/* LA BOUCHE, une barre. Pas de sourire : le sourire fait jouet. */}
      <line x1="30" y1="37" x2="42" y2="37" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />

      {/* ---- LE COU ET LE BUSTE. */}
      <line x1="36" y1="43" x2="36" y2="47" stroke="currentColor" strokeWidth="2.4" />
      <rect x="23" y="47" width="26" height="16" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      {/* Le plastron : deux traits qui suffisent a dire « machine ». */}
      <line x1="29" y1="53" x2="43" y2="53" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      <line x1="29" y1="57.5" x2="38" y2="57.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />

      {/* ---- LE BRAS GAUCHE, au repos. */}
      <line x1="23" y1="51" x2="17" y2="58" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />

      {/* ---- LE BRAS DROIT : celui qui salue. Il pivote depuis l'epaule, jamais
              depuis le milieu du trait — un bras qui tourne sur son centre se
              detache du corps. */}
      <motion.line
        x1="49" y1="51" x2="55" y2="58"
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
        style={{ transformOrigin: '49px 51px' }}
        animate={reduit ? undefined : (salue ? { rotate: [0, -62, -42, -62, -42, 0] } : { rotate: 0 })}
        transition={{ duration: 1.5, ease: 'easeInOut', times: [0, 0.22, 0.42, 0.62, 0.82, 1] }}
      />

      {/* ---- LE SOCLE. Il pose le robot au sol : sans lui, le buste flotte. */}
      <line x1="26" y1="66" x2="46" y2="66" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </motion.svg>
  );
}
