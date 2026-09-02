import { Loader2 } from 'lucide-react';

/**
 * L'ATTENTE, DITE D'UNE SEULE FAÇON.
 *
 * ── CE QU'ON A TROUVÉ EN LE MESURANT ───────────────────────────────────────
 *
 * Neuf écrans du tableau de bord affichent le même état — « je charge, ne
 * fermez pas » — et le 2 septembre 2026 ils le disaient de **quatre** façons :
 *
 *   Loader2, `text-nuit-400`        livreurs, assignations, les 3 réglages
 *   Loader2, `text-mangue-600`      analyses
 *   cercle à la main, `primary-600` accueil, clients
 *   cercle à la main, `nuit-400`    ma boutique
 *
 * Quatre apparences pour un seul état, et deux façons de dessiner un anneau
 * qui tourne alors que le produit embarque déjà `Loader2` — recopié dans douze
 * fichiers. C'est le motif que PRODUCT.md nomme dans son principe 3 : une règle
 * recopiée diverge, et ça s'est déjà payé deux fois ici.
 *
 * ── LA COULEUR N'EST PAS UN GOÛT, ET SEPT ÉCRANS SUR NEUF AVAIENT TORT ─────
 *
 * `primary-600` est un alias de `nuit-600` : ces sept-là peignaient donc leur
 * voyant en INDIGO. DESIGN.md l'interdit en toutes lettres — « n'utilisez pas
 * l'indigo comme accent, toute sa rampe échoue au plancher de chromie ; c'est
 * une couleur de structure ». Or un anneau qui tourne, seul au centre d'un
 * écran vide, est un accent par définition : c'est le seul élément qui bouge et
 * la seule chose à regarder.
 *
 * La mangue dit « commencé, pas fini ». C'est la définition même d'un
 * chargement, et c'est ce qu'affichait le seul écran qui avait raison.
 * Contraste mesuré sur le fond chaux : **3,93 : 1**, au-dessus du plancher de
 * 3 : 1 qui s'applique aux éléments graphiques.
 *
 * ── IL SE DIT AUSSI À VOIX HAUTE ───────────────────────────────────────────
 *
 * Aucune des neuf versions n'avait de nom accessible : quelqu'un au lecteur
 * d'écran arrivait sur une page qui ne disait rien et n'annonçait rien. Le
 * `role="status"` porte le mot ; l'icône est décorative et se tait, sinon elle
 * serait annoncée deux fois.
 *
 * ── ET IL CONTINUE DE TOURNER EN MOUVEMENT RÉDUIT ──────────────────────────
 *
 * DESIGN.md pose la règle générale : sous `prefers-reduced-motion`, « les
 * animations sont coupées, mais les changements de couleur restent ». Celle-ci
 * est l'exception, et elle est argumentée : la rotation EST l'information.
 * Figée, elle laisse une icône qui a l'air bloquée — on aurait retiré le seul
 * signal qui dit que quelque chose se passe. C'est aussi pourquoi le texte
 * accessible existe : il dit la même chose sans dépendre du mouvement.
 */
export default function EcranDeChargement({
  /** Ce qu'entend un lecteur d'écran. Nommer l'écran vaut mieux que « Chargement ». */
  annonce = 'Chargement…',
}: { annonce?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-[var(--background)]"
    >
      <Loader2 aria-hidden className="h-10 w-10 animate-spin text-mangue-600" />
      <span className="sr-only">{annonce}</span>
    </div>
  );
}
