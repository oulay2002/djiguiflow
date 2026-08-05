'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  User,
  MapPin,
  CheckCircle,
  Truck,
  Plus,
  X,
  Loader2,
  Phone,
  Star,
  AlertCircle,
  type LucideIcon
} from 'lucide-react';
import Link from 'next/link';

type Commande = {
  id: string;
  client_nom: string;
  client_telephone: string;
  client_adresse: string;
  total: number;
  statut: string;
  created_at: string;
  commande_items?: Array<{
    nom_produit: string;
    quantite: number;
  }>;
};

type Livreur = {
  id: string;
  nom: string;
  telephone: string;
  statut: 'disponible' | 'en_livraison' | 'indisponible';
  type: 'interne' | 'independant';
  note_moyenne: number;
  vehicule_type?: string;
};

type Livraison = {
  id: string;
  commande_id: string;
  livreur_id: string;
  statut: 'assignee' | 'en_cours' | 'livree' | 'annulee';
  date_assignation: string;
  livreur?: Livreur;
  // Seules ces colonnes sont demandees par le select embarque ci-dessous.
  commande?: Pick<
    Commande,
    'id' | 'client_nom' | 'client_telephone' | 'client_adresse' | 'total' | 'statut'
  >;
};

export default function AssignationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [filter, setFilter] = useState<'non_assignees' | 'en_cours' | 'livrees'>('non_assignees');
  const [showModal, setShowModal] = useState(false);
  const [selectedCommande, setSelectedCommande] = useState<Commande | null>(null);
  const [selectedLivreur, setSelectedLivreur] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const loadData = useCallback(async () => {
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
    const { data: commandesData } = await supabase
      .from('commandes')
      .select(`
        *,
        commande_items (
          nom_produit,
          quantite
        )
      `)
      .eq('boutique_id', boutique.id)
      .in('statut', ['en_preparation', 'en_livraison'])
      .order('created_at', { ascending: false });

    // Charger les livreurs disponibles
    const { data: livreursData } = await supabase
      .from('livreurs')
      .select('*')
      .eq('boutique_id', boutique.id)
      .in('statut', ['disponible', 'en_livraison']);

    // Charger les livraisons actives
    const { data: livraisonsData } = await supabase
      .from('livraisons')
      .select(`
        *,
        livreur:livreurs (
          id,
          nom,
          telephone,
          statut,
          type,
          note_moyenne,
          vehicule_type
        ),
        commande:commandes!inner (
          id,
          client_nom,
          client_telephone,
          client_adresse,
          total,
          statut
        )
      `)
      .eq('commande.boutique_id', boutique.id)
      .in('statut', ['assignee', 'en_cours']);

    if (commandesData) setCommandes(commandesData as Commande[]);
    if (livreursData) setLivreurs(livreursData as Livreur[]);
    if (livraisonsData) setLivraisons(livraisonsData as Livraison[]);
    
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadData]);

  const assignerLivreur = async () => {
    if (!selectedCommande || !selectedLivreur) return;

    setAssigning(true);
    
    const { error } = await supabase
      .from('livraisons')
      .insert({
        commande_id: selectedCommande.id,
        livreur_id: selectedLivreur,
        statut: 'assignee',
      });

    if (!error) {
      // Mettre à jour le statut de la commande
      await supabase
        .from('commandes')
        .update({ statut: 'en_livraison' })
        .eq('id', selectedCommande.id);

      // Mettre à jour le statut du livreur
      await supabase
        .from('livreurs')
        .update({ statut: 'en_livraison' })
        .eq('id', selectedLivreur);

      setShowModal(false);
      setSelectedCommande(null);
      setSelectedLivreur('');
      loadData();
    }
    
    setAssigning(false);
  };

  const updateLivraisonStatut = async (livraisonId: string, newStatut: string) => {
    const { error } = await supabase
      .from('livraisons')
      .update({ 
        statut: newStatut,
        date_livraison: newStatut === 'livree' ? new Date().toISOString() : null,
      })
      .eq('id', livraisonId);

    if (!error) {
      loadData();
    }
  };

  const commandesNonAssignees = commandes.filter(c => 
    !livraisons.some(l => l.commande_id === c.id)
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
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard/livreurs" className="inline-flex items-center gap-2 text-gray-600 hover:text-amber-600 transition mb-2">
          <span>← Retour aux livreurs</span>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Assignation des Livraisons</h1>
          <p className="text-gray-600 mt-1">Assignez les commandes aux livreurs disponibles</p>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard 
          icon={Package} 
          label="À assigner" 
          value={commandesNonAssignees.length} 
          color="amber"
        />
        <StatCard 
          icon={Truck} 
          label="En cours" 
          value={livraisons.filter(l => l.statut === 'en_cours').length} 
          color="blue"
        />
        <StatCard 
          icon={User} 
          label="Livreurs dispo" 
          value={livreurs.filter(l => l.statut === 'disponible').length} 
          color="green"
        />
        <StatCard 
          icon={CheckCircle} 
          label="Livrées aujourd&apos;hui" 
          value={livraisons.filter(l => l.statut === 'livree').length} 
          color="purple"
        />
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'non_assignees', label: 'À assigner', count: commandesNonAssignees.length },
          { key: 'en_cours', label: 'En cours', count: livraisons.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === key ? 'bg-amber-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Contenu */}
      {filter === 'non_assignees' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {commandesNonAssignees.map((commande) => (
            <motion.div
              key={commande.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">
                    Commande #{commande.id.slice(0, 6).toUpperCase()}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(commande.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold">
                  {commande.total.toLocaleString()} FCFA
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4 text-gray-400" />
                  {commande.client_nom}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {commande.client_telephone}
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  {commande.client_adresse}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Articles :</p>
                <div className="flex flex-wrap gap-2">
                  {commande.commande_items?.map((item, idx) => (
                    <span key={idx} className="px-2 py-1 bg-gray-50 text-gray-700 rounded text-xs">
                      {item.quantite}x {item.nom_produit}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedCommande(commande);
                  setShowModal(true);
                }}
                className="w-full py-2.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Assigner un livreur
              </button>
            </motion.div>
          ))}

          {commandesNonAssignees.length === 0 && (
            <div className="col-span-2 text-center py-16 bg-white rounded-xl border border-gray-100 border-dashed">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">Toutes les commandes sont assignées !</h3>
              <p className="text-gray-500 mt-1">Aucune commande en attente de livraison.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {livraisons.map((livraison) => (
            <motion.div
              key={livraison.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-bold text-gray-900">
                      Commande #{livraison.commande?.id.slice(0, 6).toUpperCase()}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      livraison.statut === 'assignee' ? 'bg-amber-50 text-amber-700' :
                      livraison.statut === 'en_cours' ? 'bg-blue-50 text-blue-700' :
                      'bg-green-50 text-green-700'
                    }`}>
                      {livraison.statut === 'assignee' ? 'Assignée' :
                       livraison.statut === 'en_cours' ? 'En cours' : 'Livrée'}
                    </span>
                  </div>

                  {livraison.livreur && (
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-amber-600" />
                        <span className="font-medium">{livraison.livreur.nom}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                          {livraison.livreur.type === 'interne' ? 'Interne' : 'Indépendant'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-amber-600">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {livraison.livreur.note_moyenne.toFixed(1)}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {livraison.commande?.client_adresse}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {livraison.statut === 'assignee' && (
                    <button
                      onClick={() => updateLivraisonStatut(livraison.id, 'en_cours')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                    >
                      Démarrer
                    </button>
                  )}
                  {livraison.statut === 'en_cours' && (
                    <button
                      onClick={() => updateLivraisonStatut(livraison.id, 'livree')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition"
                    >
                      Terminer
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal d&apos;assignation */}
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
                <h2 className="text-xl font-bold text-gray-900">Assigner un livreur</h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                {/* Résumé de la commande */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <h3 className="font-bold text-amber-900 mb-2">
                    Commande #{selectedCommande.id.slice(0, 6).toUpperCase()}
                  </h3>
                  <div className="space-y-1 text-sm text-amber-800">
                    <p><strong>Client :</strong> {selectedCommande.client_nom}</p>
                    <p><strong>Adresse :</strong> {selectedCommande.client_adresse}</p>
                    <p><strong>Total :</strong> {selectedCommande.total.toLocaleString()} FCFA</p>
                  </div>
                </div>

                {/* Liste des livreurs disponibles */}
                <h3 className="font-semibold text-gray-900 mb-3">Livreurs disponibles</h3>
                <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                  {livreurs.filter(l => l.statut === 'disponible').map((livreur) => (
                    <label
                      key={livreur.id}
                      className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition ${
                        selectedLivreur === livreur.id
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="livreur"
                          value={livreur.id}
                          checked={selectedLivreur === livreur.id}
                          onChange={(e) => setSelectedLivreur(e.target.value)}
                          className="w-4 h-4 text-amber-600"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">{livreur.nom}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                              {livreur.note_moyenne.toFixed(1)}
                            </span>
                            <span>•</span>
                            <span>{livreur.vehicule_type || 'Moto'}</span>
                            <span>•</span>
                            <span className={livreur.type === 'interne' ? 'text-blue-600' : 'text-purple-600'}>
                              {livreur.type === 'interne' ? 'Interne' : 'Indépendant'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Phone className="w-4 h-4 text-gray-400" />
                    </label>
                  ))}

                  {livreurs.filter(l => l.statut === 'disponible').length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>Aucun livreur disponible pour le moment</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={assignerLivreur}
                  disabled={!selectedLivreur || assigning}
                  className="w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {assigning ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Assignation en cours...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Confirmer l&apos;assignation
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
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