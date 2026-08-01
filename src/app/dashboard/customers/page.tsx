'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Gauge,
  LogOut,
  MapPin,
  Package2,
  Phone,
  Search,
  Settings,
  ShoppingCart,
  Star,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const mockCustomers = [
  { id: 1, name: 'Maëlys Kouamé', email: 'maelys.k@gmail.com', phone: '0102918886', address: 'Akuoedo SYNACASSCI RUE G11', orders: 12, totalSpent: 85000, lastOrder: '2025-01-15', rating: 5, avatar: 'MK' },
  { id: 2, name: 'Aminata Diallo', email: 'aminata.d@yahoo.fr', phone: '0709123456', address: 'Cocody Angré 8ème tranche', orders: 8, totalSpent: 42000, lastOrder: '2025-01-15', rating: 4, avatar: 'AD' },
  { id: 3, name: 'Ibrahim Koné', email: 'ibrahim.kone@hotmail.com', phone: '0507123456', address: 'Yopougon Siporex', orders: 5, totalSpent: 28000, lastOrder: '2025-01-14', rating: 5, avatar: 'IK' },
  { id: 4, name: 'Sarah Yao', email: 'sarah.yao@gmail.com', phone: '0102345678', address: 'Marcory Zone 4', orders: 15, totalSpent: 120000, lastOrder: '2025-01-15', rating: 5, avatar: 'SY' },
  { id: 5, name: 'Moussa Traoré', email: 'moussa.t@orange.ci', phone: '0708123456', address: 'Abobo Baoulé', orders: 3, totalSpent: 15000, lastOrder: '2025-01-10', rating: 3, avatar: 'MT' },
  { id: 6, name: 'Fatou Bamba', email: 'fatou.bamba@gmail.com', phone: '0506123456', address: 'Treichville Avenue 13', orders: 20, totalSpent: 180000, lastOrder: '2025-01-13', rating: 5, avatar: 'FB' },
];

const sidebarItems = [
  { label: 'Vue d’ensemble', href: '/dashboard', active: false, icon: Gauge },
  { label: 'Commandes', href: '/dashboard/orders', active: false, icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', active: true, icon: Users },
  { label: 'Produits', href: '/dashboard/products', active: false, icon: Package2 },
  { label: 'Livreurs', href: '/dashboard/drivers', active: false, icon: Truck },
  { label: 'Réglages', href: '#', active: false, icon: Settings },
];

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers] = useState(mockCustomers);
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

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      customer.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = customers.reduce((acc, c) => acc + c.totalSpent, 0);
  const avgOrders = (customers.reduce((acc, c) => acc + c.orders, 0) / customers.length).toFixed(1);

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
            <p className="text-sm text-slate-500">Base clients</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{customers.length}</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              +12% sur 30 jours
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
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Clients</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Base clients</h1>
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
              <Link href="/dashboard/orders" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px]">
                Commandes récentes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total clients', value: customers.length, icon: Users, accent: 'bg-primary-100 text-primary-700' },
              { label: 'Commandes moy.', value: avgOrders, icon: ShoppingCart, accent: 'bg-emerald-100 text-emerald-700' },
              { label: 'Revenu total', value: `${(totalRevenue / 1000).toFixed(0)}K FCFA`, icon: Star, accent: 'bg-amber-100 text-amber-600' },
              { label: 'Clients fidèles', value: customers.filter((c) => c.orders >= 10).length, icon: UserPlus, accent: 'bg-sky-100 text-sky-700' },
            ].map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.06 }} className="glass-panel rounded-[1.5rem] p-5">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.accent}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">{stat.label}</p>
                      <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </section>

          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/75 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Client</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Contact</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Adresse</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Commandes</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Dépensé</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Dernière cmd</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((customer, index) => (
                    <motion.tr key={customer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="transition hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-black text-white">
                            {customer.avatar}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{customer.name}</p>
                            <p className="text-xs text-slate-500">{customer.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <span>{customer.phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex max-w-xs items-center gap-2 text-sm text-slate-600">
                          <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
                          <span className="truncate">{customer.address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">{customer.orders}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{customer.totalSpent.toLocaleString()} FCFA</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{customer.lastOrder}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-amber-400">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`h-4 w-4 ${i < customer.rating ? 'fill-current' : 'text-slate-300'}`} />
                          ))}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredCustomers.length === 0 && <div className="py-12 text-center text-slate-500">Aucun client trouvé</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
