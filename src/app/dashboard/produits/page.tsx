'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { 
  Plus, 
  Trash2, 
  Edit3,
  Package, 
  DollarSign, 
  Tag, 
  Image as ImageIcon,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ToggleLeft,
  ToggleRight,
  PackageCheck
} from 'lucide-react';
import Link from 'next/link';

type Produit = {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  stock: number;
  categorie: string;
  photo_url: string | null;
  disponible: boolean;
};

export default function ProduitsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [userId, setUserId] = useState<string | null>(null);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);

  // État du formulaire
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produit | null>(null);
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    prix: '',
    stock: '',
    categorie: 'Plat',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const checkAuthAndLoadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUserId(user.id);

    const { data: boutique } = await supabase
      .from('boutiques')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boutique) {
      setMessage({ type: 'error', text: 'Veuillez d\'abord créer votre boutique dans "Ma Boutique".' });
      setLoading(false);
      return;
    }

    setBoutiqueId(boutique.id);

    const { data: produitsData } = await supabase
      .from('produits')
      .select('*')
      .eq('boutique_id', boutique.id)
      .order('created_at', { ascending: false });

    if (produitsData) {
      setProduits(produitsData as Produit[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkAuthAndLoadData();
    }, 0);

    return () => clearTimeout(timer);
  }, [checkAuthAndLoadData]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ nom: '', description: '', prix: '', stock: '', categorie: 'Plat' });
    setImageFile(null);
    setImagePreview('');
    setShowModal(true);
  };

  const openEditModal = (produit: Produit) => {
    setEditingProduct(produit);
    setFormData({
      nom: produit.nom || '',
      description: produit.description || '',
      prix: produit.prix?.toString() || '',
      stock: produit.stock?.toString() || '',
      categorie: produit.categorie || 'Plat',
    });
    setImageFile(null);
    setImagePreview(produit.photo_url || '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !boutiqueId) return;

    setSaving(true);
    setMessage(null);
    let photoUrl = editingProduct?.photo_url || '';

    // Upload nouvelle image si présente
    if (imageFile) {
      try {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${boutiqueId}-${Date.now()}.${fileExt}`;
        const filePath = `produits/photos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);
        
        photoUrl = publicUrl;
      } catch {
        setMessage({ type: 'error', text: 'Erreur lors de l\'upload de l\'image.' });
        setSaving(false);
        return;
      }
    }

    const produitData = {
      boutique_id: boutiqueId,
      nom: formData.nom,
      description: formData.description,
      prix: parseFloat(formData.prix) || 0,
      stock: parseInt(formData.stock) || 0,
      categorie: formData.categorie,
      photo_url: photoUrl,
      disponible: editingProduct?.disponible ?? true
    };

    let error;
    if (editingProduct) {
      const { error: updateError } = await supabase
        .from('produits')
        .update(produitData)
        .eq('id', editingProduct.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('produits')
        .insert(produitData);
      error = insertError;
    }

    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
    } else {
      setMessage({ 
        type: 'success', 
        text: editingProduct ? 'Produit modifié avec succès !' : 'Produit ajouté avec succès !' 
      });
      setShowModal(false);
      checkAuthAndLoadData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;

    const { error } = await supabase.from('produits').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression.' });
    } else {
      setMessage({ type: 'success', text: 'Produit supprimé.' });
      setProduits(produits.filter(p => p.id !== id));
    }
  };

  const toggleDisponibilite = async (produit: Produit) => {
    const { error } = await supabase
      .from('produits')
      .update({ disponible: !produit.disponible })
      .eq('id', produit.id);

    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la modification.' });
    } else {
      setProduits(produits.map(p => 
        p.id === produit.id ? { ...p, disponible: !p.disponible } : p
      ));
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-amber-600 transition mb-2">
            <span>← Retour au dashboard</span>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Mes Produits</h1>
          <p className="text-gray-600 mt-1">Gérez le catalogue de votre boutique</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition shadow-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          Ajouter un produit
        </button>
      </div>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{message.text}</span>
        </motion.div>
      )}

      {produits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100 border-dashed">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">Aucun produit pour le moment</h3>
          <p className="text-gray-500 mt-1">Commencez par ajouter votre premier produit.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {produits.map((produit) => (
            <motion.div 
              key={produit.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(49,35,20,0.08)] transition hover:shadow-[0_16px_34px_rgba(49,35,20,0.12)]"
            >
              <div className="relative aspect-[4/3] border-b border-slate-100 bg-slate-50 sm:aspect-[16/10]">
                {produit.photo_url ? (
                  <Image
                    src={produit.photo_url}
                    alt={produit.nom}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover object-center"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">
                      <ImageIcon className="h-4 w-4" />
                      Image indisponible
                    </div>
                  </div>
                )}
                <button
                  onClick={() => toggleDisponibilite(produit)}
                  className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
                    produit.disponible 
                      ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {produit.disponible ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {produit.disponible ? 'Disponible' : 'Indisponible'}
                </button>
              </div>
              
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-extrabold text-slate-900">{produit.nom}</h3>
                  <span className="text-lg font-black text-slate-900">{produit.prix} FCFA</span>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-slate-600">{produit.description || 'Aucune description'}</p>
                
                <div className="flex items-center gap-2 mb-4 text-sm">
                  <PackageCheck className="h-4 w-4 text-slate-400" />
                  <span className={produit.stock === 0 ? 'font-semibold text-rose-700' : 'text-slate-600'}>
                    Stock: {produit.stock || 0} unités
                  </span>
                </div>
                
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                    {produit.categorie}
                  </span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => openEditModal(produit)}
                      className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                      title="Modifier"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(produit.id)}
                      className="rounded-xl p-2 text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Photo du produit</label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                      {imagePreview ? (
                        <Image
                          src={imagePreview}
                          alt="Preview"
                          fill
                          unoptimized
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                    <label className="cursor-pointer px-4 py-2 bg-amber-50 text-amber-700 rounded-lg font-medium text-sm hover:bg-amber-100 transition">
                      Choisir une image
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit *</label>
                  <input
                    type="text" required value={formData.nom}
                    onChange={(e) => setFormData({...formData, nom: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Ex: Poulet DG"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={2} value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Ingrédients, détails..."
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prix (FCFA) *</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number" required value={formData.prix}
                        onChange={(e) => setFormData({...formData, prix: e.target.value})}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock *</label>
                    <div className="relative">
                      <PackageCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number" required value={formData.stock}
                        onChange={(e) => setFormData({...formData, stock: e.target.value})}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <select
                        value={formData.categorie}
                        onChange={(e) => setFormData({...formData, categorie: e.target.value})}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                      >
                        <option value="Plat">Plat</option>
                        <option value="Boisson">Boisson</option>
                        <option value="Dessert">Dessert</option>
                        <option value="Accessoire">Accessoire</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button" onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit" disabled={saving}
                    className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    {saving ? 'Enregistrement...' : (editingProduct ? 'Modifier' : 'Ajouter')}
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