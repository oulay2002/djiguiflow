'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  Download,
  Edit,
  Eye,
  Filter,
  Gauge,
  LogOut,
  Mail,
  MapPin,
  MoreHorizontal,
  Package,
  Package2,
  Phone,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchDashboard } from '@/lib/apiClient';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { TuileStat } from '@/components/ui/Etat';
import { classesBouton } from '@/components/ui/Bouton';

// Le client n'a pas de table : il est deduit de ses commandes, cote serveur.
type Client = {
  id: string;
  nom: string;
  telephone: string;
  adresse: string;
  canal: string;
  commandes: number;
  depense: number;
  derniereCommande: string;
  note: number | null;
};

const CANAUX: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  app: 'Boutique en ligne',
};

/** « Kouassi Adjoua » -> « KA ». */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(m => m.charAt(0).toUpperCase())
    .join('') || '?';
}

function dateCourte(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

const sidebarItems = [
  { label: 'Vue d\'ensemble', href: '/dashboard', active: true, icon: Gauge },
  { label: 'Ma Boutique', href: '/dashboard/ma-boutique', active: false, icon: Store },
  { label: 'Commandes', href: '/dashboard/commandes', active: false, icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', active: false, icon: Users },
  { label: 'Produits', href: '/dashboard/products', active: false, icon: Package2 },
  { label: 'Analytics', href: '/dashboard/stats', active: false, icon: TrendingUp }, // ← CORRIGÉ
  { label: 'Livreurs', href: '/dashboard/livreurs', active: false, icon: Truck },
  { label: 'Paiements', href: '/dashboard/paiements', active: false, icon: CreditCard },
  { label: 'Notifications', href: '/dashboard/reglages/notifications', active: false, icon: Bell },
  { label: 'Réglages', href: '/dashboard/reglages', active: false, icon: Settings },
];

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Client[]>([]);
  const [erreur, setErreur] = useState('');
  const [search, setSearch] = useState('');
  const { boutiqueId, pret } = useBoutique();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    let isMounted = true;

    const charger = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const r = await fetchDashboard(avecBoutique('/api/dashboard/clients', boutiqueId));
        const d = await r.json();
        if (!isMounted) return;
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        setCustomers(Array.isArray(d.clients) ? d.clients : []);
        setErreur('');
      } catch (e) {
        if (isMounted) setErreur(e instanceof Error ? e.message : 'Chargement impossible');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (pret) void charger();

    return () => {
      isMounted = false;
    };
  }, [router, pret, boutiqueId]);

  const q = search.trim().toLowerCase();
  const filteredCustomers = q
    ? customers.filter(
        (c) =>
          c.nom.toLowerCase().includes(q) ||
          c.telephone.includes(q.replace(/\D/g, '')) ||
          c.adresse.toLowerCase().includes(q),
      )
    : customers;

  const totalRevenue = customers.reduce((acc, c) => acc + c.depense, 0);
  // Sans clients, la moyenne serait une division par zéro affichée « NaN ».
  const avgOrders = customers.length
    ? (customers.reduce((acc, c) => acc + c.commandes, 0) / customers.length).toFixed(1)
    : '0';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-6">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-nuit-500 to-accent-600 text-lg font-black text-white shadow-lg shadow-primary-500/20">
              D
            </div>
            <div>
              <p className="text-lg font-black text-nuit-900">DjiguiFlow</p>
              <p className="text-xs uppercase tracking-[0.2em] text-chaux-500">Admin</p>
            </div>
          </div>

          <nav className="space-y-2">
            {sidebarItems.map(({ label, href, active, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  active ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-chaux-600 hover:bg-chaux-100 hover:text-nuit-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-[1.5rem] bg-gradient-to-br from-nuit-50 via-chaux-50 to-white p-4">
            <p className="text-sm text-chaux-500">Base clients</p>
            <p className="mt-2 text-2xl font-black text-nuit-900">{customers.length}</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-accent-700">
              <CheckCircle2 className="h-4 w-4" />
              {customers.filter((c) => c.commandes >= 3).length} client
              {customers.filter((c) => c.commandes >= 3).length > 1 ? 's' : ''} régulier
              {customers.filter((c) => c.commandes >= 3).length > 1 ? 's' : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className={`${classesBouton('calme')} mt-8 w-full`}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </aside>

        <main className="flex-1">
          <header className="mb-8 flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-chaux-500">Clients</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-nuit-900">Base clients</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chaux-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-56 rounded-full border border-chaux-200 bg-chaux-50 py-2.5 pl-9 pr-4 text-sm text-nuit-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-chaux-200 bg-chaux-50 text-chaux-600 transition hover:border-primary-300 hover:text-primary-700">
                <Bell className="h-5 w-5" />
              </button>
              {/* Navigation, pas action : le bissap reste réservé au geste
                  qui engage. */}
              <Link href="/dashboard/orders" className={classesBouton('calme')}>
                Commandes récentes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Le ton porte le sens : bissap pour l'argent, feuille pour ce
                qui est acquis, nuit pour les comptages sans état. */}
            {([
              { intitule: 'Total clients', valeur: customers.length, icone: Users, ton: 'neutre' },
              { intitule: 'Commandes moy.', valeur: avgOrders, icone: ShoppingCart, ton: 'neutre' },
              { intitule: 'Revenu total', valeur: `${totalRevenue.toLocaleString('fr-FR')} FCFA`, icone: Star, ton: 'urgent' },
              { intitule: 'Clients fidèles', valeur: customers.filter((c) => c.commandes >= 3).length, icone: UserPlus, ton: 'fait' },
            ] as const).map((stat, index) => (
              <motion.div
                key={stat.intitule}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
              >
                <TuileStat
                  icone={stat.icone}
                  intitule={stat.intitule}
                  valeur={stat.valeur}
                  ton={stat.ton}
                />
              </motion.div>
            ))}
          </section>

          <div className="overflow-hidden rounded-[1.75rem] border border-chaux-200 bg-white/75 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-chaux-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Client</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Contact</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Adresse</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Commandes</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Dépensé</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Dernière cmd</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-chaux-500">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-chaux-200">
                  {filteredCustomers.map((customer, index) => (
                    <motion.tr key={customer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="transition hover:bg-chaux-50/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-nuit-500 to-primary-700 text-sm font-black text-white">
                            {initiales(customer.nom)}
                          </div>
                          <div>
                            <p className="font-bold text-nuit-900">{customer.nom}</p>
                            {/* Le canal remplace l'e-mail : une commande WhatsApp
                                n'en fournit aucun, et savoir par où le client
                                écrit sert davantage. */}
                            <p className="text-xs text-chaux-500">
                              {CANAUX[customer.canal] ?? 'Canal inconnu'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-chaux-600">
                          <Phone className="h-4 w-4 text-chaux-400" />
                          <a href={`tel:+${customer.telephone}`} className="font-mono hover:text-primary-700">
                            {customer.telephone}
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex max-w-xs items-center gap-2 text-sm text-chaux-600">
                          <MapPin className="h-4 w-4 flex-shrink-0 text-chaux-400" />
                          <span className="truncate">{customer.adresse || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-nuit-900">{customer.commandes}</td>
                      <td className="px-6 py-4 font-mono font-bold text-nuit-900">{customer.depense.toLocaleString('fr-FR')} FCFA</td>
                      <td className="px-6 py-4 text-sm text-chaux-600">{dateCourte(customer.derniereCommande)}</td>
                      <td className="px-6 py-4">
                        {customer.note === null ? (
                          <span className="text-xs text-chaux-400">Pas encore noté</span>
                        ) : (
                          <div className="flex items-center gap-1 text-mangue-400">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-4 w-4 ${i < Math.round(customer.note!) ? 'fill-current' : 'text-chaux-300'}`} />
                            ))}
                            <span className="ml-1 font-mono text-xs text-chaux-500">{customer.note.toFixed(1)}</span>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Trois situations distinctes : une panne, une base encore vide,
                une recherche sans résultat. Les confondre laisse le marchand
                croire qu'il a perdu ses clients. */}
            {erreur ? (
              <div className="py-12 text-center text-sm text-bissap-700">
                Chargement impossible — {erreur}
              </div>
            ) : customers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-bold text-nuit-700">Aucun client pour l&apos;instant</p>
                <p className="mt-1 text-sm text-chaux-500">
                  Vos clients apparaîtront ici dès la première commande reçue.
                </p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-12 text-center text-chaux-500">
                Aucun client ne correspond à « {search} »
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
