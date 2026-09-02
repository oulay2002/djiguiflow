'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import Link from 'next/link';
import { fetchDashboard } from '@/lib/apiClient';
import {
  Bike,
  CalendarDays,
  Globe2,
  RefreshCw,
  Send,
  ShoppingCart,
  Smartphone,
  Star,
  Trophy,
  Wallet,
} from 'lucide-react';

type Stats = {
  caTotal: number; caJour: number; nbCommandes: number; nbJour: number;
  livrees: number; enCours: number; parCanal: Record<string, number>;
  noteMoyenne: number; nbNotes: number; topPlats: [string, number][];
};

const canalMeta: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  whatsapp: { label: 'WhatsApp', icon: Smartphone },
  telegram: { label: 'Telegram', icon: Send },
  app: { label: 'Application', icon: Globe2 },
};

export default function Page() {
  const [s, setS] = useState<Stats | null>(null);
  const [maj, setMaj] = useState('');

  const { boutiqueId, boutiques, pret } = useBoutique();
  // Le titre etait fige sur « Zahara » : la page affichait les chiffres de la
  // boutique choisie sous le nom d'une autre. Sur une plateforme multi-marchand,
  // c'est le genre d'ecart qui fait douter de tout le reste.
  const nomBoutique = boutiques.find((b) => b.id === boutiqueId)?.nom ?? 'ma boutique';

  const charger = async () => {
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/stats', boutiqueId));
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setS(d);
      setMaj(new Date().toLocaleTimeString('fr-FR'));
    } catch (e) {
      console.error('Chargement des statistiques :', e);
    }
  };
  useEffect(() => { if (pret) charger(); }, [pret, boutiqueId]);

  const totalCanal = s ? Object.values(s.parCanal).reduce((a, b) => a + b, 0) || 1 : 1;
  const maxPlat = s && s.topPlats.length ? s.topPlats[0][1] : 1;

  const kpis = s ? [
    { label: 'CA total', value: `${s.caTotal.toLocaleString('fr-FR')} F`, sub: 'depuis le début', icon: Wallet, accent: 'bg-mangue-100 text-mangue-700' },
    { label: 'CA du jour', value: `${s.caJour.toLocaleString('fr-FR')} F`, sub: `${s.nbJour} commande(s) aujourd'hui`, icon: CalendarDays, accent: 'bg-nuit-100 text-nuit-700' },
    { label: 'Commandes', value: String(s.nbCommandes), sub: `${s.enCours} en cours`, icon: ShoppingCart, accent: 'bg-nuit-100 text-nuit-700' },
    { label: 'Livrées', value: String(s.livrees), sub: 'cycles terminés', icon: Bike, accent: 'bg-accent-100 text-accent-700' },
  ] : [];

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <main id="contenu" className="min-w-0 space-y-6">
          <header className="indigo-weave relative overflow-hidden bg-nuit-900 p-6 text-chaux-50 soft-shadow">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-mangue-100">Pilotage · données réelles</p>
                <h1 className="mt-2 font-display text-3xl font-black">Pilotage · {nomBoutique}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/dashboard/analytics"
                  className="flex items-center gap-2 border border-white/25 min-h-11 px-4 py-2 text-sm font-semibold transition hover:bg-white/15"
                >
                  Détail par période
                </Link>
                <button onClick={charger} className="flex items-center gap-2 bg-white/15 min-h-11 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                  <RefreshCw className="h-4 w-4" /> Actualiser
                </button>
              </div>
            </div>
            {/* IL DISAIT « source : Google Sheets », ET C'ETAIT FAUX depuis le
                decouplage : `/api/dashboard/stats` lit `commandes`,
                `commande_items`, `produits`, `paniers` et `boutiques` dans
                Supabase, et ne touche aucune feuille.

                Sur l'ecran des CHIFFRES, la provenance n'est pas un detail :
                c'est ce qu'un marchand regarde quand un total le surprend. Le
                meme mensonge trainait en tete de l'ecran Produits, corrige le
                meme jour. */}
            {maj && <p className="relative z-10 mt-3 text-xs text-mangue-100">Dernière mise à jour : {maj}</p>}
          </header>

          {!s ? <p className="p-10 text-center text-chaux-600">Chargement…</p> : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.map(k => {
                  const Icon = k.icon;
                  return (
                    <div key={k.label} className=" border border-[var(--hairline)] bg-white p-5 soft-shadow">
                      <div className={`flex h-12 w-12 items-center justify-center ${k.accent}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-sm text-chaux-600">{k.label}</p>
                      <p className="mt-1 text-3xl font-black text-nuit-900">{k.value}</p>
                      <p className="mt-1 text-xs text-chaux-600">{k.sub}</p>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-3">
                <div className=" border border-[var(--hairline)] bg-white p-6 soft-shadow">
                  <p className="text-sm text-chaux-600">Satisfaction client</p>
                  <div className="mt-3 flex items-end gap-3">
                    <p className="text-5xl font-black text-nuit-900">{s.noteMoyenne ? s.noteMoyenne.toFixed(1) : '—'}</p>
                    <p className="pb-1 text-sm text-chaux-600">/ 5 · {s.nbNotes} avis</p>
                  </div>
                  <div className="mt-4 flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className={`h-6 w-6 ${i <= Math.round(s.noteMoyenne) ? 'fill-mangue-400 text-mangue-400' : 'text-nuit-200'}`} />
                    ))}
                  </div>
                </div>

                <div className=" border border-[var(--hairline)] bg-white p-6 soft-shadow xl:col-span-2">
                  <h2 className="text-xl font-black text-nuit-900">Répartition par canal</h2>
                  <div className="mt-5 space-y-4">
                    {Object.entries(s.parCanal).map(([canal, nb]) => {
                      const m = canalMeta[canal] || { label: canal, icon: Globe2 };
                      const Icon = m.icon;
                      const pct = Math.round((nb / totalCanal) * 100);
                      return (
                        <div key={canal}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 font-semibold text-nuit-800"><Icon className="h-4 w-4 text-chaux-600" aria-hidden />{m.label}</span>
                            <span className="font-bold text-nuit-800">{nb} · {pct}%</span>
                          </div>
                          <div className="mt-2 h-3 overflow-hidden bg-chaux-100">
                            <div className="h-full bg-bissap-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className=" border border-[var(--hairline)] bg-white p-6 soft-shadow">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-mangue-600" />
                  <h2 className="text-xl font-black text-nuit-900">Plats stars</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {s.topPlats.map(([nom, q], i) => (
                    <div key={nom} className="flex items-center gap-4">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center text-sm font-black ${i === 0 ? 'bg-mangue-400 text-white' : i === 1 ? 'bg-chaux-300 text-nuit-700' : i === 2 ? 'bg-mangue-200 text-mangue-700' : 'bg-chaux-100 text-chaux-600'}`}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-nuit-800">{nom}</span>
                          <span className="font-bold text-chaux-600">{q} vendu{q > 1 ? 's' : ''}</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden bg-chaux-100">
                          <div className="h-full bg-mangue-500" style={{ width: `${Math.round((q / maxPlat) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}