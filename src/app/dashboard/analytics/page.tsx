'use client';

import { useCallback, useEffect, useState } from 'react';
import { LienRetour } from '@/components/ui/Bouton';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { useBoutique, uuidBoutiqueCourante } from '@/lib/boutique';
import { croissanceRevenu, dansLaPeriode, fenetrePeriode } from '@/lib/periodeAnalyse';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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
} from 'lucide-react';
import EcranDeChargement from '@/components/dashboard/EcranDeChargement';

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
  nom_livreur?: string | null;
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
};

export default function AnalyticsPage() {
  const router = useRouter();
  const { boutiqueId: boutiqueSlug } = useBoutique();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalClients: 0,
    avgOrderValue: 0,
    revenueGrowth: null as number | null,
  });
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyPoint[]>([]);
  const [statusData, setStatusData] = useState<StatusPoint[]>([]);
  const [driverPerformance, setDriverPerformance] = useState<DriverPerformance[]>([]);

  const loadAnalytics = useCallback(async () => {
    const user = await utilisateurCourant();
    if (!user) {
      router.push('/login');
      return;
    }

    const uuid = await uuidBoutiqueCourante(boutiqueSlug);
    if (!uuid) {
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
      .eq('boutique_id', uuid)
      .neq('statut', 'annulee')
      // Une commande jamais confirmee n'est pas une vente : l'inclure gonflerait
      // le chiffre d'affaires d'un panier que personne n'a valide.
      .neq('statut', 'abandonnee')
      .order('created_at', { ascending: true });

    if (!commandes) {
      setLoading(false);
      return;
    }

    /**
     * LA PERIODE CHOISIE S'APPLIQUE ICI, ET NULLE PART AILLEURS.
     *
     * Le selecteur existait, il etait relie a `useState`, il relancait bien ce
     * chargement — et AUCUNE requete ni AUCUN calcul ne le lisait. « Cette
     * semaine », « Ce mois » et « Cette annee » rendaient les memes chiffres.
     * Un controle qui pretend filtrer et ne filtre pas est pire qu'un controle
     * absent : le marchand croit avoir mesure sa semaine.
     *
     * On garde `toutes` pour la comparaison avec la periode precedente, qui a
     * besoin de ce qui precede la fenetre.
     */
    const toutes = commandes as CommandeData[];
    const fenetre = fenetrePeriode(period);
    const typedCommandes = dansLaPeriode(toutes, fenetre);

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

    /**
     * LA CROISSANCE COMPARE DEUX PERIODES, ET NON DEUX MOITIES DE LISTE.
     *
     * L'ancien calcul coupait les commandes EN DEUX PAR LE NOMBRE et comparait
     * le chiffre d'affaires des N/2 dernieres a celui des N/2 premieres, quelle
     * que soit leur date. Mesure du 2 septembre 2026 : 7 commandes d'aout,
     * 11 000 F contre 18 500 F, affiche « +68,2 % » — un artefact de
     * decoupage. Sur un nombre impair la seconde moitie compte une commande de
     * plus : le chiffre penchait a la hausse par construction.
     *
     * `null` quand la periode precedente est vide : zero se lirait « je
     * stagne » alors que la verite est « il n'y a rien a comparer ».
     */
    const revenueGrowth = croissanceRevenu(toutes, fenetre);

    const statusCounts = typedCommandes.reduce<Record<string, number>>((acc, commande) => {
      acc[commande.statut] = (acc[commande.statut] || 0) + 1;
      return acc;
    }, {});

    setStatusData([
      { name: 'Livrées', value: statusCounts.livree || 0 },
      { name: 'En cours', value: statusCounts.en_livraison || 0 },
      { name: 'En attente', value: statusCounts.en_attente || 0 },
    ]);

    // Ce panneau affichait « Livreur 1 / 2 / 3 », des livraisons calculees
    // depuis le total (totalOrders / 3) et des notes ecrites en dur —
    // 4,6 / 4,4 / 4,2. C est la faute que la refonte du 11 aout avait
    // chassee de la vitrine, restee vivante ici parce qu aucun lien ne
    // menait a cette page.
    //
    // On compte donc les vraies livraisons par nom de livreur. La note
    // disparait : personne ne la mesure.
    const parLivreur = new Map<string, number>();
    for (const commande of typedCommandes) {
      if (commande.statut !== 'livree') continue;
      const nom = (commande.nom_livreur ?? '').trim();
      if (!nom) continue;
      parLivreur.set(nom, (parLivreur.get(nom) ?? 0) + 1);
    }
    setDriverPerformance(
      [...parLivreur.entries()]
        .map(([name, deliveries]) => ({ name, deliveries }))
        .sort((a, b) => b.deliveries - a.deliveries)
        .slice(0, 5),
    );

    setStats({
      totalRevenue,
      totalOrders,
      totalClients: uniqueClients,
      avgOrderValue,
      revenueGrowth,
    });

    setLoading(false);
    // `period` EST UNE DEPENDANCE, ET L'OUBLIER ANNULAIT TOUT LE CORRECTIF.
    //
    // Sans elle, `loadAnalytics` reste la fermeture creee au premier rendu et
    // continue de lire la periode INITIALE. L'effet se relance bien a chaque
    // changement — il en depend — mais rappelle une fonction figee : le
    // selecteur aurait continue de ne rien changer, exactement comme avant.
    //
    // Trouve par un avertissement de lint, pas par un test. Deuxieme fois du
    // 2 septembre 2026 qu'un correctif juste arrive mal cable.
  }, [router, boutiqueSlug, period]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadAnalytics, period]);

  // Cinq familles de la maison, une par part : mangue, indigo, feuille,
  // bissap, chaux. Elles se distinguent entre elles sans convoquer de
  // teinte qui ne veut rien dire ici.
  // Ces trois parts ne sont pas des series : ce sont des ETATS, et elles
  // reprennent le code couleur des autres ecrans — feuille quand c est livre,
  // indigo quand c est en rue, mangue quand ca attend chez le commercant.
  //
  // Passees au validateur (all-pairs, surface blanche) : bande de clarte OK,
  // separation daltonienne 9,3 au pire, vision normale 19,1, contraste OK.
  // Seul echec, la chromie de l indigo : AUCUN pas du nuancier « indigo de
  // teinture » n atteint le plancher de 0,10 — c est une couleur de structure,
  // pas d identite. Chaque part portant son libelle en clair, la couleur ne
  // travaille jamais seule.
  const COULEURS_STATUT = ['#1f9a70', '#55679f', '#a76518'];

  // Une seule serie par graphique : elle prend la couleur de l argent, comme
  // le prix sur la vitrine et la courbe de l accueil. Varier la teinte d un
  // graphique a l autre ferait chercher un sens qui n existe pas.
  const SERIE = '#c4123f';

  if (loading) {
    return (
      <EcranDeChargement annonce="Chargement du pilotage…" />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au tableau de bord</LienRetour>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-nuit-900">Pilotage détaillé</h1>
            <p className="text-chaux-600 mt-1">Ce que vos chiffres disent de la période choisie.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="px-4 py-2 border border-[var(--hairline)] focus:ring-2 focus:ring-mangue-500"
            >
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          icon={DollarSign}
          label="Chiffre d'affaires"
          value={stats.totalRevenue.toLocaleString('fr-FR')}
          unite="FCFA"
          growth={stats.revenueGrowth}
          color="mangue"
        />
        <KPICard
          icon={ShoppingCart}
          label="Total commandes"
          value={stats.totalOrders}
          color="nuit"
        />
        <KPICard
          icon={Users}
          label="Clients uniques"
          value={stats.totalClients}
          color="feuille"
        />
        <KPICard
          icon={Package}
          label="Panier moyen"
          value={Math.round(stats.avgOrderValue).toLocaleString('fr-FR')}
          unite="FCFA"
          color="nuit"
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Évolution du CA */}
        <div className="bg-white p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-mangue-600" />
            Évolution du chiffre d&apos;affaires
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd3" />
              <XAxis dataKey="date" stroke="#837e70" />
              <YAxis stroke="#837e70" tickFormatter={(v: number) => v.toLocaleString('fr-FR')} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#f8f7f3', borderRadius: '8px', border: '1px solid #e0ddd3' }}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke={SERIE}
                strokeWidth={2}
                dot={{ fill: SERIE, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Produits */}
        <div className="bg-white p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-mangue-600" />
            Top 5 des produits les plus vendus
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProducts} margin={{ bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd3" />
              <XAxis
                dataKey="name"
                stroke="#837e70"
                angle={-25}
                textAnchor="end"
                interval={0}
                height={60}
                tick={{ fontSize: 12 }}
                // Recharts ne tronque pas : a 360 px, cinq noms complets se
                // superposaient en un pate illisible sous les barres. Le nom
                // entier reste dans l infobulle.
                tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
              />
              <YAxis stroke="#837e70" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#f8f7f3', borderRadius: '8px', border: '1px solid #e0ddd3' }}
              />
              <Bar dataKey="ventes" fill={SERIE} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heures de pointe */}
      <div className="bg-white p-6 border border-[var(--hairline)] mb-8">
        <h3 className="text-lg font-bold text-nuit-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-mangue-600" />
          Heures de pointe (commandes par heure)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0ddd3" />
            <XAxis dataKey="hour" stroke="#837e70" />
            <YAxis stroke="#837e70" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#f8f7f3', borderRadius: '8px', border: '1px solid #e0ddd3' }}
            />
            <Bar dataKey="orders" fill={SERIE} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Répartition par statut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4">Répartition des commandes</h3>
          <div className="space-y-4">
            {statusData.map((etat, index) => {
              const total = statusData.reduce((somme, e) => somme + e.value, 0) || 1;
              const pct = Math.round((etat.value / total) * 100);
              return (
                <div key={etat.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-semibold text-nuit-800">
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0"
                        style={{ backgroundColor: COULEURS_STATUT[index] }}
                      />
                      {etat.name}
                    </span>
                    <span className="font-bold text-nuit-800">
                      {etat.value} · {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden bg-chaux-100">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, backgroundColor: COULEURS_STATUT[index] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 border border-[var(--hairline)]">
          <h3 className="text-lg font-bold text-nuit-900 mb-4">Livraisons par livreur</h3>
          {driverPerformance.length === 0 && (
            <p className="text-sm text-chaux-600">
              Aucune livraison rattachée à un livreur sur cette période.
            </p>
          )}
          <div className="space-y-4">
            {driverPerformance.map((driver) => (
              <div key={driver.name} className="flex items-center justify-between p-3 bg-chaux-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-mangue-100 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-mangue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-nuit-900">{driver.name}</p>
                    <p className="text-xs text-chaux-600">{driver.deliveries} livraison{driver.deliveries > 1 ? 's' : ''}</p>
                  </div>
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
  /** Detachee du nombre : elle ne doit pas le faire passer a la ligne. */
  unite?: string;
  /**
   * `null` VEUT DIRE « RIEN A COMPARER », et se tait — la puce disparait.
   * Afficher 0 % ferait lire « je stagne » a un marchand dont la periode
   * precedente etait simplement vide.
   */
  growth?: number | null;
  color: 'mangue' | 'nuit' | 'feuille';
};

function KPICard({ icon: Icon, label, value, unite, growth, color }: KPICardProps) {
  // « purple » rendait de l indigo : un nom de couleur qui ment finit par
  // etre choisi pour ce qu il dit, pas pour ce qu il montre.
  const colors: Record<string, string> = {
    mangue: 'bg-mangue-50 text-mangue-600',
    nuit: 'bg-nuit-50 text-nuit-600',
    feuille: 'bg-accent-50 text-accent-600',
  };

  return (
    <div className="bg-white p-6 border border-[var(--hairline)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-chaux-600 mb-1">{label}</p>
          <p className="text-2xl font-bold leading-tight text-nuit-900">
            {value}
            {unite && <span className="ml-1 text-sm font-semibold text-chaux-600">{unite}</span>}
          </p>
          {growth !== undefined && growth !== null && (
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${
              growth >= 0 ? 'text-accent-600' : 'text-bissap-600'
            }`}>
              {growth >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
            </div>
          )}
        </div>
        <div className={`p-3 ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}