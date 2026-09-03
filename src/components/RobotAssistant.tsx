'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * LE ROBOT DE L'ASSISTANT — un casque sombre, un visage-écran qui sourit.
 *
 * ── LA TÊTE PORTE TOUJOURS SES DEUX VALEURS ────────────────────────────────
 *
 * C'est la seule règle qu'il ne faut jamais assouplir ici. Le robot est un
 * élément FIXE : il traverse des fonds qui changent au défilement. Quand son
 * trait était en `currentColor`, donc d'UNE seule valeur, il tombait à 1,00:1
 * sur le pied de page sombre — exactement la couleur de son fond, invisible.
 *
 * Les deux valeurs sont :
 *   - le casque `nuit-800`, qui le détache du corps de page clair — 15,7:1 ;
 *   - l'écran `lagune-400`, qui le détache du pied de page sombre — 9,4:1.
 *
 * Aucun fond ne peut l'avaler, non par réglage mais par construction. Si un
 * jour l'un des deux disparaît, le défaut revient — et il ne se verra pas
 * depuis un poste de développement, seulement en bas d'une vraie page.
 *
 * ── LA MATIÈRE EST UNE COUCHE, JAMAIS UNE COULEUR ──────────────────────────
 *
 * Le volume, les reflets et la lueur sont obtenus en posant du BLANC ou du
 * NOIR en opacité par-dessus les aplats. Aucune teinte nouvelle n'est déclarée
 * pour cette tête, et c'est délibéré, pour trois raisons :
 *
 *   1. `lagune` n'a qu'un niveau, et la maison tient à sa palette courte : y
 *      ajouter des paliers pour un seul dessin la diluerait ;
 *   2. le garde de palette ne lit que les classes Tailwind — un hex écrit ici
 *      passerait la CI en silence ;
 *   3. surtout : LES DEUX VALEURS RESTENT PORTÉES PAR LES APLATS DE BASE. Une
 *      couche translucide éclaircit ou assombrit, elle ne remplace pas. Le
 *      contraste de survie ne dépend donc jamais d'un dégradé.
 *
 * ── L'ÉCART À LA CHARTE EST ASSUMÉ, ET C'EST LE SECOND ─────────────────────
 *
 * La maison est à 0 dégradé, 0 flou, 0 ombre, et n'a pas un seul coin arrondi.
 * Ces règles valent pour les BLOCS D'INTERFACE — ce sont des contenants, et
 * leur franchise fait la tenue de l'ensemble.
 *
 * Une tête n'est ni un contenant ni un bloc : c'est un personnage. Elle avait
 * déjà ses angles arrondis pour cette raison ; elle a désormais sa matière pour
 * la même. Écart assumé, borné à ce fichier, et qui ne doit jamais servir de
 * précédent pour une carte ou un bouton.
 *
 * ── LA VIE INATTENDUE, ET POURQUOI ELLE EST RARE ───────────────────────────
 *
 * Trois comportements sortent de l'ordinaire : des satellites qui gravitent,
 * un glyphe qui traverse l'écran à la place du visage, et une brève rupture de
 * signal. Ils ont tous la même règle : ILS SE FONT ATTENDRE.
 *
 * Le hochement de bienvenue avait déjà établi le principe — « une tête qui
 * salue en boucle devient un panneau publicitaire ». Une surprise qu'on peut
 * prévoir n'est plus une surprise, c'est une animation d'attente ; et sur un
 * élément posé en coin d'écran, elle devient vite un objet qu'on cesse de
 * regarder. D'où des intervalles longs ET irréguliers.
 *
 * ── TOUJOURS DU SVG EN LIGNE ───────────────────────────────────────────────
 *
 * Une image, un Lottie ou une scène 3D coûteraient chacun un téléchargement de
 * plus à des clients sur réseau mobile ivoirien. Tout ce qui suit — matière,
 * lueur, satellites, rupture — est du SVG et du `framer-motion`, déjà présents.
 * Le poids réseau de cette tête reste exactement de zéro octet.
 *
 * MOUVEMENT RÉDUIT : tout se fige, hochement et vie inattendue compris. La tête
 * reste parfaitement lisible immobile — condition pour qu'une animation soit un
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

