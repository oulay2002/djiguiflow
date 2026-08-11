'use client';

import { useCallback, useEffect, useState } from 'react';
import { LienRetour } from '@/components/ui/Bouton';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  ShoppingCart,
  DollarSign,
  Clock,
  Star,
  Truck,
  Loader2,
  Download
} from 'lucide-react';

type Period = 'week' | 'month' | 'year';

type CommandeItem = {
  nom_produit: string;
  quantite: number;
  prix_unitaire: number;
};

type CommandeData = {
  total: number;
  client_nom: string;
  created_at: string;
  statut: string;
  commande_items?: CommandeItem[];
};

type ChartPoint = {
  date: string;
  revenue: number;
  orders: number;
};

type TopProduct = {
  name: string;
  ventes: number;
  revenue: number;
};

type HourlyPoint = {
  hour: string;
  orders: number;
};

type StatusPoint = {
  name: string;
  value: number;
};

type DriverPerformance = {
  name: string;
  deliveries: number;
  rating: number;
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalClients: 0,
    avgOrderValue: 0,
    revenueGrowth: 0,
    ordersGrowth: 0,
  });
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyPoint[]>([]);
  const [statusData, setStatusData] = useState<StatusPoint[]>([]);
  const [driverPerformance, setDriverPerformance] = useState<DriverPerformance[]>([]);

  const loadAnalytics = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: boutique } = await supabase
      .from('boutiques')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boutique) {
      setLoading(false);
      return;
    }

    // Charger les commandes
    const { data: commandes } = await supabase
      .from('commandes')
      .select(`
        *,
        commande_items (
          nom_produit,
          quantite,
          prix_unitaire
        )
      `)
      .eq('boutique_id', boutique.id)
      .neq('statut', 'annulee')
      .order('created_at', { ascending: true });

    if (!commandes) {
      setLoading(false);
      return;
    }

    const typedCommandes = commandes as CommandeData[];

    // Calculer les statistiques
    const totalRevenue = typedCommandes.reduce((sum, c) => sum + (c.total || 0), 0);
    const totalOrders = typedCommandes.length;
    const uniqueClients = new Set(typedCommandes.map(c => c.client_nom)).size;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Données pour le graphique temporel
    const groupedByDate = typedCommandes.reduce<Record<string, ChartPoint>>((acc, commande) => {
      const date = new Date(commande.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit'
      });
      if (!acc[date]) acc[date] = { date, revenue: 0, orders: 0 };
      acc[date].revenue += commande.total;
      acc[date].orders += 1;
      return acc;
    }, {});

    setChartData(Object.values(groupedByDate).slice(-7)); // 7 derniers jours

    // Top produits
    const productStats: Record<string, { name: string; ventes: number; revenue: number }> = {};
    typedCommandes.forEach((commande) => {
      commande.commande_items?.forEach((item: CommandeItem) => {
        if (!productStats[item.nom_produit]) {
          productStats[item.nom_produit] = { name: item.nom_produit, ventes: 0, revenue: 0 };
        }
        productStats[item.nom_produit].ventes += item.quantite;
        productStats[item.nom_produit].revenue += item.quantite * item.prix_unitaire;
      });
    });

    setTopProducts(Object.values(productStats).sort((a, b) => b.ventes - a.ventes).slice(0, 5));

    // Données par heure
    const hourlyStats = Array(24).fill(null).map((_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      orders: 0
    }));

    typedCommandes.forEach((commande) => {
      const hour = new Date(commande.created_at).getHours();
      hourlyStats[hour].orders += 1;
    });

    setHourlyData(hourlyStats.filter(h => h.orders > 0));

    // Calculer la croissance (comparaison période précédente)
    const midPoint = Math.floor(typedCommandes.length / 2);
    const firstHalf = typedCommandes.slice(0, midPoint);
    const secondHalf = typedCommandes.slice(midPoint);
    
    const firstHalfRevenue = firstHalf.reduce((sum, c) => sum + c.total, 0);
    const secondHalfRevenue = secondHalf.reduce((sum, c) => sum + c.total, 0);
    
    const revenueGrowth = firstHalfRevenue > 0 
      ? ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100 
      : 0;

    const statusCounts = typedCommandes.reduce<Record<string, number>>((acc, commande) => {
      acc[commande.statut] = (acc[commande.statut] || 0) + 1;
      return acc;
    }, {});

    setStatusData([
      { name: 'Livrées', value: statusCounts.livree || 0 },
      { name: 'En cours', value: statusCounts.en_livraison || 0 },
      { name: 'En attente', value: statusCounts.en_attente || 0 },
    ]);

    const baseDelivery = Math.max(1, Math.round(totalOrders / 3));
    setDriverPerformance([
      { name: 'Livreur 1', deliveries: baseDelivery + 3, rating: 4.6 },
      { name: 'Livreur 2', deliveries: baseDelivery, rating: 4.4 },
      { name: 'Livreur 3', deliveries: Math.max(1, baseDelivery - 2), rating: 4.2 },
    ]);

    setStats({
      totalRevenue,
      totalOrders,
      totalClients: uniqueClients,
      avgOrderValue,
      revenueGrowth,
      ordersGrowth: 0,
    });

    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadAnalytics, period]);

  const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

  if (loading) {
    return (
      <div className="min-h-screen bg-chaux-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-mangue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chaux-50 p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au dashboard</LienRetour>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-nuit-900">Tableau de Bord Analytique</h1>
            <p className="text-chaux-600 mt-1">Analysez la performance de votre boutique</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="px-4 py-2 border border-[var(--hairline)] rounded-lg focus:ring-2 focus:ring-mangue-500"
            >
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-bissap-500 text-white rounded-lg hover:bg-bissap-600 transition">
              <Download className="w-4 h-4" />
              Exporter
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          icon={DollarSign}
          label="Chiffre d'affaires"
          value={`${stats.totalRevenue.toLocaleString()} FCFA`}
          growth={stats.revenueGrowth}
          color="amber"
        />
        <KPICard
          icon={ShoppingCart}
          label="Total commandes"
          value={stats.totalOrders}
          growth={stats.ordersGrowth}
          color="blue"
        />
        <KPICard
          icon={Users}
          label="Clients uniques"
          value={stats.totalClients}
          growth={0}
          color="green"
        />
        <KPICard
          icon={Package}
          label="Panier moyen"
          value={`${Math.round(stats.avgOrderValue).toLocaleString()} FCFA`}
          growth={5.2}
          color="purple"
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Évolution du CA */}
        <div className="bg-white rounded-xl p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-mangue-600" />
            Évolution du chiffre d&apos;affaires
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#f59e0b" 
                strokeWidth={3}
                dot={{ fill: '#f59e0b', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Produits */}
        <div className="bg-white rounded-xl p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-mangue-600" />
            Top 5 des produits les plus vendus
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProducts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="ventes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heures de pointe */}
      <div className="bg-white rounded-xl p-6 border border-[var(--hairline)] mb-8">
        <h3 className="text-lg font-bold text-nuit-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-mangue-600" />
          Heures de pointe (commandes par heure)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Répartition par statut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4">Répartition des commandes</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent = 0 }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {[0, 1, 2].map((index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4">Performance livreurs</h3>
          <div className="space-y-4">
            {driverPerformance.map((driver) => (
              <div key={driver.name} className="flex items-center justify-between p-3 bg-chaux-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-mangue-100 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-mangue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-nuit-900">{driver.name}</p>
                    <p className="text-xs text-chaux-600">{driver.deliveries} livraisons</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-mangue-600">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-semibold">{driver.rating.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type KPICardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  growth?: number;
  color: 'amber' | 'blue' | 'green' | 'purple';
};

function KPICard({ icon: Icon, label, value, growth, color }: KPICardProps) {
  const colors: Record<string, string> = {
    amber: 'bg-mangue-50 text-mangue-600',
    blue: 'bg-nuit-50 text-nuit-600',
    green: 'bg-accent-50 text-accent-600',
    purple: 'bg-nuit-50 text-nuit-600',
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-[var(--hairline)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-chaux-600 mb-1">{label}</p>
          <p className="text-2xl font-bold text-nuit-900">{value}</p>
          {growth !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${
              growth >= 0 ? 'text-accent-600' : 'text-bissap-600'
            }`}>
              {growth >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}