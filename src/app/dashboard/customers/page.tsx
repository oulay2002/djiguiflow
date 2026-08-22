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
  Crown,
  Download,
  Edit,
  Eye,
  Filter,
  Mail,
  MapPin,
  MoreHorizontal,
  Package,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { utilisateurCourant } from '@/lib/supabase';
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

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Client[]>([]);
  const [erreur, setErreur] = useState('');
  const [search, setSearch] = useState('');
  const { boutiqueId, pret } = useBoutique();


  useEffect(() => {
    let isMounted = true;

    const charger = async () => {
      const user = await utilisateurCourant();
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
  // `toLocaleString` et non `toFixed` : ce dernier rend « 1.0 », avec un
  // point decimal anglais, dans une interface qui compte en virgules.
  const avgOrders = customers.length
    ? (customers.reduce((acc, c) => acc + c.commandes, 0) / customers.length).toLocaleString(
        'fr-FR',
        { minimumFractionDigits: 1, maximumFractionDigits: 1 },
      )
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
      <div className="mx-auto max-w-[1600px]">
        {/* `min-w-0` : sans lui, la largeur minimale d'un enfant flex vaut
            celle de son contenu, et le conteneur defilant du tableau ne peut
            jamais retrecir — la page entiere partait en defilement
            horizontal, jusqu'a 1 103 px de large sur un telephone. */}
        <main id="contenu" className="min-w-0">
          <header className="mb-8 flex flex-col gap-4 border border-[var(--hairline)] bg-white p-5 soft-shadow md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-chaux-600">Clients</p>
              <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-nuit-900">Clients</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* La recherche etait `hidden sm:block` : c'est sur telephone,
                  face a une liste qu'on ne peut pas balayer des yeux, qu'elle
                  sert le plus. Elle prend toute la largeur sur petit ecran. */}
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chaux-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full border border-chaux-200 bg-chaux-50 py-2.5 pl-9 pr-4 text-sm text-nuit-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 sm:w-56"
                />
              </div>
              <Link
                href="/dashboard/reglages/notifications"
                aria-label="Reglages des notifications"
                className="flex h-11 w-11 items-center justify-center border border-chaux-200 bg-chaux-50 text-chaux-600 transition hover:border-primary-300 hover:text-primary-700"
              >
                <Bell aria-hidden className="h-5 w-5" />
              </Link>
              {/* Navigation, pas action : le bissap reste réservé au geste
                  qui engage. */}
              <Link href="/dashboard/commandes" className={classesBouton('calme')}>
                Commandes récentes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Le ton porte le sens : bissap pour l'argent, feuille pour ce
                qui est acquis, nuit pour les comptages sans état. */}
            {([
              { intitule: 'Total clients', valeur: customers.length, unite: '', icone: Users, ton: 'neutre' },
              { intitule: 'Commandes moy.', valeur: avgOrders, unite: '', icone: ShoppingCart, ton: 'neutre' },
              { intitule: 'Revenu total', valeur: totalRevenue.toLocaleString('fr-FR'), unite: 'FCFA', icone: Star, ton: 'urgent' },
              { intitule: 'Clients fidèles', valeur: customers.filter((c) => c.commandes >= 3).length, unite: '', icone: UserPlus, ton: 'fait' },
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
                  unite={stat.unite}
                  ton={stat.ton}
                />
              </motion.div>
            ))}
          </section>

          <div className="overflow-hidden border border-chaux-200 bg-white soft-shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-chaux-50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Client</th>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Contact</th>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Adresse</th>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Commandes</th>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Dépensé</th>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Dernière cmd</th>
                    <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-[0.18em] text-chaux-600">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-chaux-200">
                  {filteredCustomers.map((customer, index) => (
                    <motion.tr key={customer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }} className="transition hover:bg-chaux-50/80">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center bg-nuit-700 text-sm font-black text-white">
                            {initiales(customer.nom)}
                          </div>
                          <div>
                            <p className="font-bold text-nuit-900">{customer.nom}</p>
                            {/* Le canal remplace l'e-mail : une commande WhatsApp
                                n'en fournit aucun, et savoir par où le client
                                écrit sert davantage. */}
                            <p className="text-xs text-chaux-600">
                              {CANAUX[customer.canal] ?? 'Canal inconnu'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-sm text-chaux-600">
                          <Phone className="h-4 w-4 text-chaux-400" />
                          <a href={`tel:+${customer.telephone}`} className="font-mono hover:text-primary-700">
                            {customer.telephone}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-xs items-center gap-2 text-sm text-chaux-600">
                          <MapPin className="h-4 w-4 flex-shrink-0 text-chaux-400" />
                          <span className="truncate">{customer.adresse || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono font-bold text-nuit-900">{customer.commandes}</td>
                      <td className="whitespace-nowrap px-4 py-4 font-mono font-bold text-nuit-900">
                        {customer.depense.toLocaleString('fr-FR')}
                        <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-chaux-600">{dateCourte(customer.derniereCommande)}</td>
                      <td className="px-4 py-4">
                        {customer.note === null ? (
                          <span className="text-xs text-chaux-600">Pas encore noté</span>
                        ) : (
                          <div className="flex items-center gap-1 text-mangue-400">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-4 w-4 ${i < Math.round(customer.note!) ? 'fill-current' : 'text-chaux-300'}`} />
                            ))}
                            <span className="ml-1 font-mono text-xs text-chaux-600">{customer.note.toFixed(1)}</span>
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
                <p className="mt-1 text-sm text-chaux-600">
                  Vos clients apparaîtront ici dès la première commande reçue.
                </p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-12 text-center text-chaux-600">
                Aucun client ne correspond à « {search} »
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
