'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LE ROBOT DE L'ASSISTANT — un casque sombre, un visage-écran qui sourit.
 *
 * ── CE QUI A CHANGÉ, ET CE QUI NE DEVAIT SURTOUT PAS CHANGER ───────────────
 *
 * La tête précédente était claire, avec une visière sombre et une antenne. La
 * nouvelle inverse les valeurs : casque sombre, écran lumineux. Le dessin est
 * neuf ; la contrainte qui l'a fait naître ne l'est pas.
 *
 * ── LA TÊTE PORTE TOUJOURS SES DEUX VALEURS ────────────────────────────────
 *
 * C'est la seule règle qu'il ne faut jamais assouplir ici. Le robot est un
 * élément FIXE : il traverse des fonds qui changent au défilement. Quand son
 * trait était en `currentColor`, donc d'UNE seule valeur, il tombait à 1,00:1
 * sur le pied de page sombre — exactement la couleur de son fond, invisible.
 *
 * Les deux valeurs sont désormais :
 *   - le casque `nuit-800`, qui le détache du corps de page clair — 15,7:1 ;
 *   - l'écran `lagune-400`, qui le détache du pied de page sombre — 9,4:1.
 *
 * Aucun fond ne peut l'avaler, non par réglage mais par construction. Si un
 * jour l'un des deux disparaît, le défaut revient — et il ne se verra pas
 * depuis un poste de développement, seulement en bas d'une vraie page.
 *
 * ── LE CYAN EST DE LA LUMIÈRE, PAS UNE COULEUR DE MARQUE ───────────────────
 *
 * `lagune` n'existe que pour cet écran. Elle ne doit jamais servir à un bouton,
 * un lien ou un état : bissap, feuille et mangue tiennent déjà ces rôles, et
 * une sixième famille qui se mettrait à porter du sens diluerait les cinq
 * autres. Ici elle ne dit qu'une chose, littérale : cette surface est allumée.
 *
 * ── LES ANGLES SONT ARRONDIS ICI, ET NULLE PART AILLEURS ───────────────────
 *
 * La maison n'a pas un seul coin arrondi : ni les boutons, ni les cartes, ni
 * les champs. La règle vaut pour les BLOCS D'INTERFACE — ce sont des
 * contenants, et leur franchise fait la tenue de l'ensemble.
 *
 * Une tête n'est pas un contenant, c'est un personnage. Écart assumé, pas
 * oubli.
 *
 * ── LES COULEURS VIENNENT DES VARIABLES, PAS DE CLASSES NI DE HEX ──────────
 *
 * Une classe utilitaire écrite ici et nulle part ailleurs serait purgée à la
 * compilation, et la tête sortirait sans couleur — le défaut des classes
 * mortes, déjà payé. Un hex écrit en dur, lui, échapperait au garde de palette
 * qui ne lit que les classes Tailwind : il passerait la CI en silence et
 * personne ne saurait qu'une couleur hors maison s'est installée.
 *
 * ── TOUJOURS DU SVG EN LIGNE ───────────────────────────────────────────────
 *
 * Une image, un Lottie ou une scène 3D coûteraient chacun un téléchargement de
 * plus à des clients sur réseau mobile ivoirien. La tête tient en une quinzaine
 * de balises et s'anime avec `framer-motion`, déjà dépendance.
 *
 * MOUVEMENT RÉDUIT : tout se fige, hochement compris. La tête reste
 * parfaitement lisible immobile — condition pour qu'une animation soit un
 * supplément et non un support d'information.
 */

/** Amplitude du regard, en unités du repère SVG (le viewBox fait 72 de large). */
const REGARD_MAX = 2;

/** Le casque. Première des deux valeurs : il porte la tête sur fond clair. */
const CASQUE = 'var(--color-nuit-800)';
/** L'écran allumé. Seconde valeur : il porte la tête sur fond sombre. */
const ECRAN = 'var(--color-lagune-400)';
/** Yeux et sourire, tracés SUR l'écran — 9,4:1, le visage reste net. */
const TRAIT = 'var(--color-nuit-900)';
/** Les oreillettes. Seul accent de la figure, et il ne sert qu'ici. */
const OREILLE = 'var(--color-bissap-500)';

