'use client';

import { useCallback, useEffect, useState } from 'react';
import { LienRetour } from '@/components/ui/Bouton';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
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
  X
} from 'lucide-react';
import NotificationToast from '@/components/NotificationToast';

/**
 * Les cinq etats d'une commande, dans les couleurs de la maison.
 *
 * Le systeme compte cinq teintes et leur assigne un role : mangue pour ce qui
 * est en cours, feuille pour ce qui est fait, bissap pour ce qui est urgent ou
 * annule, indigo pour la structure. Le cycle, lui, compte cinq etapes — il
 * fallait donc distinguer sans inventer une sixieme teinte.
 *
 * La coupure est celle du terrain : tant que la commande est chez le
 * commercant elle est en mangue, et se lit du pale au dense a mesure qu'elle
 * avance ; des qu'elle sort en rue elle passe a l'indigo. L'icone tranche le
 * reste — la casserole n'est pas le camion.
 */
const STATUS_CONFIG = {
  en_attente: {
    label: 'En attente',
    bg: 'bg-mangue-50',
    text: 'text-mangue-700',
    border: 'border-mangue-200',
    dot: 'bg-mangue-300',
    icon: Clock
  },
  en_preparation: {
    label: 'En préparation',
    bg: 'bg-mangue-100',
    text: 'text-mangue-700',
    border: 'border-mangue-300',
    dot: 'bg-mangue-500',
    icon: ChefHat
  },
  en_livraison: {
    label: 'En livraison',
    bg: 'bg-nuit-50',
    text: 'text-nuit-700',
    border: 'border-nuit-200',
    dot: 'bg-nuit-500',
    icon: Truck
  },
  livree: { 
    label: 'Livrée', 
    bg: 'bg-accent-50', 
    text: 'text-accent-700', 
    border: 'border-accent-200',
    dot: 'bg-accent-500',
    icon: CheckCircle 
  },
  annulee: { 
    label: 'Annulée', 
    bg: 'bg-bissap-50', 
    text: 'text-bissap-700', 
    border: 'border-bissap-200',
    dot: 'bg-bissap-500',
    icon: XCircle 
  },
};

const NEXT_STATUS = {
  en_attente: 'en_preparation',
  en_preparation: 'en_livraison',
  en_livraison: 'livree',
} as const;

type OrderStatus = keyof typeof STATUS_CONFIG;
type OrderFilter = 'toutes' | OrderStatus;

type CommandeItem = {
  id: string;
  nom_produit: string;
  quantite: number;
  prix_unitaire: number;
};

type Commande = {
  id: string;
  statut: OrderStatus;
  client_nom: string;
  client_telephone: string;
  client_adresse: string;
  total: number;
  created_at: string;
  commande_items?: CommandeItem[];
};

