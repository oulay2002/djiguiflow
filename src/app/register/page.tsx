'use client';

import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, Store, User } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
    businessType: 'restaurant',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!isSupabaseConfigured) {
      setError('Configuration manquante: ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          phone: formData.phone,
          business_name: formData.businessName,
          business_type: formData.businessType,
        },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Compte créé avec succès ! Vérifiez votre email pour confirmer.');
    }

    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.18),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f5efe5_100%)] px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-primary-700">
            <ArrowLeft className="h-4 w-4" />
            <span>Retour à l&apos;accueil</span>
          </Link>

          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-xl font-black text-white shadow-lg shadow-primary-500/20">D</div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">DjiguiFlow</h1>
            <p className="mt-2 text-slate-600">Créez votre compte commerçant</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-[0_20px_60px_rgba(49,35,20,0.12)] backdrop-blur-xl">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-semibold text-slate-700">Nom complet</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} required className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="Moussa Koné" />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="votre@email.com" />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-semibold text-slate-700">Téléphone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} required className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="07 00 00 00 00" />
              </div>
            </div>

            <div>
              <label htmlFor="businessName" className="mb-1 block text-sm font-semibold text-slate-700">Nom du commerce</label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input id="businessName" name="businessName" type="text" value={formData.businessName} onChange={handleChange} required className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="Restaurant Le Palmier" />
              </div>
            </div>

            <div>
              <label htmlFor="businessType" className="mb-1 block text-sm font-semibold text-slate-700">Type de commerce</label>
              <select id="businessType" name="businessType" value={formData.businessType} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100">
                <option value="restaurant">Restaurant / Fast-food</option>
                <option value="boutique">Boutique / Vêtements</option>
                <option value="pharmacie">Pharmacie</option>
                <option value="service">Service à domicile</option>
                <option value="epicerie">Épicerie / Supermarché</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold text-slate-700">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleChange} required className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-12 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-semibold text-slate-700">Confirmer le mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={handleChange} required className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="••••••••" />
              </div>
            </div>

            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

            <button type="submit" disabled={loading} className="w-full rounded-full bg-gradient-to-r from-primary-600 to-primary-500 py-3.5 font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px] disabled:opacity-60">
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>

            <div className="text-center text-sm text-slate-600">
              Vous avez déjà un compte ?{' '}
              <Link href="/login" className="font-bold text-primary-700 transition hover:text-primary-800">Se connecter</Link>
            </div>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
