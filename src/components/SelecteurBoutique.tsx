'use client';

import { Store } from 'lucide-react';
import { useBoutique } from '@/lib/boutique';

/**
 * Barre de sélection de la boutique active.
 * Reste invisible tant qu'il n'y a rien à choisir (registre absent ou une
 * seule boutique) : le dashboard mono-boutique est inchangé visuellement.
 */
export default function SelecteurBoutique() {
  const { boutiqueId, setBoutiqueId, boutiques, pret } = useBoutique();

  if (!pret || boutiques.length < 2) return null;

  const active = boutiques.find(b => b.id === boutiqueId);

  return (
    <div className="sticky top-0 z-40 border-b border-mangue-200/70 bg-chaux-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-mangue-100 text-mangue-700">
          <Store className="h-4 w-4" />
        </span>

        <label htmlFor="selecteur-boutique" className="text-sm font-semibold text-nuit-700">
          Boutique
        </label>

        <select
          id="selecteur-boutique"
          value={boutiqueId}
          onChange={e => setBoutiqueId(e.target.value)}
          className="min-w-0 flex-1 truncate rounded-xl border border-mangue-200 bg-white px-3 py-1.5 text-sm font-semibold text-nuit-800 shadow-sm focus:border-mangue-400 focus:outline-none focus:ring-2 focus:ring-mangue-200 sm:flex-none sm:min-w-64"
        >
          <option value="">🏪 Boutique par défaut</option>
          {boutiques.map(b => (
            <option key={b.id} value={b.id}>
              {b.emoji} {b.nom}
            </option>
          ))}
        </select>

        {/* Le secteur de la boutique choisie. Pose nu, ce seul mot — « Mode »,
            « Restauration » — se lisait comme un libelle orphelin plutot que
            comme une propriete de la boutique d'a cote. */}
        {active?.secteur && (
          <span className="hidden border border-[var(--hairline)] px-2 py-1 font-mono text-xs uppercase tracking-[0.16em] text-chaux-600 sm:inline">
            {active.secteur}
          </span>
        )}
      </div>
    </div>
  );
}
