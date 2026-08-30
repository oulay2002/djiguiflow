'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LE ROBOT DE L'ASSISTANT — une tête, cadrée comme un portrait.
 *
 * ── LES DEUX VERSIONS PRÉCÉDENTES, ET CE QU'ELLES ONT APPRIS ───────────────
 *
 * La première était un robot de 24 px dans un bouton : au rendu, une icône à
 * côté d'un libellé. « Un robot animé » demande une présence, pas un
 * pictogramme mieux dessiné.
 *
 * La seconde lui a donné un corps entier — tête, buste, deux bras, socle — dans
 * 96 px. Le corps a bien fait la présence, mais il a coûté la LISIBILITÉ : à
 * cette taille, chaque membre ne pesait plus que deux pixels de trait, et le
 * regard se posait sur une silhouette avant de trouver un visage.
 *
 * Une tête occupe le même encombrement et ne dépense ses pixels que sur ce
 * qu'on regarde vraiment. C'est le cadrage d'un portrait : le buste sort du
 * cadre par le bas plutôt que d'être absent — une tête posée dans le vide se
 * lit comme une tête coupée.
 *
 * ── LE VISAGE EST UN ÉCRAN, ET C'EST LE PROPOS ─────────────────────────────
 *
 * DjiguiFlow est un appareil qui reçoit ce qu'un client écrit et le montre au
 * marchand. Deux points sur une boîte font un jouet ; un cadre avec un panneau
 * en creux, où les yeux vivent, dit « machine qui affiche ». Le sujet dicte le
 * dessin.
 *
 * ── UN SEUL SIGNAL D'ÉTAT ──────────────────────────────────────────────────
 *
 * L'antenne pulsait pendant que l'assistante composait. Un curseur de saisie
 * qui clignote dans l'écran dit la même chose, mais il dit ce qui se passe
 * VRAIMENT : elle écrit. L'antenne redevient donc de la silhouette, immobile.
 * Deux signaux pour un état, c'est un de trop.
 *
 * ── TOUJOURS DU SVG EN LIGNE ───────────────────────────────────────────────
 *
 * Une image, un Lottie ou une scène 3D coûteraient chacun un téléchargement de
 * plus à des clients sur réseau mobile ivoirien. La tête tient en une trentaine
 * de balises et s'anime avec `framer-motion`, déjà dépendance de ce composant.
 * Aucune bibliothèque ajoutée.
 *
 * ── LE FOND N'EST PAS LE SIEN, ET C'EST VOULU ──────────────────────────────
 *
 * Le trait est en `currentColor`. Le panneau clair qui garantit son contraste
 * vit chez l'appelant — le robot a été invisible à 1,00:1 en bas de page le 29
 * août, et c'est là que la correction a été posée. Ne pas la rapatrier ici :
 * un composant qui porte son propre fond ne peut plus se poser ailleurs.
 *
 * MOUVEMENT RÉDUIT : tout se fige, hochement compris. La tête reste
 * parfaitement lisible immobile — condition pour qu'une animation soit un
 * supplément et non un support d'information.
 */

/** Amplitude du regard, en unités du repère SVG (le viewBox fait 72 de large). */
const REGARD_MAX = 1.8;

export default function RobotAssistant({
  reflechit = false,
  ouvert = false,
  className = 'h-24 w-24',
}: {
  /** L'assistante compose sa réponse : le curseur clignote dans l'écran. */
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

  /** Un œil : une pastille pleine, qui se ferme en s'écrasant. */
  const oeil = (cx: number) => (
    <motion.rect
      x={cx - 4}
      y={35.5}
      width={8}
      height={9}
      fill="currentColor"
      animate={
        reduit ? undefined : { x: regard.x, y: regard.y, scaleY: clignote ? 0.1 : 1 }
      }
      transition={{ type: 'spring', stiffness: 220, damping: 20, mass: 0.4 }}
      style={{ transformOrigin: `${cx}px 40px` }}
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
      {/* ---- L'ANTENNE. Silhouette, plus signal : c'est l'écran qui parle
              maintenant. Un carré plutôt qu'un point — la maison n'a pas de
              coins arrondis, ni la vitrine ni le tableau de bord. */}
      {/* Le pied s'arrete SUR le bord de la tete, et sans bout rond : avec
              `strokeLinecap="round"` il debordait a l'interieur et y laissait
              un point qu'on lisait comme une vis. */}
      <line x1="36" y1="10" x2="36" y2="18" stroke="currentColor" strokeWidth="2.4" />
      <rect x="33" y="4" width="6" height="6" fill="currentColor" />

      {/* ---- LA TÊTE, et rien d'autre sous elle.
              DEUX TENTATIVES DE BUSTE ONT ÉCHOUÉ, chacune d'une façon
              instructive. Un cou court sur une barre horizontale : un
              téléviseur sur son socle. Deux obliques partant d'un même point :
              un chevalet sur trépied. Deux traits qui convergent sous un cadre
              ne peuvent pas dire « épaules » — les épaules sont une masse
              large, pas deux jambages.
              Un robot muni d'une antenne est un objet COMPLET : un casque, un
              masque, une enseigne. Il n'a pas besoin d'un corps, et le panneau
              clair de l'appelant lui donne déjà son sol. On retire. */}
      <rect x="12" y="18" width="48" height="44" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />

      {/* ---- LA VISIÈRE, centrée dans la face.
              Un écran pleine face restait à moitié vide : une machine à
              afficher, pas une tête. Une bande étroite dit la même chose — un
              appareil qui lit — et laisse au-dessus et au-dessous ce qu'un
              visage a de front et de menton. */}
      <rect
        x="18" y="32" width="36" height="16"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.45"
      />

      {oeil(29)}
      {oeil(43)}

      {/* ---- LE CURSEUR DE SAISIE. Il ne paraît QUE pendant qu'elle écrit, et
              c'est le seul signal d'attente. Il dit ce qui se passe vraiment —
              elle compose — là où une antenne qui pulse ne dit rien. */}
      {reflechit && (
        <motion.rect
          x="50" y="35.5" width="2.4" height="9"
          fill="currentColor"
          animate={reduit ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear', times: [0, 0.45, 0.5, 1] }}
        />
      )}
    </motion.svg>
  );
}
