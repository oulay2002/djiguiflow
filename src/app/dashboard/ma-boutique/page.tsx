'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  Save, 
  Upload, 
  Store, 
  MapPin, 
  Phone, 
  Tag, 
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

export default function MaBoutiquePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    zone: '',
    categorie: 'Restaurant',
    telephone: '',
    logo_url: ''
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  useEffect(() => {
    const checkAuthAndLoadBoutique = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      const { data } = await supabase
        .from('boutiques')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setFormData({
          nom: data.nom || '',
          description: data.description || '',
          zone: data.zone || '',
          categorie: data.categorie || 'Restaurant',
          telephone: data.telephone || '',
          logo_url: data.logo_url || ''
        });
        setLogoPreview(data.logo_url || '');
      }
      setLoading(false);
    };

    checkAuthAndLoadBoutique();
  }, [router]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setMessage(null);

    let finalLogoUrl = formData.logo_url;

    if (logoFile) {
      try {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = `boutiques/logos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, logoFile);

        if (uploadError) {
          setMessage({ type: 'error', text: 'Erreur upload logo' });
          setSaving(false);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);
        
        finalLogoUrl = publicUrl;
      } catch {
        setMessage({ type: 'error', text: 'Erreur upload logo' });
        setSaving(false);
        return;
      }
    }

    const { data: existingBoutique } = await supabase
      .from('boutiques')
      .select('id')
      .eq('user_id', userId)
      .single();

    let error;

    if (existingBoutique) {
      const { error: updateError } = await supabase
        .from('boutiques')
        .update({
          nom: formData.nom,
          description: formData.description,
          zone: formData.zone,
          categorie: formData.categorie,
          telephone: formData.telephone,
          logo_url: finalLogoUrl
        })
        .eq('user_id', userId);
      
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('boutiques')
        .insert({
          user_id: userId,
          nom: formData.nom,
          description: formData.description,
          zone: formData.zone,
          categorie: formData.categorie,
          telephone: formData.telephone,
          logo_url: finalLogoUrl
        });
      
      error = insertError;
    }

    if (error) {
      setMessage({ type: 'error', text: 'Erreur sauvegarde' });
    } else {
      setMessage({ type: 'success', text: 'Boutique sauvegardée !' });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-amber-600 transition mb-2">
          <span>← Retour au dashboard</span>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Ma Boutique</h1>
        <p className="text-gray-600 mt-1">Configurez les informations de votre commerce</p>
      </div>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{message.text}</span>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 sticky top-6">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-600" />
                Logo de la boutique
              </h2>
              
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-md mb-4">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu data-URL / URL Supabase, next/image non configuré pour ces domaines
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                
                <label className="cursor-pointer px-4 py-2 bg-amber-50 text-amber-700 rounded-lg font-medium text-sm hover:bg-amber-100 transition flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Choisir une image
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoChange} 
                    className="hidden" 
                  />
                </label>
                <p className="text-xs text-gray-500 mt-2 text-center">PNG, JPG ou GIF (max 2MB)</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                Informations générales
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la boutique *</label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({...formData, nom: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Ex: Chez Aminata"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Décrivez votre boutique..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" /> Zone de livraison *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.zone}
                      onChange={(e) => setFormData({...formData, zone: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Ex: Cocody - Angré"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-400" /> Catégorie *
                    </label>
                    <select
                      value={formData.categorie}
                      onChange={(e) => setFormData({...formData, categorie: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                    >
                      <option value="Restaurant">Restaurant</option>
                      <option value="Maquis">Maquis</option>
                      <option value="Électronique">Électronique</option>
                      <option value="Santé">Santé</option>
                      <option value="Épicerie">Épicerie</option>
                      <option value="Mode">Mode</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" /> Téléphone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.telephone}
                    onChange={(e) => setFormData({...formData, telephone: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Ex: 0709123456"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Sauvegarde en cours...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Enregistrer ma boutique
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}