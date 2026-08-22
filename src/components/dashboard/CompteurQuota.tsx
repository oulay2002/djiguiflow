'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Gauge } from 'lucide-react';
import { fetchDashboard } from '@/lib/apiClient';

type Quota = {
  planNom: string;
  inclus: number;
  utilise: number;
  restant: number;
  niveau: 'ok' | 'proche' | 'critique' | 'depasse';
  bloque: boolean;
  exempt: boolean;
  fenetreFin: string;
};

/**
 * Ou en est le marchand de son plafond de commandes.
 *
 * Sans cet ecran, il ne decouvrait le plafond qu'en le heurtant : le bot cesse
 * de prendre commande, et il ne comprend pas pourquoi. Un compteur qui monte
 * previent ; un mur, non.
 */

/**
 * Le ton porte le sens, comme ailleurs dans le produit : la mangue dit « a
 * surveiller », le bissap dit « urgence ». Un plafond atteint arrete les
 * ventes, il merite la couleur de l'urgence.
 */
const TONS = {
  ok: { barre: 'bg-accent-500', cadre: 'border-[var(--hairline)] bg-white/80', texte: 'text-chaux-600' },
  proche: { barre: 'bg-mangue-500', cadre: 'border-mangue-200 bg-mangue-50', texte: 'text-mangue-700' },
  critique: { barre: 'bg-mangue-600', cadre: 'border-mangue-300 bg-mangue-50', texte: 'text-mangue-700' },
  depasse: { barre: 'bg-bissap-500', cadre: 'border-bissap-200 bg-bissap-50', texte: 'text-bissap-700' },
} as const;

function joursRestants(fin: string): number | null {
  const t = Date.parse(fin);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function CompteurQuota() {
  const [quota, setQuota] = useState<Quota | null>(null);

  useEffect(() => {
    let monte = true;

    (async () => {
      try {
        const r = await fetchDashboard('/api/dashboard/quota');
        if (!r.ok) return;
        const d = (await r.json()) as { quota?: Quota | null };
        if (monte && d.quota) setQuota(d.quota);
      } catch {
        // Le compteur est une information, pas une garde : s'il ne charge pas,
        // on n'affiche rien plutot que d'inquieter avec un chiffre faux.
      }
    })();

    return () => {
      monte = false;
    };
  }, []);

  if (!quota) return null;

  // Tant que la consommation reste basse, ce bandeau n'apporte rien et
  // encombre l'ecran d'un marchand qui a mieux a regarder. Il n'apparait qu'a
  // partir du moment ou il devient une information utile.
  if (quota.niveau === 'ok' && !quota.exempt) return null;

  const ton = TONS[quota.niveau];
  const part = quota.inclus > 0 ? Math.min(100, Math.round((quota.utilise / quota.inclus) * 100)) : 0;
  const jours = joursRestants(quota.fenetreFin);

  return (
    <section className={` border p-5 ${ton.cadre}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-nuit-900">
            {quota.niveau === 'depasse' ? (
              <AlertTriangle className="h-4 w-4 text-bissap-600" />
            ) : (
              <Gauge className="h-4 w-4 text-chaux-500" />
            )}
            {quota.exempt
              ? 'Compte interne — sans plafond'
              : quota.bloque
                ? 'Plafond atteint : les commandes ne sont plus enregistrées'
                : 'Vous approchez de votre plafond de commandes'}
          </p>

          <p className={`mt-1 text-sm ${ton.texte}`}>
            <strong className="text-nuit-900">{quota.utilise}</strong> commande
            {quota.utilise > 1 ? 's' : ''} sur {quota.inclus} — formule {quota.planNom}
            {jours !== null && ` · remise à zéro dans ${jours} jour${jours > 1 ? 's' : ''}`}
          </p>

          <div className="mt-3 h-2 w-full max-w-md overflow-hidden bg-white/70">
            <div className={`h-full ${ton.barre}`} style={{ width: `${part}%` }} />
          </div>
        </div>

        {!quota.exempt && (
          <Link
            href="/dashboard/paiements"
            className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center gap-2 bg-bissap-500 px-5 py-2.5 text-sm font-bold text-white active:bg-bissap-600"
          >
            Augmenter mon plafond
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
