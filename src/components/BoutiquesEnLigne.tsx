'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Enseigne } from '@/components/ui/Enseigne';

type Boutique = {
  id: string;
  nom: string;
  secteur: string;
  emoji: string;
  zone?: string;
  logo?: string;
};

/**
 * Les boutiques réellement présentes sur la plateforme.
 *
 * Volontairement en plein contraste et cliquable, pas en filigrane : une
 * enseigne estompée se lit comme un décor, une enseigne qu'on peut ouvrir
 * se lit comme une preuve. La liste se remplit d'elle-même à chaque
 * marchand provisionné, sans retoucher cette page.
 *
 * Ne rend rien tant que le registre n'a rien renvoyé : mieux vaut pas de
 * section qu'une section vide sur la page d'accueil.
 */
export default function BoutiquesEnLigne() {
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await fetch('/api/marchands');
        const d = await r.json();
        if (!annule && Array.isArray(d?.marchands)) setBoutiques(d.marchands);
      } catch {
        // Le registre est injoignable : la page d'accueil reste entière.
      }
    })();
    return () => { annule = true; };
  }, []);

  if (boutiques.length === 0) return null;

  return (
    <section className="py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-chaux-600">
          déjà sur DjiguiFlow
        </p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl font-black leading-tight text-nuit-900 sm:text-4xl">
          Leurs boutiques tournent déjà. Vous pouvez commander chez eux maintenant.
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boutiques.map((b) => (
            <Link
              key={b.id}
              href={`/boutiques/${b.id}`}
              className="group flex items-center gap-4 rounded-sm border border-[var(--hairline)] bg-white p-4 transition duration-200 soft-shadow hover:-translate-y-0.5"
            >
              <Enseigne
                nom={b.nom}
                emoji={b.emoji}
                logo={b.logo}
                className="h-14 w-14 rounded-sm text-2xl"
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg font-bold leading-tight text-nuit-900">
                  {b.nom}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] uppercase tracking-[0.16em] text-chaux-600">
                  {b.secteur}
                  {b.zone && ` · ${b.zone}`}
                </span>
              </span>

              <ArrowUpRight className="h-5 w-5 shrink-0 text-chaux-400 transition group-hover:text-bissap-500" />
            </Link>
          ))}

          {/* L'emplacement libre vaut mieux qu'une liste gonflée : il dit que
              la place est ouverte au lieu de masquer qu'elle l'est. */}
          <Link
            href="/register"
            className="group flex items-center gap-4 rounded-sm border border-dashed border-chaux-300 p-4 transition hover:border-bissap-400 hover:bg-white/50"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border border-dashed border-chaux-300 text-chaux-600 transition group-hover:border-bissap-300 group-hover:text-bissap-500">
              <Plus className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold leading-tight text-nuit-800">
                Votre enseigne ici
              </span>
              <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-chaux-600">
                30 jours offerts
              </span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