/**
 * LES GLYPHES QUI TRAVERSENT L'ÉCRAN.
 *
 * Ils ne disent RIEN d'utile, et c'est voulu : un pictogramme porteur de sens
 * apparu au hasard se lirait comme une notification, et on chercherait ce qu'il
 * annonce. Ceux-ci sont des signes de vie, pas des messages.
 */
const GLYPHES = [
  // Un cœur, tracé plein.
  'M36 50c-6-4.2-9.5-7.2-9.5-10.8a4.6 4.6 0 0 1 9.5-2 4.6 4.6 0 0 1 9.5 2C45.5 42.8 42 45.8 36 50Z',
  // Un éclair.
  'M38.5 33 28 43h6.5L33.5 51 44 41h-6.5L38.5 33Z',
  // Une étoile à quatre branches.
  'M36 32c1.2 5 2.8 6.6 7.8 7.8-5 1.2-6.6 2.8-7.8 7.8-1.2-5-2.8-6.6-7.8-7.8 5-1.2 6.6-2.8 7.8-7.8Z',
];

/**
 * LES SATELLITES : angle de départ, rayon, durée de tour, taille.
 *
 * ⚠ LE RAYON EST BORNÉ PAR LE CADRE, ET LA PREMIÈRE VERSION L'A OUBLIÉ. Le
 * repère fait 72 de côté et le centre de rotation est en (36, 40) : au-delà de
 * 30, le point sort par le bas du `viewBox` et le SVG l'écrête — on voyait
 * alors des demi-points collés au bord. Trois orbites CIRCULAIRES, donc, et non
 * elliptiques : composer une rotation et un aplatissement sur le même élément
 * ne donne pas une ellipse mais un mouvement faux, ce qui était le vrai défaut.
 *
 * Des durées volontairement sans rapport simple entre elles : trois orbites
 * synchrones se liraient comme un chargeur, pas comme de la vie.
 */
