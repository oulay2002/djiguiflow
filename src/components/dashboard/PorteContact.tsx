'use client';

import { LifeBuoy } from 'lucide-react';
import { porteSupport } from '@/lib/contactSupport';

/**
 * LA PORTE PAR OÙ NOUS JOINDRE, RENDUE SANS CONDITION.
 *
 * ── CE QU'ELLE A COÛTÉ AVANT D'EXISTER ─────────────────────────────────────
 *
 * Ce bloc vivait dans `SansBoutique`, enveloppé dans
 * `{(whatsapp || telephone) && …}`. Les deux variables absentes, il
 * DISPARAISSAIT : il ne restait que « Écrivez-nous […] et nous vous
 * rappelons », sans rien à cliquer.
 *
 * Établi le 3 septembre 2026 : le commit du 30 août constate, vérifié en
 * production, que `NEXT_PUBLIC_SUPPORT_WHATSAPP` n'était posée nulle part. Les
 * deux personnes inscrites les 24 et 25 août ont donc vu un écran qui leur
 * demandait de nous écrire sans rien à cliquer. Aucune n'est revenue.
 *
 * ── POURQUOI ELLE EST SORTIE DANS SON PROPRE FICHIER ───────────────────────
 *
 * Un formulaire est venu se placer au-dessus d'elle. Le garde qui la protégeait
 * vérifiait qu'AUCUNE condition ne précédait le lien — un formulaire l'aurait
 * fait tomber, et on aurait été tenté de l'assouplir. Sortie ici, elle reste
 * gardée pour ce qu'elle est : un composant court, sans état, dont le lien
 * principal n'est enveloppé dans rien.
 *
 * ELLE NE DEVIENT JAMAIS SECONDAIRE AU POINT DE DISPARAÎTRE. Un marchand qui ne
 * veut pas remplir trois champs — ou qui n'y arrive pas — doit toujours pouvoir
 * nous joindre.
 */
export default function PorteContact({
  message,
  objet,
}: {
  /** Le message pré-écrit, qui s'affiche chez la personne et non chez nous. */
  message: string;
  /** Objet du courriel de repli. */
  objet: string;
}) {
  /**
   * `porteSupport` GARANTIT UNE PORTE — `mailto:` à défaut de WhatsApp.
   *
   * Les variables ne sont lues QUE dans cet appel : lues dans des variables
   * locales, elles redeviendraient l'interrupteur qui a fait disparaître ce
   * bloc.
   */
  const support = porteSupport({
    whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
    telephone: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
    message,
    objet,
  });

  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={support.href}
        className="inline-flex items-center gap-2 border border-[var(--hairline)] bg-chaux-50 px-4 py-3 text-sm font-semibold text-nuit-900 hover:bg-chaux-100"
      >
        <LifeBuoy aria-hidden className="h-4 w-4" />
        {support.libelle}
      </a>
      {support.telephone && (
        <a
          href={support.telephone.href}
          className="inline-flex items-center gap-2 border border-[var(--hairline)] bg-chaux-50 px-4 py-3 text-sm font-semibold text-nuit-900 hover:bg-chaux-100"
        >
          {support.telephone.affichage}
        </a>
      )}
    </div>
  );
}
