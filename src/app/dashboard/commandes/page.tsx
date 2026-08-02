'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  List,
  Bell,
  Clock,
  ChefHat,
  Truck,
  CheckCircle,
  XCircle,
  Package,
  User,
  Phone,
  MapPin,
  Eye,
  Loader2,
  TrendingUp,
  X,
  Search,
  ArrowUpDown,
  MoreVertical
} from 'lucide-react';
import Link from 'next/link';
import NotificationToast from '@/components/NotificationToast';

const STATUS_CONFIG = {
  en_attente: { 
    label: 'En attente', 
    bg: 'bg-amber-50', 
    text: 'text-amber-700', 
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    icon: Clock,
    color: 'amber'
  },
  en_preparation: { 
    label: 'En préparation', 
    bg: 'bg-blue-50', 
    text: 'text-blue-700', 
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: ChefHat,
    color: 'blue'
  },
  en_livraison: { 
    label: 'En livraison', 
    bg: 'bg-purple-50', 
    text: 'text-purple-700', 
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    icon: Truck,
    color: 'purple'
  },
  livree: { 
    label: 'Livrée', 
    bg: 'bg-green-50', 
    text: 'text-green-700', 
    border: 'border-green-200',
    dot: 'bg-green-500',
    icon: CheckCircle,
    color: 'green'
  },
  annulee: { 
    label: 'Annulée', 
    bg: 'bg-red-50', 
    text: 'text-red-700', 
    border: 'border-red-200',
    dot: 'bg-red-500',
    icon: XCircle,
    color: 'red'
  },
};

type Commande = {
  id: string;
  statut: keyof typeof STATUS_CONFIG;
  client_nom: string;
  client_telephone: string;
  client_adresse: string;
  total: number;
  created_at: string;
  commande_items?: Array<{
    id: string;
    nom_produit: string;
    quantite: number;
    prix_unitaire: number;
  }>;
};

export default function CommandesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCommande, setSelectedCommande] = useState<Commande | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    loadCommandes();
    
    const channel = supabase
      .channel('commandes-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'commandes',
      }, (payload) => {
        if ((window as any).addNotification) {
          (window as any).addNotification({
            id: `cmd-${Date.now()}`,
            type: 'new-order',
            title: ' Nouvelle commande !',
            message: `${(payload.new as any).client_nom} - ${(payload.new as any).total?.toLocaleString()} FCFA`,
          });
        }
        loadCommandes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCommandes = async () => {
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

    const { data } = await supabase
      .from('commandes')
      .select(`
        *,
        commande_items (
          id,
          nom_produit,
          quantite,
          prix_unitaire
        )
      `)
      .eq('boutique_id', boutique.id)
      .order('created_at', { ascending: false });

    if (data) {
      setCommandes(data as Commande[]);
    }
    setLoading(false);
  };

  const updateStatus = async (commandeId: string, newStatus: keyof typeof STATUS_CONFIG) => {
    const { error } = await supabase
      .from('commandes')
      .update({ statut: newStatus })
      .eq('id', commandeId);

    if (!error) {
      setCommandes(commandes.map(c => 
        c.id === commandeId ? { ...c, statut: newStatus } : c
      ));
    }
  };

  const handleDragStart = (e: React.DragEvent, commandeId: string) => {
    setDraggingId(commandeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: keyof typeof STATUS_CONFIG) => {
    e.preventDefault();
    if (draggingId) {
      await updateStatus(draggingId, targetStatus);
      setDraggingId(null);
    }
  };

  const stats = {
    total: commandes.length,
    en_attente: commandes.filter(c => c.statut === 'en_attente').length,
    en_preparation: commandes.filter(c => c.statut === 'en_preparation').length,
    en_livraison: commandes.filter(c => c.statut === 'en_livraison').length,
    livree: commandes.filter(c => c.statut === 'livree').length,
    chiffre: commandes.filter(c => c.statut !== 'annulee').reduce((sum, c) => sum + c.total, 0),
  };

  const filteredCommandes = commandes.filter(c => 
    search === '' || 
    c.client_nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.id?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <NotificationToast />
      
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-amber-600 transition mb-2">
          <span>← Retour au dashboard</span>
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Commandes</h1>
            <p className="text-gray-600 mt-1">Tableau de bord intelligent en temps réel</p>
          </div>
          
          {/* Toggle Vue */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  viewMode === 'kanban' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  viewMode === 'list' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <List className="w-4 h-4" />
                Liste
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard icon={Package} label="Total" value={stats.total} color="amber" />
        <StatCard icon={Clock} label="En attente" value={stats.en_attente} color="amber" />
        <StatCard icon={ChefHat} label="En prép." value={stats.en_preparation} color="blue" />
        <StatCard icon={Truck} label="En livraison" value={stats.en_livraison} color="purple" />
        <StatCard icon={TrendingUp} label="CA" value={`${stats.chiffre.toLocaleString()} F`} color="green" />
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une commande..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Vue Kanban */}
      {viewMode === 'kanban' ? (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {Object.entries(STATUS_CONFIG).map(([status, config]) => {
      const statusCommandes = filteredCommandes.filter(c => c.statut === status);
      return (
        <div
          key={status}
          onDragOver={handleDragOver}
          onDrop={(e: React.DragEvent) => handleDrop(e, status as keyof typeof STATUS_CONFIG)}
          className="bg-gray-100/50 rounded-xl p-4 min-h-[500px]"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <config.icon className={`w-5 h-5 ${config.text}`} />
              <h3 className="font-bold text-gray-900">{config.label}</h3>
            </div>
            <span className="px-2 py-1 bg-white rounded-full text-xs font-bold text-gray-700">
              {statusCommandes.length}
            </span>
          </div>
          
          <div className="space-y-3">
            {statusCommandes.map((commande) => (
              <div
                key={commande.id}
                draggable
                onDragStart={(e: React.DragEvent) => handleDragStart(e, commande.id)}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 cursor-move hover:shadow-md transition hover:scale-[1.02]"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-bold text-amber-600 text-sm">
                    #{commande.id.slice(0, 6).toUpperCase()}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedCommande(commande);
                      setShowModal(true);
                    }}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Eye className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">{commande.client_nom}</p>
                <p className="text-xs text-gray-500 mb-2">{commande.commande_items?.length || 0} articles</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">{commande.total.toLocaleString()} F</span>
                  <span className="text-xs text-gray-500">
                    {new Date(commande.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
) : (
  /* Vue Liste - reste inchangée */
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">N° Commande</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Articles</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCommandes.map((commande) => {
                const statusConfig = STATUS_CONFIG[commande.statut];
                return (
                  <tr key={commande.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-bold text-amber-600">#{commande.id.slice(0, 6).toUpperCase()}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{commande.client_nom}</p>
                      <p className="text-xs text-gray-500">{commande.client_telephone}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{commande.commande_items?.length || 0} articles</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{commande.total.toLocaleString()} FCFA</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(commande.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedCommande(commande);
                          setShowModal(true);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Détails (même code que précédemment) */}
      <AnimatePresence>
        {showModal && selectedCommande && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold">Commande #{selectedCommande.id.slice(0, 6).toUpperCase()}</h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-gray-600">Client: {selectedCommande.client_nom}</p>
                <p className="text-gray-600">Total: {selectedCommande.total.toLocaleString()} FCFA</p>
                {/* Ajoutez les autres détails ici */}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
  };
  
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}