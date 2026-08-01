'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Truck,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react';
import Link from 'next/link';

// Données de démonstration (seront remplacées par Supabase plus tard)
const mockOrders = [
  {
    id: 'DJ-7823',
    customer: 'Maëlys Kouamé',
    phone: '0102918886',
    items: '2x Pizza Margherita, 1x Coca',
    total: 8500,
    status: 'livree',
    driver: 'Jean Paul',
    date: '2025-01-15 14:22',
    address: 'Akuoedo SYNACASSCI RUE G11',
  },
  {
    id: 'DJ-7824',
    customer: 'Aminata Diallo',
    phone: '0709123456',
    items: '1x Burger Classic, 1x Frites',
    total: 4500,
    status: 'en_livraison',
    driver: 'Koffi',
    date: '2025-01-15 15:10',
    address: 'Cocody Angré 8ème tranche',
  },
  {
    id: 'DJ-7825',
    customer: 'Ibrahim Koné',
    phone: '0507123456',
    items: '3x Attiéké poisson',
    total: 6000,
    status: 'en_attente',
    driver: null,
    date: '2025-01-15 15:45',
    address: 'Yopougon Siporex',
  },
  {
    id: 'DJ-7826',
    customer: 'Sarah Yao',
    phone: '0102345678',
    items: '1x Poulet DG, 2x Jus de bissap',
    total: 7500,
    status: 'livree',
    driver: 'Jean Paul',
    date: '2025-01-15 12:30',
    address: 'Marcory Zone 4',
  },
  {
    id: 'DJ-7827',
    customer: 'Moussa Traoré',
    phone: '0708123456',
    items: '2x Alloco, 1x Poisson braisé',
    total: 9000,
    status: 'annulee',
    driver: null,
    date: '2025-01-15 11:15',
    address: 'Abobo Baoulé',
  },
];

const statusConfig = {
  en_attente: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  en_livraison: { label: 'En livraison', color: 'bg-blue-100 text-blue-700', icon: Truck },
  livree: { label: 'Livrée', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  annulee: { label: 'Annulée', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function OrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState(mockOrders);
  const [filter, setFilter] = useState('toutes');
  const [search, setSearch] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setLoading(false);
  };

  const filteredOrders = orders.filter(order => {
    const matchesFilter = filter === 'toutes' || order.status === filter;
    const matchesSearch = 
      order.customer.toLowerCase().includes(search.toLowerCase()) ||
      order.id.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-600 transition mb-2">
            <ArrowLeft className="w-5 h-5" />
            <span>Retour au dashboard</span>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Commandes</h1>
          <p className="text-gray-600 mt-1">Gérez toutes vos commandes</p>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par client ou numéro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['toutes', 'en_attente', 'en_livraison', 'livree', 'annulee'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filter === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status === 'toutes' ? 'Toutes' : statusConfig[status].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste des commandes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">N° Commande</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Articles</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Livreur</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.map((order, index) => {
                const config = statusConfig[order.status];
                const StatusIcon = config.icon;
                return (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="hover:bg-gray-50 transition"
                  >
                    <td className="px-6 py-4">
                      <span className="font-semibold text-primary-600">#{order.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{order.customer}</p>
                        <p className="text-sm text-gray-500">{order.phone}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700 max-w-xs truncate">{order.items}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-gray-900">{order.total.toLocaleString()} FCFA</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700">{order.driver || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500">{order.date}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                        <Eye className="w-4 h-4 text-gray-600" />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">Aucune commande trouvée</p>
          </div>
        )}
      </div>
    </div>
  );
}