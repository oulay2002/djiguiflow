'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  CheckCircle,
  CheckCircle2,
  Clock,
  Gauge,
  LogOut,
  Package2,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type OrderStatus = 'en_attente' | 'en_livraison' | 'livree' | 'annulee';
type OrderFilter = 'toutes' | OrderStatus;

type Order = {
  id: string;
  customer: string;
  phone: string;
  items: string;
  total: number;
  status: OrderStatus;
  driver: string | null;
  date: string;
  address: string;
};

const mockOrders: Order[] = [
  { id: 'DJ-7823', customer: 'Maëlys Kouamé', phone: '0102918886', items: '2x Pizza Margherita, 1x Coca', total: 8500, status: 'livree', driver: 'Jean Paul', date: '2025-01-15 14:22', address: 'Akuoedo SYNACASSCI RUE G11' },
  { id: 'DJ-7824', customer: 'Aminata Diallo', phone: '0709123456', items: '1x Burger Classic, 1x Frites', total: 4500, status: 'en_livraison', driver: 'Koffi', date: '2025-01-15 15:10', address: 'Cocody Angré 8ème tranche' },
  { id: 'DJ-7825', customer: 'Ibrahim Koné', phone: '0507123456', items: '3x Attiéké poisson', total: 6000, status: 'en_attente', driver: null, date: '2025-01-15 15:45', address: 'Yopougon Siporex' },
  { id: 'DJ-7826', customer: 'Sarah Yao', phone: '0102345678', items: '1x Poulet DG, 2x Jus de bissap', total: 7500, status: 'livree', driver: 'Jean Paul', date: '2025-01-15 12:30', address: 'Marcory Zone 4' },
  { id: 'DJ-7827', customer: 'Moussa Traoré', phone: '0708123456', items: '2x Alloco, 1x Poisson braisé', total: 9000, status: 'annulee', driver: null, date: '2025-01-15 11:15', address: 'Abobo Baoulé' },
];

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: typeof Clock }> = {
  en_attente: { label: 'En attente', color: 'border border-amber-200 bg-amber-100 text-amber-700', icon: Clock },
  en_livraison: { label: 'En livraison', color: 'border border-sky-200 bg-sky-100 text-sky-700', icon: Truck },
  livree: { label: 'Livrée', color: 'border border-emerald-200 bg-emerald-100 text-emerald-700', icon: CheckCircle },
  annulee: { label: 'Annulée', color: 'border border-rose-200 bg-rose-100 text-rose-700', icon: XCircle },
};

const statusOptions: OrderFilter[] = ['toutes', 'en_attente', 'en_livraison', 'livree', 'annulee'];

const sidebarItems = [
  { label: 'Vue d’ensemble', href: '/dashboard', active: false, icon: Gauge },
  { label: 'Commandes', href: '/dashboard/orders', active: true, icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', active: false, icon: Users },
  { label: 'Produits', href: '/dashboard/products', active: false, icon: Package2 },
  { label: 'Livreurs', href: '/dashboard/drivers', active: false, icon: Truck },
  { label: 'Réglages', href: '#', active: false, icon: Settings },
];

export default function OrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders] = useState<Order[]>(mockOrders);
  const [filter, setFilter] = useState<OrderFilter>('toutes');
  const [search, setSearch] = useState('');

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

  const filteredOrders = orders.filter((order) => {
    const matchesFilter = filter === 'toutes' || order.status === filter;
    const matchesSearch =
      order.customer.toLowerCase().includes(search.toLowerCase()) ||
      order.id.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

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
                  active ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-[1.5rem] bg-gradient-to-br from-primary-50 via-amber-50 to-white p-4">
            <p className="text-sm text-slate-500">Livraisons du jour</p>
            <p className="mt-2 text-2xl font-black text-slate-900">128</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              +18% vs hier
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
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Commandes</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Suivi des livraisons</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-56 rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-primary-300 hover:text-primary-700">
                <Bell className="h-5 w-5" />
              </button>
              <Link href="/dashboard/customers" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px]">
                Voir les clients
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <div className="mb-8 rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher par client ou numéro..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {statusOptions.map((status) => {
                  const label = status === 'toutes' ? 'Toutes' : statusConfig[status].label;
                  return (
                    <button
                      key={status}
                      onClick={() => setFilter(status)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        filter === status ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/75 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">N° Commande</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Client</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Articles</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Total</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Statut</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Livreur</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order, index) => {
                    const config = statusConfig[order.status];
                    const StatusIcon = config.icon;
                    return (
                      <motion.tr key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="transition hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-black text-primary-700">#{order.id}</td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-bold text-slate-900">{order.customer}</p>
                            <p className="text-sm text-slate-500">{order.phone}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          <span className="max-w-xs">{order.items}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900">{order.total.toLocaleString()} FCFA</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${config.color}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">{order.driver || '-'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{order.date}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredOrders.length === 0 && <div className="py-12 text-center text-slate-500">Aucune commande trouvée</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