export default function OrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [filter, setFilter] = useState<OrderFilter>('toutes');
  const [search, setSearch] = useState('');
  const [selectedCommande, setSelectedCommande] = useState<Commande | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadCommandes = useCallback(async () => {
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

    const { data, error } = await supabase
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

    if (error) {
      console.error('Erreur chargement commandes:', error);
    }

    if (data) {
      setCommandes(data as Commande[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCommandes();
    }, 0);

    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(() => {
      void loadCommandes();
    }, 30000);

    // Écoute en temps réel des nouvelles commandes via Supabase Realtime
    const channel = supabase
      .channel('commandes-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'commandes',
        },
        (payload) => {
          console.log('Nouvelle commande detectee', payload);
          const newCommande = payload.new as Partial<Commande>;

          // Ajouter une notification visuelle + sonore
          window.addNotification?.({
            id: `cmd-${Date.now()}`,
            type: 'new-order',
            title: 'Nouvelle commande !',
            message: `${newCommande.client_nom || 'Client'} - ${newCommande.total?.toLocaleString() || 0} FCFA`,
          });

          // Recharger la liste
          void loadCommandes();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadCommandes]);

  const updateStatus = async (commandeId: string, newStatus: OrderStatus) => {
    setUpdating(commandeId);
    const { error } = await supabase
      .from('commandes')
      .update({ statut: newStatus })
      .eq('id', commandeId);

    if (!error) {
      setCommandes((current) => current.map(c => 
        c.id === commandeId ? { ...c, statut: newStatus } : c
      ));
      // Mettre à jour aussi dans le modal si ouvert
      setSelectedCommande((current) => current?.id === commandeId ? { ...current, statut: newStatus } : current);
    }
    setUpdating(null);
  };

  const openDetails = (commande: Commande) => {
    setSelectedCommande(commande);
    setShowModal(true);
  };

  // Statistiques
  const stats = {
    total: commandes.length,
    en_attente: commandes.filter(c => c.statut === 'en_attente').length,
    en_livraison: commandes.filter(c => c.statut === 'en_livraison').length,
    livree: commandes.filter(c => c.statut === 'livree').length,
    annulee: commandes.filter(c => c.statut === 'annulee').length,
    chiffre: commandes
      .filter(c => c.statut !== 'annulee')
      .reduce((sum, c) => sum + (c.total || 0), 0),
  };

  // Filtrage
  const filteredCommandes = commandes
    .filter(c => filter === 'toutes' || c.statut === filter)
    .filter(c => 
      search === '' || 
      c.client_nom?.toLowerCase().includes(search.toLowerCase()) ||
      c.id?.toLowerCase().includes(search.toLowerCase()) ||
      c.client_telephone?.includes(search)
    );

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-chaux-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-mangue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chaux-50 p-6 lg:p-8">
      <NotificationToast />
      {/* En-tête */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au dashboard</LienRetour>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-nuit-900">Gestion des Commandes</h1>
            <p className="text-chaux-600 mt-1">Suivez et gérez toutes vos commandes en temps réel</p>
          </div>
          {stats.en_attente > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-mangue-50 border border-mangue-200 rounded-full">
              <Bell className="w-4 h-4 text-mangue-600 animate-pulse" />
              <span className="text-sm font-semibold text-mangue-700">
                {stats.en_attente} nouvelle{stats.en_attente > 1 ? 's' : ''} à traiter
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-[var(--hairline)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-mangue-50 rounded-lg">
              <Package className="w-5 h-5 text-mangue-600" />
            </div>
            <div>
              <p className="text-xs text-chaux-600">Total</p>
              <p className="text-xl font-bold text-nuit-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--hairline)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-mangue-50 rounded-lg">
              <Clock className="w-5 h-5 text-mangue-600" />
            </div>
            <div>
              <p className="text-xs text-chaux-600">En attente</p>
              <p className="text-xl font-bold text-mangue-600">{stats.en_attente}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--hairline)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-nuit-50 rounded-lg">
              <Truck className="w-5 h-5 text-nuit-600" />
            </div>
            <div>
              <p className="text-xs text-chaux-600">En livraison</p>
              <p className="text-xl font-bold text-nuit-600">{stats.en_livraison}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-[var(--hairline)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <p className="text-xs text-chaux-600">Chiffre d&apos;affaires</p>
              <p className="text-xl font-bold text-accent-600">{stats.chiffre.toLocaleString()} F</p>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-xl border border-[var(--hairline)] p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-chaux-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par client, numéro ou téléphone..."
              className="w-full pl-10 pr-4 py-2.5 border border-[var(--hairline)] rounded-lg focus:ring-2 focus:ring-mangue-500 focus:border-transparent"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'toutes', label: 'Toutes', count: stats.total },
              { key: 'en_attente', label: 'En attente', count: stats.en_attente },
              { key: 'en_preparation', label: 'En préparation', count: commandes.filter(c => c.statut === 'en_preparation').length },
              { key: 'en_livraison', label: 'En livraison', count: stats.en_livraison },
              { key: 'livree', label: 'Livrées', count: stats.livree },
              { key: 'annulee', label: 'Annulées', count: stats.annulee },
            ] as { key: OrderFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  // Indigo, et non mangue : le filtre actif dit « c'est la vue
                  // que vous regardez », pas « attention ». Laisser la mangue
                  // ici la mettait en concurrence avec les etats qu'elle sert
                  // a signaler juste en dessous.
                  filter === key
                    ? 'bg-nuit-900 text-chaux-50'
                    : 'bg-chaux-50 text-nuit-700 hover:bg-chaux-100'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    filter === key ? 'bg-nuit-700 text-chaux-50' : 'bg-chaux-200 text-chaux-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tableau des commandes */}
      {filteredCommandes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[var(--hairline)] border-dashed">
          <Package className="w-16 h-16 text-chaux-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-nuit-900">
            {search || filter !== 'toutes' ? 'Aucune commande ne correspond' : 'Aucune commande pour le moment'}
          </h3>
          <p className="text-chaux-600 mt-1">
            {search || filter !== 'toutes' ? 'Essayez de modifier vos filtres' : 'Les nouvelles commandes apparaîtront ici automatiquement'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--hairline)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-chaux-50 border-b border-[var(--hairline)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-chaux-600 uppercase tracking-wider">N° Commande</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-chaux-600 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-chaux-600 uppercase tracking-wider">Articles</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-chaux-600 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-chaux-600 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-chaux-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-chaux-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nuit-100">
                {filteredCommandes.map((commande, index) => {
                  const statusConfig = STATUS_CONFIG[commande.statut as keyof typeof STATUS_CONFIG];
                  const StatusIcon = statusConfig.icon;
                  const nextStatus = NEXT_STATUS[commande.statut as keyof typeof NEXT_STATUS];

                  return (
                    <motion.tr
                      key={commande.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-chaux-50/50 transition"
                    >
                      <td className="px-6 py-4">
                        <span className="font-bold text-mangue-600">
                          #{commande.id.slice(0, 6).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-nuit-900">{commande.client_nom}</p>
                          <p className="text-xs text-chaux-600">{commande.client_telephone}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-chaux-600" />
                          <span className="text-sm text-nuit-700">
                            {commande.commande_items?.length || 0} article{(commande.commande_items?.length || 0) > 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-nuit-900">
                          {commande.total?.toLocaleString() || 0} FCFA
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-chaux-600">
                          {formatShortDate(commande.created_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Bouton voir détails */}
                          <button
                            onClick={() => openDetails(commande)}
                            className="p-2 text-chaux-600 hover:bg-chaux-100 rounded-lg transition"
                            title="Voir les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          {/* Bouton action rapide (statut suivant) */}
                          {nextStatus && (
                            <button
                              onClick={() => updateStatus(commande.id, nextStatus as OrderStatus)}
                              disabled={updating === commande.id}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                                commande.statut === 'en_attente' 
                                  ? 'bg-nuit-50 text-nuit-700 hover:bg-nuit-100'
                                  : commande.statut === 'en_preparation'
                                  ? 'bg-nuit-50 text-nuit-700 hover:bg-nuit-100'
                                  : 'bg-accent-50 text-accent-700 hover:bg-accent-100'
                              } disabled:opacity-50`}
                              title={`Passer à: ${STATUS_CONFIG[nextStatus as keyof typeof STATUS_CONFIG].label}`}
                            >
                              {updating === commande.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <StatusIcon className="w-3.5 h-3.5" />
                              )}
                              {commande.statut === 'en_attente' ? 'Préparer' : 
                               commande.statut === 'en_preparation' ? 'Livrer' : 'Terminer'}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de détails */}
      <AnimatePresence>
        {showModal && selectedCommande && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              {/* Header du modal */}
              <div className="sticky top-0 bg-white border-b border-[var(--hairline)] p-6 flex justify-between items-start z-10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold text-nuit-900">
                      Commande #{selectedCommande.id.slice(0, 6).toUpperCase()}
                    </h2>
                    {(() => {
                      const sc = STATUS_CONFIG[selectedCommande.statut as keyof typeof STATUS_CONFIG];
                      const SI = sc.icon;
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text} border ${sc.border}`}>
                          <SI className="w-3.5 h-3.5" />
                          {sc.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-chaux-600">
                    Passée le {formatDate(selectedCommande.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-chaux-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-chaux-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Informations client */}
                <div className="bg-chaux-50 rounded-xl p-4">
                  <h3 className="font-semibold text-nuit-900 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-mangue-600" />
                    Informations client
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-chaux-600" />
                      <div>
                        <p className="text-xs text-chaux-600">Nom</p>
                        <p className="font-medium text-nuit-900">{selectedCommande.client_nom}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-chaux-600" />
                      <div>
                        <p className="text-xs text-chaux-600">Téléphone</p>
                        <p className="font-medium text-nuit-900">{selectedCommande.client_telephone}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm md:col-span-2">
                      <MapPin className="w-4 h-4 text-chaux-600 mt-0.5" />
                      <div>
                        <p className="text-xs text-chaux-600">Adresse de livraison</p>
                        <p className="font-medium text-nuit-900">{selectedCommande.client_adresse}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Articles commandés */}
                <div>
                  <h3 className="font-semibold text-nuit-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-mangue-600" />
                    Articles commandés
                  </h3>
                  <div className="space-y-2">
                    {selectedCommande.commande_items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-chaux-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 bg-mangue-100 text-mangue-700 rounded text-xs font-bold">
                            x{item.quantite}
                          </span>
                          <span className="font-medium text-nuit-900">{item.nom_produit}</span>
                        </div>
                        <span className="font-semibold text-nuit-900">
                          {((item.quantite || 0) * (item.prix_unitaire || 0)).toLocaleString()} FCFA
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="flex justify-between items-center p-4 bg-mangue-50 border border-mangue-200 rounded-xl">
                  <span className="font-semibold text-nuit-700">Total de la commande</span>
                  <span className="text-2xl font-bold text-mangue-600">
                    {selectedCommande.total?.toLocaleString() || 0} FCFA
                  </span>
                </div>

                {/* Actions de changement de statut */}
                <div className="border-t border-[var(--hairline)] pt-4">
                  <h3 className="font-semibold text-nuit-900 mb-3">Actions rapides</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(NEXT_STATUS).map(([current, next]) => {
                      if (selectedCommande.statut !== current) return null;
                      const nextConfig = STATUS_CONFIG[next as keyof typeof STATUS_CONFIG];
                      const NextIcon = nextConfig.icon;
                      return (
                        <button
                          key={next}
                          onClick={() => {
                            updateStatus(selectedCommande.id, next as OrderStatus);
                          }}
                          disabled={updating === selectedCommande.id}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${nextConfig.bg} ${nextConfig.text} hover:opacity-80`}
                        >
                          {updating === selectedCommande.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <NextIcon className="w-4 h-4" />
                          )}
                          Passer à : {nextConfig.label}
                        </button>
                      );
                    })}
                    
                    {selectedCommande.statut !== 'annulee' && selectedCommande.statut !== 'livree' && (
                      <button
                        onClick={() => {
                          if (confirm('Êtes-vous sûr de vouloir annuler cette commande ?')) {
                            updateStatus(selectedCommande.id, 'annulee');
                          }
                        }}
                        disabled={updating === selectedCommande.id}
                        className="flex items-center justify-center gap-2 px-4 py-3 border border-bissap-200 text-bissap-600 rounded-lg text-sm font-semibold hover:bg-bissap-50 transition disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Annuler la commande
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}