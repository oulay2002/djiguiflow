'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Bell,
  CheckCircle2,
  Edit,
  Gauge,
  LogOut,
  Package,
  Package2,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const mockProducts = [
  { id: 1, name: 'Pizza Margherita', category: 'Pizzas', price: 3500, stock: 50, sold: 120, status: 'disponible' },
  { id: 2, name: 'Burger Classic', category: 'Burgers', price: 2500, stock: 30, sold: 85, status: 'disponible' },
  { id: 3, name: 'Attiéké poisson', category: 'Plats locaux', price: 2000, stock: 0, sold: 200, status: 'rupture' },
  { id: 4, name: 'Poulet DG', category: 'Plats locaux', price: 3500, stock: 25, sold: 95, status: 'disponible' },
  { id: 5, name: 'Jus de bissap', category: 'Boissons', price: 1000, stock: 100, sold: 150, status: 'disponible' },
  { id: 6, name: 'Alloco', category: 'Accompagnements', price: 1500, stock: 40, sold: 110, status: 'disponible' },
];

const sidebarItems = [
  { label: 'Vue d’ensemble', href: '/dashboard', active: false, icon: Gauge },
  { label: 'Commandes', href: '/dashboard/orders', active: false, icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', active: false, icon: Users },
  { label: 'Produits', href: '/dashboard/products', active: true, icon: Package2 },
  { label: 'Livreurs', href: '/dashboard/drivers', active: false, icon: Truck },
  { label: 'Réglages', href: '#', active: false, icon: Settings },
];

export default function ProductsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products] = useState(mockProducts);
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

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.category.toLowerCase().includes(search.toLowerCase())
  );

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
            <p className="text-sm text-slate-500">Stock actif</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{products.filter((p) => p.status === 'disponible').length}</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              2 produits à recharger
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
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Produits</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Catalogue</h1>
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
              <button className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px]">
                <Plus className="h-4 w-4" />
                Nouveau produit
              </button>
            </div>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            {[
              { label: 'Total produits', value: products.length, icon: Package, accent: 'bg-primary-100 text-primary-700' },
              { label: 'Disponibles', value: products.filter((p) => p.status === 'disponible').length, icon: TrendingUp, accent: 'bg-emerald-100 text-emerald-700' },
              { label: 'En rupture', value: products.filter((p) => p.status === 'rupture').length, icon: Package, accent: 'bg-rose-100 text-rose-700' },
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
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Produit</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Catégorie</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Prix</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Stock</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Vendus</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Statut</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product, index) => (
                    <motion.tr key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="transition hover:bg-slate-50/80">
                      <td className="px-6 py-4 font-bold text-slate-900">{product.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{product.category}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{product.price.toLocaleString()} FCFA</td>
                      <td className={`px-6 py-4 font-bold ${product.stock === 0 ? 'text-rose-600' : 'text-slate-900'}`}>{product.stock}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{product.sold}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${product.status === 'disponible' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {product.status === 'disponible' ? 'Disponible' : 'Rupture'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredProducts.length === 0 && <div className="py-12 text-center text-slate-500">Aucun produit trouvé</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
