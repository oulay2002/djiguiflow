'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Edit,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  Truck,
} from 'lucide-react';
import Link from 'next/link';

type DriverStatus = 'disponible' | 'en_livraison' | 'indisponible';

interface Driver {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  status: DriverStatus;
  deliveries: number;
  rating: number;
  zone: string;
  avatar: string;
}

const statusConfig: Record<DriverStatus, { label: string; color: string }> = {
  disponible: { label: 'Disponible', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  en_livraison: { label: 'En livraison', color: 'bg-sky-100 text-sky-700 border border-sky-200' },
  indisponible: { label: 'Indisponible', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

const getStatusConfig = (status: DriverStatus) => statusConfig[status];

const mockDrivers: Driver[] = [
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

export default function DriversPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>(mockDrivers);
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

  const filteredDrivers = drivers.filter(
    (driver) =>
      driver.name.toLowerCase().includes(search.toLowerCase()) ||
      driver.zone.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f4ec] flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/dashboard" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-primary-700">
              <ArrowLeft className="h-4 w-4" />
              <span>Retour au dashboard</span>
            </Link>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Livreurs</h1>
            <p className="mt-2 text-slate-600">Gérez votre équipe de livraison avec efficacité.</p>
          </div>

          <button className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-6 py-3 font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px]">
            <Plus className="h-5 w-5" />
            Ajouter un livreur
          </button>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Total livreurs',
              value: drivers.length,
              icon: Truck,
              iconClass: 'bg-primary-100 text-primary-700',
            },
            {
              label: 'Disponibles',
              value: drivers.filter((d) => d.status === 'disponible').length,
              icon: CheckCircle,
              iconClass: 'bg-emerald-100 text-emerald-700',
            },
            {
              label: 'En livraison',
              value: drivers.filter((d) => d.status === 'en_livraison').length,
              icon: Clock,
              iconClass: 'bg-sky-100 text-sky-700',
            },
            {
              label: 'Note moyenne',
              value: `${(drivers.reduce((acc, d) => acc + d.rating, 0) / drivers.length).toFixed(1)}/5`,
              icon: Star,
              iconClass: 'bg-amber-100 text-amber-600',
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass-panel rounded-[1.5rem] p-5">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.iconClass}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">{stat.label}</p>
                    <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-8 rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher un livreur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredDrivers.map((driver, index) => {
            const config = getStatusConfig(driver.status);

            return (
              <motion.div
                key={driver.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.08 }}
                className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(48,35,20,0.12)]"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-black text-white shadow-lg shadow-primary-500/20">
                      {driver.avatar}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{driver.name}</h3>
                      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pb-5">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{driver.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Truck className="h-4 w-4 text-slate-400" />
                    <span>{driver.vehicle}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span>{driver.zone}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center">
                    <p className="text-2xl font-black text-slate-900">{driver.deliveries}</p>
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Livraisons</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 px-3 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <p className="text-2xl font-black text-slate-900">{driver.rating}</p>
                    </div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Note</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filteredDrivers.length === 0 && (
          <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 py-12 text-center">
            <p className="text-slate-500">Aucun livreur trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}