const SATELLITES = [
  { depart: 0, rayon: 29, duree: 14, r: 1.5 },
  { depart: 130, rayon: 25, duree: 19, r: 1.1 },
  { depart: 245, rayon: 30, duree: 24, r: 1.3 },
];

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

  /**
   * UN IDENTIFIANT PAR INSTANCE, ET C'EST INDISPENSABLE.
   *
   * Les dégradés d'un SVG se référencent par `url(#id)`, dans un espace de noms
   * GLOBAL au document. Deux robots sur une même page — un dans l'en-tête, un
   * dans le panneau — partageraient leurs couches, et la seconde tête irait
   * chercher les dégradés de la première. Le défaut ne se voit qu'à deux.
   */
  const uid = useId().replace(/:/g, '');
  const id = (nom: string) => `${nom}-${uid}`;

  const [regard, setRegard] = useState({ x: 0, y: 0 });
  const [clignote, setClignote] = useState(false);
  const [salue, setSalue] = useState(false);
  const [glyphe, setGlyphe] = useState<string | null>(null);
  const [rupture, setRupture] = useState(false);

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

  /**
   * LE GLYPHE FUGITIF — la surprise principale, et la plus rare.
   *
   * Entre 14 et 32 secondes : assez long pour qu'on ne l'attende pas, assez
   * court pour qu'un visiteur qui lit la page en voie un. Il ne se déclenche
   * JAMAIS pendant que l'assistante réfléchit ni quand le panneau est ouvert :
   * à ces moments-là le visage porte une information, et la couvrir d'un signe
   * décoratif dirait quelque chose de faux.
   */
  useEffect(() => {
    if (reduit || reflechit || ouvert) return;
    let t: ReturnType<typeof setTimeout>;
    const programmer = () => {
      t = setTimeout(() => {
        setGlyphe(GLYPHES[Math.floor(Math.random() * GLYPHES.length)]);
        setTimeout(() => setGlyphe(null), 780);
        programmer();
      }, 14000 + Math.random() * 18000);
    };
    programmer();
    return () => clearTimeout(t);
  }, [reduit, reflechit, ouvert]);

  /**
   * LA RUPTURE DE SIGNAL — brève, et deux fois plus rare que le glyphe.
   *
   * L'écran se décale et se recompose, comme un signal qui accroche. C'est le
   * seul moment où la tête paraît être un APPAREIL plutôt qu'un visage, et
   * c'est pour cela qu'elle doit rester exceptionnelle : répétée, elle ne dirait
   * plus « objet vivant » mais « affichage cassé ».
   */
  useEffect(() => {
    if (reduit || ouvert) return;
    let t: ReturnType<typeof setTimeout>;
    const programmer = () => {
      t = setTimeout(() => {
        setRupture(true);
        setTimeout(() => setRupture(false), 220);
        programmer();
      }, 26000 + Math.random() * 30000);
    };
    programmer();
    return () => clearTimeout(t);
  }, [reduit, ouvert]);

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

  /** Le visage cède la place au glyphe, jamais l'inverse : une chose à la fois. */
  const visageVisible = !glyphe;

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
      <defs>
        {/* ---- LE VOLUME DU CASQUE. Blanc en haut, noir en bas, transparent au
                milieu : la lumière tombe d'en haut, comme partout ailleurs sur
                la page. Les opacités sont basses — au-delà, le casque cesse
                d'être `nuit-800` et sa valeur de survie dérive. */}
        <linearGradient id={id('volumeCasque')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.20" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>

        {/* ---- LA LUEUR DE L'ÉCRAN, plus vive au centre-haut : une dalle
                rétroéclairée n'est jamais uniforme. */}
        <radialGradient id={id('lueurEcran')} cx="0.5" cy="0.34" r="0.72">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
        </radialGradient>

        {/* ---- LE BALAYAGE. Une bande claire oblique qui traverse la dalle.
                ⚠ LES DEUX EXTREMITES DOIVENT S'ETEINDRE TOT. Avec des arrets a
                0 / 50 / 100 %, le bord du rectangle restait visible : on lisait
                une COUTURE verticale au milieu de l'ecran, pas de la lumiere.
                La bande s'eteint desormais bien avant ses propres bords. */}
        {/* ⚠ HORIZONTAL, ET SURTOUT PAS OBLIQUE. Un axe oblique sur un
                rectangle fait passer ses COINS hors de l'intervalle 0-1, et
                `spreadMethod` y prolonge alors la derniere couleur : le bord du
                rectangle cesse d'etre a zero et devient VISIBLE. On lisait une
                barre verticale nette traversant l'ecran de haut en bas — une
                couture, exactement ce que ce degrade doit eviter. Avec un axe
                horizontal, les lignes d'egale valeur sont verticales et les deux
                bords valent exactement zero. */}
        <linearGradient id={id('balayage')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="30%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.30" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        {/* ---- LES FLANCS DU CASQUE. Un degrade vertical seul aplatit : il dit
                « une lumiere vient d'en haut », pas « cet objet est rond ». Deux
                plans sombres sur les cotes lui donnent sa rondeur. */}
        <linearGradient id={id('flancs')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0.34" />
          <stop offset="26%" stopColor="#000" stopOpacity="0" />
          <stop offset="74%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.30" />
        </linearGradient>

        {/* ---- L'ENCASTREMENT. Une dalle posee A PLAT sur le casque ressemble a
                un autocollant. Une ombre courte sous le bord superieur suffit a
                la faire passer DERRIERE la matiere. */}
        <linearGradient id={id('encastrement')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.30" />
          <stop offset="22%" stopColor="#000" stopOpacity="0" />
        </linearGradient>

        {/* ---- LE REFLET DE VERRE. Une dalle vitree renvoie le ciel : un arc
                clair en haut, coupe net en bas, comme une surface polie. */}
        <linearGradient id={id('verre')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.06" />
        </linearGradient>

        {/* ---- Le volume des oreillettes, même logique que le casque. */}
        <linearGradient id={id('volumeOreille')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.24" />
        </linearGradient>

        {/* ---- Tout ce qui vit DANS la dalle y reste enfermé : sans ce
                découpage, le balayage déborderait sur le casque et la tête
                aurait l'air fendue. */}
        <clipPath id={id('dalle')}>
          <rect x="15.5" y="24" width="41" height="31" rx="12.5" />
        </clipPath>
      </defs>

      {/* ---- LES SATELLITES, posés en premier pour passer DERRIÈRE la tête.
              Ils gravitent sur des ellipses de tailles et de vitesses
              différentes : trois orbites synchrones se liraient comme un
              chargeur, pas comme de la vie. */}
      {!reduit && !ouvert && SATELLITES.map((s) => (
        <motion.g
          key={s.depart}
          animate={{ rotate: [s.depart, s.depart + 360] }}
          transition={{ duration: s.duree, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '36px 40px' }}
        >
          <motion.circle
            cx={36 + s.rayon}
            cy={40}
            r={s.r}
            fill={ECRAN}
            // Ils s'allument et s'éteignent le long du parcours : un point d'une
            // opacité constante se lit comme une poussière sur l'écran.
            animate={{ opacity: [0.12, 0.5, 0.12] }}
            transition={{ duration: s.duree / 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.g>
      ))}

      {/* ---- LES OREILLETTES, posées AVANT le casque pour passer derrière lui.
              Elles ancrent la silhouette : sans elles, une tête arrondie seule
              se lit comme une bulle de conversation.

              COURTES ET ÉPAISSES, ET C'EST MESURÉ. Elles ont d'abord fait 9 de
              large sur 21 de haut : rendues à l'image, elles se lisaient comme
              des oreilles de lapin. Plus larges que hautes de peu, et inclinées
              de 22°, elles redeviennent ce qu'elles doivent être — un casque. */}
      <g transform="rotate(-22 14.5 18)">
        <rect x="9" y="10" width="11" height="16" rx="5.5" fill={OREILLE} />
        <rect x="9" y="10" width="11" height="16" rx="5.5" fill={`url(#${id('volumeOreille')})`} />
      </g>
      <g transform="rotate(22 57.5 18)">
        <rect x="52" y="10" width="11" height="16" rx="5.5" fill={OREILLE} />
        <rect x="52" y="10" width="11" height="16" rx="5.5" fill={`url(#${id('volumeOreille')})`} />
      </g>

      {/* ---- LE CASQUE. Première des deux valeurs : c'est lui qui détache la
              tête du fond clair du corps de page. L'aplat porte la valeur, la
              couche au-dessus ne fait que sculpter. */}
      <rect x="8" y="17" width="56" height="47" rx="17" fill={CASQUE} />
      <rect x="8" y="17" width="56" height="47" rx="17" fill={`url(#${id('volumeCasque')})`} />
      <rect x="8" y="17" width="56" height="47" rx="17" fill={`url(#${id('flancs')})`} />

      {/* ---- L'ARÊTE. Un trait clair sur le bord supérieur, très fin : c'est ce
              qui fait qu'un objet paraît avoir une épaisseur plutôt qu'être une
              découpe. Il s'arrête aux tempes — une arête qui ferait tout le tour
              transformerait le casque en bouton.

              ⚠ ELLE DOIT ÉPOUSER LE BORD, PAS FLOTTER DESSOUS. Première
              version : `M 15 27 Q 36 18.5 57 27`, à un trait et demi
              d'épaisseur. Vue en gros plan sur fond neutre, elle ne se lisait
              pas comme une arête mais comme une ANSE — un serre-tête posé sur
              la tête. Remontée contre le bord, affinée, et raccourcie aux
              tempes : elle redevient ce qu'elle doit être, la lumière qui
              accroche le haut d'un volume. */}
      <path
        d="M 17.5 24.5 Q 36 17.2 54.5 24.5"
        stroke="#fff"
        strokeOpacity="0.26"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />

      {/* ---- L'ÉCRAN. Seconde des deux valeurs : c'est lui qui détache la tête
              du pied de page sombre, là où le casque seul disparaîtrait.

              AUCUNE LUEUR AUTOUR. Une a été essayée — un rectangle translucide
              débordant l'écran. Elle ne se lisait pas comme de la lumière mais
              comme un cerclage gris-bleu, et à 48 px elle salissait le visage.
              L'écran pose donc directement sur le casque, et toute sa lumière
              lui reste INTÉRIEURE. */}
      <motion.g
        animate={reduit ? undefined : { x: rupture ? [0, -1.6, 1.2, 0] : 0 }}
        transition={{ duration: 0.22, ease: 'linear' }}
      >
        <rect x="15.5" y="24" width="41" height="31" rx="12.5" fill={ECRAN} />
        <rect x="15.5" y="24" width="41" height="31" rx="12.5" fill={`url(#${id('lueurEcran')})`} />

        <g clipPath={`url(#${id('dalle')})`}>
          {/* L'ombre d'encastrement, et le reflet de verre : la dalle est prise
              DANS le casque, et sa surface renvoie la lumière. Les deux sont
              découpés par la dalle, donc ils ne débordent jamais. */}
          <rect x="15.5" y="24" width="41" height="31" fill={`url(#${id('encastrement')})`} />
          <path
            d="M 15.5 24 H 56.5 V 33 Q 36 41 15.5 33 Z"
            fill={`url(#${id('verre')})`}
          />

          {/* Le balayage : long, lent, et espacé. Il passe, on ne l'attend pas.
              Plus large que la dalle : ses extrémités s'éteignent hors champ,
              et on ne voit jamais son bord entrer ni sortir. */}
          {!reduit && (
            <motion.rect
              x="-34" y="24" width="34" height="31"
              fill={`url(#${id('balayage')})`}
              animate={{ x: [-34, 60] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 7.5, ease: 'easeInOut' }}
            />
          )}

          {/* La ligne de rupture : elle ne vit que le temps de l'accroc. */}
          {rupture && !reduit && (
            <motion.rect
              x="15.5" width="41" height="2.4"
              fill="#fff" fillOpacity="0.5"
              initial={{ y: 24 }}
              animate={{ y: 53 }}
              transition={{ duration: 0.22, ease: 'linear' }}
            />
          )}
        </g>

        {/* ---- LE VISAGE. Il cède la place au glyphe, jamais l'inverse. */}
        {visageVisible && (
          <>
            {oeil(28)}
            {oeil(44)}

            {/* ---- LE SOURIRE, et ce qui le remplace pendant qu'elle écrit.
                    Trois points valent mieux qu'un curseur : c'est le signal
                    d'attente que tout le monde connaît, et il est ici à sa
                    place — sur un écran. Le sourire s'efface pendant ce temps :
                    on ne sourit pas en réfléchissant, et le visage dit alors ce
                    qui se passe vraiment. */}
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
                // Le sourire suit le regard, mais deux fois moins que les yeux :
                // un visage dont toutes les pieces bougent d'un bloc se lit
                // comme un autocollant qu'on deplace, pas comme un regard.
                animate={reduit ? undefined : { x: regard.x * 0.45, y: regard.y * 0.45 }}
                transition={ressort}
              />
            )}
          </>
        )}

        {/* ---- LE GLYPHE FUGITIF. Il apparaît en se dilatant, disparaît en se
                contractant : posé sans transition, il se lirait comme un
                changement d'état, pas comme un passage. */}
        {glyphe && !reduit && (
          <motion.path
            d={glyphe}
            fill={TRAIT}
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.55, 1.06, 1, 0.8] }}
            transition={{ duration: 0.78, times: [0, 0.22, 0.7, 1], ease: 'easeOut' }}
            style={{ transformOrigin: '36px 40px' }}
          />
        )}
      </motion.g>
    </motion.svg>
  );
}
