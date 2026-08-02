'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Gauge,
  LayoutGrid,
  LogOut,
  Package2,
  Search,
  Settings,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const stats = [
  { label: 'Ventes du jour', value: '₣ 1 240 000', trend: '+18.4%', icon: CircleDollarSign, accent: 'bg-amber-100 text-amber-700' },
  { label: 'Commandes', value: '128', trend: '+12.1%', icon: ShoppingCart, accent: 'bg-primary-100 text-primary-700' },
  { label: 'Clients actifs', value: '3 486', trend: '+9.2%', icon: Users, accent: 'bg-emerald-100 text-emerald-700' },
  { label: 'Livreurs', value: '24', trend: '+3.0%', icon: Truck, accent: 'bg-sky-100 text-sky-700' },
];

const recentOrders = [
  { id: 'DJ-7823', customer: 'Maëlys Kouamé', total: '₣ 8 500', status: 'Livrée', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'DJ-7824', customer: 'Aminata Diallo', total: '₣ 4 500', status: 'En livraison', color: 'bg-sky-100 text-sky-700' },
  { id: 'DJ-7825', customer: 'Ibrahim Koné', total: '₣ 6 000', status: 'En attente', color: 'bg-amber-100 text-amber-700' },
  { id: 'DJ-7826', customer: 'Sarah Yao', total: '₣ 7 500', status: 'Livrée', color: 'bg-emerald-100 text-emerald-700' },
];

const topProducts = [
  { name: 'Pizza Margherita', sales: '142', revenue: '₣ 497 000' },
  { name: 'Poulet DG', sales: '128', revenue: '₣ 448 000' },
  { name: 'Jus de bissap', sales: '84', revenue: '₣ 84 000' },
];

const sidebarItems = [
  { label: 'Vue d\'ensemble', href: '/dashboard', active: true, icon: Gauge },
  { label: 'Ma Boutique', href: '/dashboard/ma-boutique', active: false, icon: Store },
  { label: 'Commandes', href: '/dashboard/commandes', active: false, icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', active: false, icon: Users },
  { label: 'Produits', href: '/dashboard/products', active: false, icon: Package2 }, // ← C'est ici !
  { label: 'Analytics', href: '/dashboard/analytics', active: false, icon: TrendingUp },
  { label: 'Livreurs', href: '/dashboard/drivers', active: false, icon: Truck },
  { label: 'Paiements', href: '/dashboard/paiements', active: false, icon: CreditCard },
  { label: 'Réglages', href: '/dashboard/reglages', active: false, icon: Settings },
];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (!user) {
        router.push('/login');
        return;
      }

      setLoading(false);
    };

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f4ec]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-6">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-lg font-black text-white shadow-lg shadow-primary-500/20">
              D
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">DjiguiFlow</p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
            </div>
          </div>

          <nav className="space-y-2">
            {sidebarItems.map(({ label, href, active, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-[1.5rem] bg-gradient-to-br from-primary-50 via-amber-50 to-white p-4">
            <p className="text-sm text-slate-500">Semaine actuelle</p>
            <p className="mt-2 text-2xl font-black text-slate-900">₣ 4,2M</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              +14,8% vs semaine dernière
            </p>
          </div>

          <button className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </aside>

        <main className="flex-1">
          <header className="mb-8 flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Tableau de bord</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Bonjour, DjiguiFlow</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  className="w-56 rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-primary-300 hover:text-primary-700">
                <Bell className="h-5 w-5" />
              </button>
              <Link href="/dashboard/ma-boutique" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px]">
                Voir ma boutique
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.08 }}
                  className="glass-panel rounded-[1.5rem] p-5"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.accent}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{stat.trend}</span>
                  </div>
                  <div className="mt-5">
                    <p className="text-sm text-slate-600">{stat.label}</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{stat.value}</p>
                  </div>
                </motion.div>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Performance</p>
                  <h2 className="text-2xl font-black text-slate-900">Suivi des ventes</h2>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  +14,8% cette semaine
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Ca. total</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">₣ 4,2M</p>
                </div>
                <div className="rounded-[1.5rem] bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Produits vendus</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">1 548</p>
                </div>
                <div className="rounded-[1.5rem] bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Taux de satisfaction</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">96%</p>
                </div>
              </div>

              <div className="mt-6 h-56 rounded-[1.5rem] bg-gradient-to-r from-primary-50 via-amber-50 to-emerald-50 p-4">
                <div className="flex h-full items-end gap-3">
                  {[42, 58, 48, 82, 76, 96, 88].map((height, index) => (
                    <div key={height + index} className="flex-1 rounded-t-[1rem] bg-gradient-to-t from-primary-500 to-primary-300" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Activité</p>
                    <h3 className="text-xl font-black text-slate-900">Top produits</h3>
                  </div>
                  <button className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200">
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {topProducts.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-[1.25rem] bg-slate-50 p-3">
                      <div>
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        <p className="text-sm text-slate-500">{item.sales} ventes</p>
                      </div>
                      <span className="font-bold text-slate-900">{item.revenue}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Réseau</p>
                    <h3 className="text-xl font-black text-slate-900">Zones actives</h3>
                  </div>
                  <div className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">12 quartiers</div>
                </div>

                <div className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-[1rem] bg-slate-50 p-3">
                    <span className="flex items-center gap-2"><Package2 className="h-4 w-4 text-primary-600" /> Cocody</span>
                    <span className="font-semibold text-slate-800">34 livraisons</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[1rem] bg-slate-50 p-3">
                    <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary-600" /> Yopougon</span>
                    <span className="font-semibold text-slate-800">28 livraisons</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[1rem] bg-slate-50 p-3">
                    <span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary-600" /> Marcory</span>
                    <span className="font-semibold text-slate-800">22 livraisons</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Commandes récentes</p>
                <h3 className="text-2xl font-black text-slate-900">Suivi des livraisons</h3>
              </div>
              <Link href="/dashboard/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 transition hover:text-primary-800">
                Voir toutes les commandes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Commande</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Client</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Montant</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-200">
                      <td className="px-4 py-4 font-semibold text-slate-800">{order.id}</td>
                      <td className="px-4 py-4 text-slate-700">{order.customer}</td>
                      <td className="px-4 py-4 font-semibold text-slate-800">{order.total}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${order.color}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
