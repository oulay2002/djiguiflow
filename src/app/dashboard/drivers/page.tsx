'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Search,
  Plus,
  Edit,
  Trash2,
  Truck,
  Phone,
  Star,
  MapPin,
  CheckCircle,
  Clock
} from 'lucide-react';
import Link from 'next/link';

// Données de démonstration
const mockDrivers = [
  {
    id: 1,
    name: 'Jean Paul',
    phone: '0709123456',
    vehicle: 'Moto Yamaha 125',
    status: 'disponible',
    deliveries: 145,
    rating: 4.8,
    zone: 'Cocody - Plateau',
    avatar: 'JP',
  },
  {
    id: 2,
    name: 'Koffi',
    phone: '0507123456',
    vehicle: 'Moto Honda 150',
    status: 'en_livraison',
    deliveries: 98,
    rating: 4.6,
    zone: 'Yopougon - Abobo',
    avatar: 'KO',
  },
  {
    id: 3,
    name: 'Aminata',
    phone: '0102345678',
    vehicle: 'Vélo électrique',
    status: 'disponible',
    deliveries: 67,
    rating: 4.9,
    zone: 'Marcory - Treichville',
    avatar: 'AM',
  },
  {
    id: 4,
    name: 'Moussa',
    phone: '0708123456',
    vehicle: 'Moto Bajaj',
    status: 'indisponible',
    deliveries: 34,
    rating: 4.3,
    zone: 'Riviera - Angré',
    avatar: 'MO',
  },
];

const statusConfig = {
  disponible: { label: 'Disponible', color: 'bg-green-100 text-green-700' },
  en_livraison: { label: 'En livraison', color: 'bg-blue-100 text-blue-700' },
  indisponible: { label: 'Indisponible', color: 'bg-red-100 text-red-700' },
};

export default function DriversPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState(mockDrivers);
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

  const filteredDrivers = drivers.filter(driver =>
    driver.name.toLowerCase().includes(search.toLowerCase()) ||
    driver.zone.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-3xl font-bold text-gray-900">Livreurs</h1>
          <p className="text-gray-600 mt-1">Gérez votre équipe de livraison</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-lg">
          <Plus className="w-5 h-5" />
          Ajouter un livreur
        </button>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total livreurs</p>
              <p className="text-2xl font-bold text-gray-900">{drivers.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Disponibles</p>
              <p className="text-2xl font-bold text-green-600">
                {drivers.filter(d => d.status === 'disponible').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">En livraison</p>
              <p className="text-2xl font-bold text-blue-600">
                {drivers.filter(d => d.status === 'en_livraison').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Star className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Note moyenne</p>
              <p className="text-2xl font-bold text-yellow-600">
                {(drivers.reduce((acc, d) => acc + d.rating, 0) / drivers.length).toFixed(1)}/5
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
            placeholder="Rechercher un livreur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Liste des livreurs en cartes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrivers.map((driver, index) => {
          const config = statusConfig[driver.status];
          return (
            <motion.div
              key={driver.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition"
            >
              {/* En-tête carte */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {driver.avatar}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{driver.name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-2 hover:bg-blue-50 rounded-lg transition">
                    <Edit className="w-4 h-4 text-blue-600" />
                  </button>
                  <button className="p-2 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              {/* Infos */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{driver.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Truck className="w-4 h-4 text-gray-400" />
                  <span>{driver.vehicle}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{driver.zone}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{driver.deliveries}</p>
                  <p className="text-xs text-gray-500">Livraisons</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <p className="text-2xl font-bold text-gray-900">{driver.rating}</p>
                  </div>
                  <p className="text-xs text-gray-500">Note</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredDrivers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <p className="text-gray-500">Aucun livreur trouvé</p>
        </div>
      )}
    </div>
  );
}