export default function RobotAssistant({
  reflechit = false,
  ouvert = false,
  className = 'h-24 w-24',
}: {
  /** L'assistante compose sa réponse : le sourire cède la place à trois points. */
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

  const ressort = { type: 'spring' as const, stiffness: 220, damping: 20, mass: 0.4 };

  /** Un œil : une pastille sombre sur l'écran, qui se ferme en s'écrasant. */
  const oeil = (cx: number) => (
    <motion.circle
      cx={cx}
      cy={37}
      r={4.8}
      fill={TRAIT}
      animate={
        reduit ? undefined : { x: regard.x, y: regard.y, scaleY: clignote ? 0.1 : 1 }
      }
      transition={ressort}
      style={{ transformOrigin: `${cx}px 37px` }}
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
      {/* ---- LES OREILLETTES, posées AVANT le casque pour passer derrière lui.
              Elles ancrent la silhouette : sans elles, une tête arrondie seule
              se lit comme une bulle de conversation.

              COURTES ET ÉPAISSES, ET C'EST MESURÉ. Elles ont d'abord fait 9 de
              large sur 21 de haut : rendues à l'image, elles se lisaient comme
              des oreilles de lapin. Plus larges que hautes de peu, et inclinées
              de 22°, elles redeviennent ce qu'elles doivent être — un casque. */}
      <rect
        x="9" y="10" width="11" height="16" rx="5.5"
        fill={OREILLE} transform="rotate(-22 14.5 18)"
      />
      <rect
        x="52" y="10" width="11" height="16" rx="5.5"
        fill={OREILLE} transform="rotate(22 57.5 18)"
      />

      {/* ---- LE CASQUE. Première des deux valeurs : c'est lui qui détache la
              tête du fond clair du corps de page. */}
      <rect x="8" y="17" width="56" height="47" rx="17" fill={CASQUE} />

      {/* ---- L'ÉCRAN. Seconde des deux valeurs : c'est lui qui détache la tête
              du pied de page sombre, là où le casque seul disparaîtrait.

              AUCUNE LUEUR AUTOUR. Une a été essayée — un rectangle translucide
              débordant l'écran. Elle ne se lisait pas comme de la lumière mais
              comme un cerclage gris-bleu, et à 48 px elle salissait le visage.
              L'écran pose donc directement sur le casque. */}
      <rect x="15.5" y="24" width="41" height="31" rx="12.5" fill={ECRAN} />

      {oeil(28)}
      {oeil(44)}

      {/* ---- LE SOURIRE, et ce qui le remplace pendant qu'elle écrit.
              Trois points valent mieux qu'un curseur : c'est le signal d'attente
              que tout le monde connaît, et il est ici à sa place — sur un
              écran. Le sourire s'efface pendant ce temps : on ne sourit pas en
              réfléchissant, et le visage dit alors ce qui se passe vraiment. */}
      {reflechit ? (
        [30, 36, 42].map((cx, i) => (
          <motion.circle
            key={cx}
            cx={cx} cy={46.5} r={1.9}
            fill={TRAIT}
            animate={reduit ? { opacity: 1 } : { opacity: [0.25, 1, 0.25] }}
            transition={
              reduit
                ? undefined
                : { duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }
            }
          />
        ))
      ) : (
        <motion.path
          d="M 28.5 45 Q 36 51 43.5 45"
          stroke={TRAIT}
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          // Le sourire suit le regard, mais deux fois moins que les yeux : un
          // visage dont toutes les pieces bougent d'un bloc se lit comme un
          // autocollant qu'on deplace, pas comme un regard.
          animate={reduit ? undefined : { x: regard.x * 0.45, y: regard.y * 0.45 }}
          transition={ressort}
        />
      )}
    </motion.svg>
  );
}
