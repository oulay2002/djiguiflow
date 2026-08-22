'use client';

import { useEffect, useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Shield,
  KeyRound,
  LogOut,
  Eye,
  EyeOff,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

type Message = { type: 'success' | 'error'; text: string };

const LONGUEUR_MINIMALE = 6;

export default function SecuritePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [email, setEmail] = useState('');
  const [afficherMdp, setAfficherMdp] = useState(false);

  const [form, setForm] = useState({
    actuel: '',
    nouveau: '',
    confirmation: '',
  });

  useEffect(() => {
    const charger = async () => {
      const user = await utilisateurCourant();
      if (!user) {
        router.push('/login');
        return;
      }
      setEmail(user.email ?? '');
      setLoading(false);
    };

    charger();
  }, [router]);

  const changerMotDePasse = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (form.nouveau.length < LONGUEUR_MINIMALE) {
      setMessage({
        type: 'error',
        text: `Le nouveau mot de passe doit contenir au moins ${LONGUEUR_MINIMALE} caractères`,
      });
      return;
    }

    if (form.nouveau !== form.confirmation) {
      setMessage({ type: 'error', text: 'Les deux nouveaux mots de passe ne correspondent pas' });
      return;
    }

    if (form.nouveau === form.actuel) {
      setMessage({ type: 'error', text: 'Le nouveau mot de passe est identique à l’ancien' });
      return;
    }

    setSaving(true);

    // Supabase accepte updateUser({password}) sur la seule foi de la session
    // ouverte : sans cette re-authentification, un telephone laisse deverrouille
    // suffirait a changer le mot de passe du marchand.
    const { error: erreurAuth } = await supabase.auth.signInWithPassword({
      email,
      password: form.actuel,
    });

    if (erreurAuth) {
      setMessage({ type: 'error', text: 'Mot de passe actuel incorrect' });
      setSaving(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: form.nouveau });

    if (error) {
      setMessage({ type: 'error', text: `Erreur — ${error.message}` });
      setSaving(false);
      return;
    }

    setForm({ actuel: '', nouveau: '', confirmation: '' });
    setMessage({ type: 'success', text: 'Mot de passe modifié !' });
    setSaving(false);
  };

  const deconnecterPartout = async () => {
    setDeconnexionEnCours(true);
    // scope 'global' revoque tous les refresh tokens du compte : le geste utile
    // apres un vol de telephone, la ou un signOut ordinaire ne ferme que l'onglet.
    await supabase.auth.signOut({ scope: 'global' });
    router.push('/login');
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
        <h1 className="font-display text-3xl font-bold text-nuit-900">Sécurité</h1>
        <p className="text-chaux-600 mt-1">Votre mot de passe, et les appareils connectés à ce compte.</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 flex items-start gap-3 ${
              message.type === 'success'
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : 'bg-bissap-50 text-bissap-700 border border-bissap-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <span className="font-medium">{message.text}</span>
          </motion.div>
        )}

        {/* Mot de passe */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 border border-chaux-200"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-nuit-50">
              <KeyRound className="w-6 h-6 text-nuit-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-nuit-900">Mot de passe</h2>
              <p className="text-sm text-chaux-600">Compte : {email}</p>
            </div>
          </div>

          <form onSubmit={changerMotDePasse} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1">
                Mot de passe actuel
              </label>
              <div className="relative">
                <input
                  type={afficherMdp ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={form.actuel}
                  onChange={(e) => setForm({ ...form, actuel: e.target.value })}
                  className="w-full px-4 py-2.5 pr-12 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                />
                <button
                  type="button"
                  onClick={() => setAfficherMdp(!afficherMdp)}
                  aria-label={afficherMdp ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-chaux-400 hover:text-nuit-600"
                >
                  {afficherMdp ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type={afficherMdp ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.nouveau}
                onChange={(e) => setForm({ ...form, nouveau: e.target.value })}
                className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
              />
              <p className="text-xs text-chaux-600 mt-1">
                {LONGUEUR_MINIMALE} caractères minimum.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-nuit-700 mb-1">
                Confirmez le nouveau mot de passe
              </label>
              <input
                type={afficherMdp ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.confirmation}
                onChange={(e) => setForm({ ...form, confirmation: e.target.value })}
                className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
              />
            </div>

            <button type="submit" disabled={saving} className={`${classesBouton('action')} px-8`}>
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Modification...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Changer le mot de passe
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 border border-chaux-200"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-bissap-50">
              <Shield className="w-6 h-6 text-bissap-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-nuit-900">Sessions actives</h2>
              <p className="text-sm text-chaux-600">
                Déconnectez tous les appareils connectés à ce compte
              </p>
            </div>
          </div>

          <p className="text-sm text-chaux-600 mb-4">
            Utile si vous avez perdu votre téléphone ou utilisé un appareil partagé. Vous devrez
            vous reconnecter partout, y compris ici.
          </p>

          <button
            type="button"
            onClick={deconnecterPartout}
            disabled={deconnexionEnCours}
            className={classesBouton('calme')}
          >
            {deconnexionEnCours ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Déconnexion...
              </>
            ) : (
              <>
                <LogOut className="w-5 h-5" />
                Déconnecter tous les appareils
              </>
            )}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
