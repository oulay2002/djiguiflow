'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { fetchDashboard } from '@/lib/apiClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Bell, Globe2, Package2, Send, ShoppingCart, Smartphone, Star,
  Trophy, Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CompteurQuota from '@/components/dashboard/CompteurQuota';

type Stats = {
  caTotal: number; caJour: number; nbCommandes: number; nbJour: number;
  livrees: number; enCours: number; parCanal: Record<string, number>;
  noteMoyenne: number; nbNotes: number; topPlats: [string, number][];
  serie7j: { jour: string; ca: number; nb: number }[];
  produitsVendus: number; panierMoyen: number;
};

const canalMeta: Record<string, { label: string; icon: ComponentType<{ className?: string }>; txt: string; bar: string }> = {
  whatsapp: { label: 'WhatsApp', icon: Smartphone, txt: 'text-accent-700', bar: 'bg-accent-500' },
  telegram: { label: 'Telegram', icon: Send, txt: 'text-nuit-700', bar: 'bg-nuit-500' },
  app: { label: 'Application', icon: Globe2, txt: 'text-mangue-700', bar: 'bg-mangue-500' },
};

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [s, setS] = useState<Stats | null>(null);
  const { boutiqueId, boutiques, pret } = useBoutique();
  const nomBoutique = boutiques.find(b => b.id === boutiqueId)?.nom ?? 'DjiguiFlow';

  useEffect(() => {
    if (!pret) return;
    let isMounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (!user) { router.push('/login'); return; }
      try {
        const r = await fetchDashboard(avecBoutique('/api/dashboard/stats', boutiqueId));
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        if (isMounted) setS(d);
      } catch (e) {
        console.error('Chargement des statistiques :', e);
      }
      if (isMounted) setLoading(false);
    })();
    return () => { isMounted = false; };
  }, [router, pret, boutiqueId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f4ec]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  const serie = s?.serie7j ?? [];
  const W = 640, H = 240, P = 36;
  const max = Math.max(...serie.map(x => x.ca), 1);
  const pts = serie.map((x, i) => [
    P + (i * (W - 2 * P)) / Math.max(serie.length - 1, 1),
    H - P - (x.ca / max) * (H - 2 * P),
  ]);
  const line = pts.reduce((acc, p, i, a) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const cx = (a[i - 1][0] + p[0]) / 2;
    return `${acc} C${cx},${a[i - 1][1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }, '');
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H - P} L${pts[0][0]},${H - P} Z` : '';
  const totalCanal = s ? Object.values(s.parCanal).reduce((a, b) => a + b, 0) || 1 : 1;

  const kpis = s ? [
    { label: 'Ventes du jour', value: `${s.caJour.toLocaleString('fr-FR')} F`, sub: `${s.nbJour} commande(s) aujourd'hui`, icon: Wallet, accent: 'bg-mangue-100 text-mangue-700' },
    { label: 'Commandes', value: String(s.nbCommandes), sub: `${s.enCours} en cours · ${s.livrees} livrées`, icon: ShoppingCart, accent: 'bg-nuit-100 text-nuit-700' },
    { label: 'Produits vendus', value: String(s.produitsVendus), sub: `panier moyen ${s.panierMoyen.toLocaleString('fr-FR')} F`, icon: Package2, accent: 'bg-nuit-100 text-nuit-700' },
    { label: 'Satisfaction', value: s.noteMoyenne ? `${s.noteMoyenne}/5` : '—', sub: `${s.nbNotes} avis clients`, icon: Star, accent: 'bg-accent-100 text-accent-700' },
  ] : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <main className="min-w-0 space-y-6">
          <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-chaux-600">Tableau de bord · données réelles</p>
              <h1 className="mt-2 text-3xl font-black">Bonjour, {nomBoutique} 👋</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] bg-chaux-50 text-chaux-600 hover:text-primary-700">
                <Bell className="h-5 w-5" />
              </button>
              <Link href="/boutiques" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
                Voir ma boutique <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <CompteurQuota />

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-[1.5rem] border border-white/70 bg-white/80 p-5 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${k.accent}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm text-chaux-600">{k.label}</p>
                  <p className="mt-1 text-3xl font-black text-nuit-900">{k.value}</p>
                  <p className="mt-1 text-xs text-chaux-600">{k.sub}</p>
                </div>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <div className="rounded-[1.75rem] border border-[var(--hairline)] bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-chaux-600">Performance</p>
                  <h2 className="text-2xl font-black">Évolution du CA · 7 jours</h2>
                </div>
                <span className="rounded-full bg-mangue-100 px-3 py-1.5 text-sm font-bold text-mangue-700">
                  {s ? s.caTotal.toLocaleString('fr-FR') : 0} F au total
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                <defs>
                  <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ea580c" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="gradLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map(t => (
                  <line key={t} x1={P} x2={W - P} y1={H - P - t * (H - 2 * P)} y2={H - P - t * (H - 2 * P)} stroke="#e2e8f0" strokeDasharray="4 6" />
                ))}
                <path d={area} fill="url(#gradArea)" />
                <path d={line} fill="none" stroke="url(#gradLine)" strokeWidth="3" strokeLinecap="round" />
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p[0]} cy={p[1]} r="5" fill="#fff" stroke="#ea580c" strokeWidth="3">
                      <title>{serie[i].jour} : {serie[i].ca.toLocaleString('fr-FR')} F · {serie[i].nb} cmd</title>
                    </circle>
                    <text x={p[0]} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">{serie[i].jour}</text>
                  </g>
                ))}
              </svg>
              <p className="mt-2 text-xs text-chaux-600">💡 Survole les points pour voir le détail de chaque jour.</p>
            </div>

            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-[var(--hairline)] bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <h3 className="text-xl font-black">🌍 Canaux de vente</h3>
                <div className="mt-4 space-y-4">
                  {s && Object.entries(s.parCanal).map(([canal, nb]) => {
                    const m = canalMeta[canal] || { label: canal, icon: Globe2, txt: 'text-chaux-600', bar: 'bg-chaux-400' };
                    const Icon = m.icon;
                    const pct = Math.round((nb / totalCanal) * 100);
                    return (
                      <div key={canal}>
                        <div className="flex justify-between text-sm">
                          <span className={`flex items-center gap-2 font-semibold ${m.txt}`}><Icon className="h-4 w-4" />{m.label}</span>
                          <span className="font-bold">{nb} · {pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-chaux-100">
                          <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[var(--hairline)] bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-mangue-600" />
                  <h3 className="text-xl font-black">Top produits</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {s?.topPlats.slice(0, 4).map(([nom, q], i) => (
                    <div key={nom} className="flex items-center justify-between rounded-[1rem] bg-chaux-50 p-3">
                      <span className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${i === 0 ? 'bg-mangue-400 text-white' : 'bg-chaux-200 text-chaux-600'}`}>{i + 1}</span>
                        <span className="font-semibold text-nuit-800">{nom}</span>
                      </span>
                      <span className="text-sm font-bold text-chaux-600">{q} vendus</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}