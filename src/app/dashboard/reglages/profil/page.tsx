'use client';

import { useEffect, useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

type Message = { type: 'success' | 'error' | 'info'; text: string };

export default function ProfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Email de la session au chargement : sert de temoin pour ne declencher la
  // procedure de changement d'adresse (qui passe par un mail de confirmation)
  // que si le marchand l'a reellement modifie.
  const [emailInitial, setEmailInitial] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    business_name: '',
    email: '',
  });

  useEffect(() => {
    const charger = async () => {
      const user = await utilisateurCourant();
      if (!user) {
        router.push('/login');
        return;
      }

      // Le projet n'a pas de table « profiles » : l'identite du marchand vit
      // dans les metadonnees du compte, telles que posees a l'inscription.
      const meta = user.user_metadata ?? {};
      setEmailInitial(user.email ?? '');
      setFormData({
        full_name: typeof meta.full_name === 'string' ? meta.full_name : '',
        phone: typeof meta.phone === 'string' ? meta.phone : '',
        business_name: typeof meta.business_name === 'string' ? meta.business_name : '',
        email: user.email ?? '',
      });
      setLoading(false);
    };

    charger();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: formData.full_name,
        phone: formData.phone,
        business_name: formData.business_name,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: `Erreur — ${error.message}` });
      setSaving(false);
      return;
    }

    const emailModifie = formData.email.trim() !== emailInitial;

    if (emailModifie) {
      // Appel separe : Supabase n'applique la nouvelle adresse qu'apres clic
      // sur le lien envoye par mail. La grouper avec les metadonnees ferait
      // croire a une sauvegarde immediate.
      const { error: erreurEmail } = await supabase.auth.updateUser({
        email: formData.email.trim(),
      });

      if (erreurEmail) {
        setMessage({
          type: 'error',
          text: `Informations enregistrées, mais l'email n'a pas changé — ${erreurEmail.message}`,
        });
        setSaving(false);
        return;
      }

      setMessage({
        type: 'info',
        text: `Informations enregistrées. Un lien de confirmation a été envoyé à ${formData.email.trim()} : votre adresse changera après le clic.`,
      });
      setSaving(false);
      return;
    }

    setMessage({ type: 'success', text: 'Profil mis à jour !' });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-nuit-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <LienRetour href="/dashboard/reglages">Retour aux réglages</LienRetour>
        <h1 className="font-display text-3xl font-bold text-nuit-900">Profil</h1>
        <p className="text-chaux-600 mt-1">Votre nom, votre numéro et votre email.</p>
      </div>

      <div className="max-w-4xl mx-auto">
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 flex items-start gap-3 ${
              message.type === 'success'
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : message.type === 'info'
                  ? 'bg-mangue-50 text-mangue-700 border border-mangue-200'
                  : 'bg-bissap-50 text-bissap-700 border border-bissap-200'
            }`}
          >
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <span className="font-medium">{message.text}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="bg-white p-6 border border-chaux-200 space-y-4">
            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                <User className="w-4 h-4 text-chaux-400" /> Nom complet
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                placeholder="Ex: Aminata Koné"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                <Phone className="w-4 h-4 text-chaux-400" /> Téléphone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                placeholder="Ex: 0709123456"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-chaux-400" /> Nom commercial
              </label>
              <input
                type="text"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                placeholder="Ex: Chez Aminata"
              />
              <p className="text-xs text-chaux-600 mt-1">
                Le nom affiché aux clients se règle dans{' '}
                <span className="font-medium">Réglages → Boutique</span>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                <Mail className="w-4 h-4 text-chaux-400" /> Email de connexion
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                placeholder="vous@exemple.com"
              />
              <p className="text-xs text-chaux-600 mt-1">
                Changer d&apos;adresse demande une confirmation par email.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`${classesBouton('action')} mt-6 px-8`}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Enregistrer
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
