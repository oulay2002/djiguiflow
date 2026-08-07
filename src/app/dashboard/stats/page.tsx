'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { fetchDashboard } from '@/lib/apiClient';
import Link from 'next/link';
import {
  Bell, Bike, CalendarDays, CreditCard, Gauge, Globe2, LogOut,
  Package2, RefreshCw, Send, Settings, ShoppingCart, Smartphone,
  Star, Store, TrendingUp, Trophy, Truck, Users, Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Stats = {
  caTotal: number; caJour: number; nbCommandes: number; nbJour: number;
  livrees: number; enCours: number; parCanal: Record<string, number>;
  noteMoyenne: number; nbNotes: number; topPlats: [string, number][];
};

const sidebarItems = [
  { label: "Vue d'ensemble", href: '/dashboard', icon: Gauge },
  { label: 'Ma Boutique', href: '/dashboard/ma-boutique', icon: Store },
  { label: 'Commandes', href: '/dashboard/commandes', icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', icon: Users },
  { label: 'Produits', href: '/dashboard/products', icon: Package2 },
  { label: 'Analytics', href: '/dashboard/stats', icon: TrendingUp },
  { label: 'Livreurs', href: '/dashboard/livreurs', icon: Truck },
  { label: 'Paiements', href: '/dashboard/paiements', icon: CreditCard },
  { label: 'Notifications', href: '/dashboard/reglages/notifications', icon: Bell },
  { label: 'Réglages', href: '/dashboard/reglages', icon: Settings },
];

const canalMeta: Record<string, { label: string; icon: ComponentType<{ className?: string }>; txt: string; bar: string }> = {
  whatsapp: { label: 'WhatsApp', icon: Smartphone, txt: 'text-emerald-700', bar: 'bg-emerald-500' },
  telegram: { label: 'Telegram', icon: Send, txt: 'text-sky-700', bar: 'bg-sky-500' },
  app: { label: 'Application', icon: Globe2, txt: 'text-orange-700', bar: 'bg-orange-500' },
};

export default function Page() {
  const [s, setS] = useState<Stats | null>(null);
  const [maj, setMaj] = useState('');

  const { boutiqueId, pret } = useBoutique();

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
    { label: 'CA total', value: `${s.caTotal.toLocaleString('fr-FR')} F`, sub: 'depuis le début', icon: Wallet, accent: 'bg-amber-100 text-amber-700' },
    { label: 'CA du jour', value: `${s.caJour.toLocaleString('fr-FR')} F`, sub: `${s.nbJour} commande(s) aujourd'hui`, icon: CalendarDays, accent: 'bg-sky-100 text-sky-700' },
    { label: 'Commandes', value: String(s.nbCommandes), sub: `${s.enCours} en cours`, icon: ShoppingCart, accent: 'bg-violet-100 text-violet-700' },
    { label: 'Livrées', value: String(s.livrees), sub: 'cycles terminés', icon: Bike, accent: 'bg-emerald-100 text-emerald-700' },
  ] : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-6">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-lg font-black text-white">D</div>
            <div>
              <p className="text-lg font-black">DjiguiFlow</p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
            </div>
          </div>
          <nav className="space-y-2">
            {sidebarItems.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  href === '/dashboard/stats'
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <button onClick={async () => { await supabase.auth.signOut(); location.href = '/login'; }}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold hover:bg-slate-100">
            <LogOut className="h-4 w-4" />Déconnexion
          </button>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-700 via-amber-600 to-orange-500 p-6 text-white shadow-xl">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-amber-100">Analytics · données réelles</p>
                <h1 className="mt-2 text-3xl font-black">📊 Pilotage Zahara</h1>
              </div>
              <button onClick={charger} className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                <RefreshCw className="h-4 w-4" /> Actualiser
              </button>
            </div>
            {maj && <p className="relative z-10 mt-3 text-xs text-amber-100">Dernière mise à jour : {maj} · source : Google Sheets</p>}
          </header>

          {!s ? <p className="p-10 text-center text-slate-500">Chargement…</p> : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.map(k => {
                  const Icon = k.icon;
                  return (
                    <div key={k.label} className="rounded-[1.5rem] border border-white/70 bg-white/80 p-5 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${k.accent}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-sm text-slate-500">{k.label}</p>
                      <p className="mt-1 text-3xl font-black text-slate-900">{k.value}</p>
                      <p className="mt-1 text-xs text-slate-400">{k.sub}</p>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-3">
                <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                  <p className="text-sm text-slate-500">Satisfaction client</p>
                  <div className="mt-3 flex items-end gap-3">
                    <p className="text-5xl font-black text-slate-900">{s.noteMoyenne ? s.noteMoyenne.toFixed(1) : '—'}</p>
                    <p className="pb-1 text-sm text-slate-400">/ 5 · {s.nbNotes} avis</p>
                  </div>
                  <div className="mt-4 flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className={`h-6 w-6 ${i <= Math.round(s.noteMoyenne) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm xl:col-span-2">
                  <h2 className="text-xl font-black text-slate-900">🌍 Répartition par canal</h2>
                  <div className="mt-5 space-y-4">
                    {Object.entries(s.parCanal).map(([canal, nb]) => {
                      const m = canalMeta[canal] || { label: canal, icon: Globe2, txt: 'text-slate-600', bar: 'bg-slate-400' };
                      const Icon = m.icon;
                      const pct = Math.round((nb / totalCanal) * 100);
                      return (
                        <div key={canal}>
                          <div className="flex items-center justify-between text-sm">
                            <span className={`flex items-center gap-2 font-semibold ${m.txt}`}><Icon className="h-4 w-4" />{m.label}</span>
                            <span className="font-bold text-slate-800">{nb} · {pct}%</span>
                          </div>
                          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-600" />
                  <h2 className="text-xl font-black text-slate-900">Plats stars</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {s.topPlats.map(([nom, q], i) => (
                    <div key={nom} className="flex items-center gap-4">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-slate-700' : i === 2 ? 'bg-orange-200 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-slate-800">{nom}</span>
                          <span className="font-bold text-slate-600">{q} vendus</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-600" style={{ width: `${Math.round((q / maxPlat) * 100)}%` }} />
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