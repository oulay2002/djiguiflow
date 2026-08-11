'use client';

import { useEffect, useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { supabase } from '@/lib/supabase';
import { BUCKET_IMAGES, dossierMarchand, nomFichierSain } from '@/lib/storage';
import { useBoutique } from '@/lib/boutique';
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

export default function MaBoutiquePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Boutique effectivement editee. Un compte peut en posseder plusieurs :
  // sans cet identifiant, la sauvegarde ecrirait dans toutes a la fois.
  const [boutiqueEditee, setBoutiqueEditee] = useState<string | null>(null);
  const [nbBoutiques, setNbBoutiques] = useState(0);

  // Slug choisi dans le selecteur du dashboard.
  const { boutiqueId: slugSelectionne, pret } = useBoutique();

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

      // .single() levait une erreur des que le compte possedait plus d'une
      // boutique, ce qui laissait la page vide. On lit la liste, puis on
      // retient celle du selecteur (a defaut, la premiere).
      const { data: boutiques } = await supabase
        .from('boutiques')
        .select('*')
        .eq('user_id', user.id)
        .order('nom', { ascending: true });

      const possedees = boutiques ?? [];
      setNbBoutiques(possedees.length);

      const data =
        (slugSelectionne ? possedees.find(b => b.slug === slugSelectionne) : null) ??
        possedees[0] ??
        null;

      if (data) {
        setBoutiqueEditee(data.id);
        setFormData({
          nom: data.nom || '',
          description: data.description || '',
          zone: data.zone || '',
          categorie: data.categorie || 'Restaurant',
          telephone: data.telephone || '',
          logo_url: data.logo_url || ''
        });
        setLogoPreview(data.logo_url || '');
      } else {
        // Aucune boutique : formulaire vierge de creation.
        setBoutiqueEditee(null);
        setFormData({ nom: '', description: '', zone: '', categorie: 'Restaurant', telephone: '', logo_url: '' });
        setLogoPreview('');
      }
      setLoading(false);
    };

    // Attendre le registre : sans lui, slugSelectionne est encore vide et on
    // chargerait la mauvaise boutique avant de la recharger aussitot.
    if (pret) checkAuthAndLoadBoutique();
  }, [router, pret, slugSelectionne]);

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
        // Dossier impose par les policies Storage : la boutique EDITEE si
        // elle existe deja, sinon le user_id (premiere creation, aucune
        // boutique en base).
        const dossier = boutiqueEditee ?? (await dossierMarchand());
        const filePath = `${dossier}/logos/${Date.now()}-${nomFichierSain(logoFile.name)}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_IMAGES)
          .upload(filePath, logoFile, {
            cacheControl: '3600',
            contentType: logoFile.type || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          setMessage({ type: 'error', text: `Erreur upload logo — ${uploadError.message}` });
          setSaving(false);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_IMAGES)
          .getPublicUrl(filePath);
        
        finalLogoUrl = publicUrl;
      } catch {
        setMessage({ type: 'error', text: 'Erreur upload logo' });
        setSaving(false);
        return;
      }
    }

    const champs = {
      nom: formData.nom,
      description: formData.description,
      zone: formData.zone,
      categorie: formData.categorie,
      telephone: formData.telephone,
      logo_url: finalLogoUrl,
    };

    let error;

    if (boutiqueEditee) {
      // Cible l'id, pas le user_id : filtrer sur user_id ecrasait d'un coup
      // TOUTES les boutiques du compte avec les memes valeurs.
      const { error: updateError } = await supabase
        .from('boutiques')
        .update(champs)
        .eq('id', boutiqueEditee);

      error = updateError;
    } else {
      const { data: creee, error: insertError } = await supabase
        .from('boutiques')
        .insert({ user_id: userId, ...champs })
        .select('id')
        .single();

      error = insertError;
      // Sans cela, un second enregistrement creerait une boutique de plus.
      if (creee) {
        setBoutiqueEditee(creee.id);
        setNbBoutiques(n => n + 1);
      }
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
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nuit-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 lg:p-8">
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au dashboard</LienRetour>
        <h1 className="font-display text-3xl font-bold text-nuit-900">Ma boutique</h1>
        <p className="text-chaux-600 mt-1">Configurez les informations de votre commerce</p>

        {nbBoutiques > 1 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-mangue-200 bg-mangue-50 px-3 py-2 text-sm text-mangue-700">
            <Store className="h-4 w-4 shrink-0" />
            Vous gérez {nbBoutiques} boutiques. Vous modifiez{' '}
            <span className="font-bold">{formData.nom || 'sans nom'}</span> — changez de boutique
            avec le sélecteur en haut de page.
          </p>
        )}
      </div>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-accent-50 text-accent-700 border border-accent-200'
              : 'bg-bissap-50 text-bissap-700 border border-bissap-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{message.text}</span>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-chaux-200 sticky top-6">
              <h2 className="font-bold text-nuit-900 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-nuit-500" />
                Logo de la boutique
              </h2>
              
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-full bg-chaux-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-md mb-4">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu data-URL / URL Supabase, next/image non configuré pour ces domaines
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-12 h-12 text-chaux-400" />
                  )}
                </div>
                
                <label className={`${classesBouton('calme', 'sm')} cursor-pointer`}>
                  <Upload className="w-4 h-4" />
                  Choisir une image
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoChange} 
                    className="hidden" 
                  />
                </label>
                <p className="text-xs text-chaux-600 mt-2 text-center">PNG, JPG ou GIF (max 2MB)</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-chaux-200">
              <h2 className="font-bold text-nuit-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-nuit-500" />
                Informations générales
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Nom de la boutique *</label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({...formData, nom: e.target.value})}
                    className="w-full px-4 py-2.5 border border-chaux-200 rounded-lg focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                    placeholder="Ex: Chez Aminata"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2.5 border border-chaux-200 rounded-lg focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                    placeholder="Décrivez votre boutique..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-chaux-400" /> Zone de livraison *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.zone}
                      onChange={(e) => setFormData({...formData, zone: e.target.value})}
                      className="w-full px-4 py-2.5 border border-chaux-200 rounded-lg focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                      placeholder="Ex: Cocody - Angré"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-chaux-400" /> Catégorie *
                    </label>
                    <select
                      value={formData.categorie}
                      onChange={(e) => setFormData({...formData, categorie: e.target.value})}
                      className="w-full px-4 py-2.5 border border-chaux-200 rounded-lg focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300 bg-white"
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
                  <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-chaux-400" /> Téléphone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.telephone}
                    onChange={(e) => setFormData({...formData, telephone: e.target.value})}
                    className="w-full px-4 py-2.5 border border-chaux-200 rounded-lg focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                    placeholder="Ex: 0709123456"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`${classesBouton('action')} w-full md:w-auto px-8`}
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