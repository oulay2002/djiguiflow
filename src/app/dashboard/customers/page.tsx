'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Search,
  Users,
  UserPlus,
  Mail,
  Phone,
  ShoppingBag,
  Star,
  Calendar,
  MapPin
} from 'lucide-react';
import Link from 'next/link';

// Données de démonstration
const mockCustomers = [
  {
    id: 1,
    name: 'Maëlys Kouamé',
    email: 'maelys.k@gmail.com',
    phone: '0102918886',
    address: 'Akuoedo SYNACASSCI RUE G11',
    orders: 12,
    totalSpent: 85000,
    lastOrder: '2025-01-15',
    rating: 5,
    avatar: 'MK',
  },
  {
    id: 2,
    name: 'Aminata Diallo',
    email: 'aminata.d@yahoo.fr',
    phone: '0709123456',
    address: 'Cocody Angré 8ème tranche',
    orders: 8,
    totalSpent: 42000,
    lastOrder: '2025-01-15',
    rating: 4,
    avatar: 'AD',
  },
  {
    id: 3,
    name: 'Ibrahim Koné',
    email: 'ibrahim.kone@hotmail.com',
    phone: '0507123456',
    address: 'Yopougon Siporex',
    orders: 5,
    totalSpent: 28000,
    lastOrder: '2025-01-14',
    rating: 5,
    avatar: 'IK',
  },
  {
    id: 4,
    name: 'Sarah Yao',
    email: 'sarah.yao@gmail.com',
    phone: '0102345678',
    address: 'Marcory Zone 4',
    orders: 15,
    totalSpent: 120000,
    lastOrder: '2025-01-15',
    rating: 5,
    avatar: 'SY',
  },
  {
    id: 5,
    name: 'Moussa Traoré',
    email: 'moussa.t@orange.ci',
    phone: '0708123456',
    address: 'Abobo Baoulé',
    orders: 3,
    totalSpent: 15000,
    lastOrder: '2025-01-10',
    rating: 3,
    avatar: 'MT',
  },
  {
    id: 6,
    name: 'Fatou Bamba',
    email: 'fatou.bamba@gmail.com',
    phone: '0506123456',
    address: 'Treichville Avenue 13',
    orders: 20,
    totalSpent: 180000,
    lastOrder: '2025-01-13',
    rating: 5,
    avatar: 'FB',
  },
];

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState(mockCustomers);
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

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    customer.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = customers.reduce((acc, c) => acc + c.totalSpent, 0);
  const avgOrders = (customers.reduce((acc, c) => acc + c.orders, 0) / customers.length).toFixed(1);

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
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">Gérez votre base de clients</p>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total clients</p>
              <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Commandes moy.</p>
              <p className="text-2xl font-bold text-green-600">{avgOrders}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-100 rounded-lg flex items-center justify-center">
              <Star className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Revenu total</p>
              <p className="text-2xl font-bold text-accent-600">{(totalRevenue / 1000).toFixed(0)}K FCFA</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Clients fidèles</p>
              <p className="text-2xl font-bold text-yellow-600">
                {customers.filter(c => c.orders >= 10).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recherche */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Liste des clients */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Contact</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Adresse</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Commandes</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Dépensé</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Dernière cmd</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map((customer, index) => (
                <motion.tr
                  key={customer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {customer.avatar}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-xs text-gray-500">{customer.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{customer.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 max-w-xs">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{customer.address}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-gray-900">{customer.orders}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-primary-600">{customer.totalSpent.toLocaleString()} FCFA</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>{customer.lastOrder}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < customer.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">Aucun client trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}