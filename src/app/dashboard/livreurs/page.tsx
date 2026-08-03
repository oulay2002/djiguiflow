'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck,
  User,
  Phone,
  Mail,
  Star,
  TrendingUp,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Bike,
  Car,
  Navigation,
  type LucideIcon,
  X
} from 'lucide-react';
import Link from 'next/link';

const TYPE_CONFIG = {
  interne: { label: 'Interne', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  independant: { label: 'Indépendant', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const STATUT_CONFIG = {
  disponible: { label: 'Disponible', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  en_livraison: { label: 'En livraison', color: 'bg-amber-100 text-amber-700', icon: Clock },
  indisponible: { label: 'Indisponible', color: 'bg-gray-100 text-gray-700', icon: XCircle },
};

const VEHICULE_ICONS = {
  moto: Bike,
  voiture: Car,
  velo: Bike,
};

type Livreur = {
  id: string;
  nom: string;
  telephone: string;
  email?: string;
  type: 'interne' | 'independant';
  statut: 'disponible' | 'en_livraison' | 'indisponible';
  vehicule_type?: string;
  vehicule_immatriculation?: string;
  note_moyenne: number;
  total_livraisons: number;
  gain_total: number;
  latitude?: number;
  longitude?: number;
};

export default function LivreursPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [filter, setFilter] = useState<'tous' | 'interne' | 'independant'>('tous');
  const [statutFilter] = useState<'tous' | 'disponible' | 'en_livraison' | 'indisponible'>('tous');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    telephone: '',
    email: '',
    type: 'interne' as 'interne' | 'independant',
    vehicule_type: 'moto',
    vehicule_immatriculation: '',
  });

  const loadLivreurs = useCallback(async () => {
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
      .from('livreurs')
      .select('*')
      .eq('boutique_id', boutique.id)
      .order('created_at', { ascending: false });

    if (data) {
      setLivreurs(data as Livreur[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLivreurs();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadLivreurs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: boutique } = await supabase
      .from('boutiques')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boutique) return;

    const { error } = await supabase
      .from('livreurs')
      .insert({
        boutique_id: boutique.id,
        ...formData,
      });

    if (!error) {
      setShowModal(false);
      setFormData({ nom: '', telephone: '', email: '', type: 'interne', vehicule_type: 'moto', vehicule_immatriculation: '' });
      loadLivreurs();
    }
  };

  const deleteLivreur = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce livreur ?')) return;
    
    await supabase.from('livreurs').delete().eq('id', id);
    loadLivreurs();
  };

  const toggleStatut = async (livreur: Livreur) => {
    const newStatut = livreur.statut === 'disponible' ? 'indisponible' : 'disponible';
    await supabase.from('livreurs').update({ statut: newStatut }).eq('id', livreur.id);
    loadLivreurs();
  };

  const filteredLivreurs = livreurs.filter(l => {
    const matchType = filter === 'tous' || l.type === filter;
    const matchStatut = statutFilter === 'tous' || l.statut === statutFilter;
    const matchSearch = search === '' || 
      l.nom.toLowerCase().includes(search.toLowerCase()) ||
      l.telephone.includes(search);
    return matchType && matchStatut && matchSearch;
  });

  const stats = {
    total: livreurs.length,
    disponibles: livreurs.filter(l => l.statut === 'disponible').length,
    en_livraison: livreurs.filter(l => l.statut === 'en_livraison').length,
    internes: livreurs.filter(l => l.type === 'interne').length,
    independants: livreurs.filter(l => l.type === 'independant').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
            {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-amber-600 transition mb-2">
          <span>← Retour au dashboard</span>
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Livreurs</h1>
            <p className="text-gray-600 mt-1">Gérez vos livreurs internes et indépendants</p>
          </div>
          
          {/* BOUTON ASSIGNATIONS - AJOUTEZ CECI */}
          <Link 
            href="/dashboard/livreurs/assignations"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            <Navigation className="w-4 h-4" />
            Assignations
          </Link>
          
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition shadow-lg font-medium"
          >
            <Plus className="w-5 h-5" />
            Ajouter un livreur
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard icon={Truck} label="Total livreurs" value={stats.total} color="amber" />
        <StatCard icon={CheckCircle} label="Disponibles" value={stats.disponibles} color="green" />
        <StatCard icon={Clock} label="En livraison" value={stats.en_livraison} color="purple" />
        <StatCard icon={User} label="Internes" value={stats.internes} color="blue" />
        <StatCard icon={TrendingUp} label="Indépendants" value={stats.independants} color="purple" />
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou téléphone..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['tous', 'interne', 'independant'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filter === type ? 'bg-amber-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {type === 'tous' ? 'Tous' : type === 'interne' ? 'Internes' : 'Indépendants'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste des livreurs */}
      {filteredLivreurs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 border-dashed">
          <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">Aucun livreur</h3>
          <p className="text-gray-500 mt-1">Commencez par ajouter votre premier livreur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLivreurs.map((livreur) => {
            const typeConfig = TYPE_CONFIG[livreur.type];
            const statutConfig = STATUT_CONFIG[livreur.statut];
            const VehiculeIcon = VEHICULE_ICONS[livreur.vehicule_type as keyof typeof VEHICULE_ICONS] || Bike;
            
            return (
              <motion.div
                key={livreur.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-lg">
                        {livreur.nom.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{livreur.nom}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${typeConfig}`}>
                            {typeConfig.label}
                          </span>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statutConfig.color}`}>
                            <statutConfig.icon className="w-3 h-3" />
                            {statutConfig.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button className="p-1 hover:bg-gray-100 rounded">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {livreur.telephone}
                    </div>
                    {livreur.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="w-4 h-4 text-gray-400" />
                        {livreur.email}
                      </div>
                    )}
                    {livreur.vehicule_type && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <VehiculeIcon className="w-4 h-4 text-gray-400" />
                        {livreur.vehicule_type.charAt(0).toUpperCase() + livreur.vehicule_type.slice(1)}
                        {livreur.vehicule_immatriculation && ` • ${livreur.vehicule_immatriculation}`}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4 pt-4 border-t border-gray-100">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-amber-600 font-bold">
                        <Star className="w-4 h-4 fill-current" />
                        {livreur.note_moyenne.toFixed(1)}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Note</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-gray-900">{livreur.total_livraisons}</p>
                      <p className="text-xs text-gray-500 mt-1">Livraisons</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-gray-900">{livreur.gain_total.toLocaleString()}F</p>
                      <p className="text-xs text-gray-500 mt-1">Gains</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleStatut(livreur)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                        livreur.statut === 'disponible'
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {livreur.statut === 'disponible' ? 'Rendre indisponible' : 'Rendre disponible'}
                    </button>
                    <button
                      onClick={() => {}}
                      title="Édition bientôt disponible"
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteLivreur(livreur.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Ajout Livreur */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Ajouter un livreur</h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type de livreur *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'interne' })}
                      className={`py-3 rounded-lg border-2 font-semibold transition ${
                        formData.type === 'interne'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Interne
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'independant' })}
                      className={`py-3 rounded-lg border-2 font-semibold transition ${
                        formData.type === 'independant'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Indépendant
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    placeholder="Ex: Kouamé Jean"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    placeholder="Ex: 0709123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    placeholder="Ex: jean@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type de véhicule *</label>
                  <select
                    value={formData.vehicule_type}
                    onChange={(e) => setFormData({ ...formData, vehicule_type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="moto">Moto</option>
                    <option value="voiture">Voiture</option>
                    <option value="velo">Vélo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                  <input
                    type="text"
                    value={formData.vehicule_immatriculation}
                    onChange={(e) => setFormData({ ...formData, vehicule_immatriculation: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    placeholder="Ex: AB-123-CD"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                  >
                    Ajouter
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
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