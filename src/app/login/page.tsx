'use client';

import { Suspense, useState } from 'react';
import { LienRetour } from '@/components/ui/Bouton';
import BoutonGoogle from '@/components/ui/BoutonGoogle';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { cheminInterneSur } from '@/lib/redirection';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const MESSAGES_OAUTH: Record<string, string> = {
  oauth: "La connexion Google n'a pas abouti. Réessayez ou utilisez votre mot de passe.",
  oauth_refuse: 'Connexion Google annulée.',
};

function LoginPageContent() {
  const searchParams = useSearchParams();
  const suite = cheminInterneSur(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const erreurOAuth = MESSAGES_OAUTH[searchParams.get('erreur') ?? ''] ?? '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!isSupabaseConfigured) {
      setError('Configuration manquante: ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
    } else {
      // `suite` est deja filtre : le `?next=` brut permettait d'expedier le
      // marchand sur un domaine tiers juste apres une connexion reussie.
      setSuccess('Connexion réussie ! Redirection...');
      setTimeout(() => {
        window.location.href = suite;
      }, 1500);
    }

    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.18),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f5efe5_100%)] px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="mb-8">
          <div className="mb-6">
            <LienRetour href="/">Retour à l&apos;accueil</LienRetour>
          </div>

          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-xl font-black text-white shadow-lg shadow-primary-500/20">D</div>
            <h1 className="text-3xl font-black tracking-tight text-nuit-900">DjiguiFlow</h1>
            <p className="mt-2 text-chaux-600">Connectez-vous à votre compte</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-[0_20px_60px_rgba(49,35,20,0.12)] backdrop-blur-xl">
          {erreurOAuth && (
            <div className="mb-5 rounded-xl border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
              {erreurOAuth}
            </div>
          )}

          <BoutonGoogle suite={suite} libelle="Se connecter avec Google" />

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-chaux-200" />
            <span className="text-xs font-semibold uppercase tracking-wide text-chaux-600">ou</span>
            <span className="h-px flex-1 bg-chaux-200" />
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-nuit-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-chaux-600" />
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-xl border border-[var(--hairline)] bg-chaux-50 py-3 pl-10 pr-4 text-nuit-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="votre@email.com" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-nuit-700">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-chaux-600" />
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded-xl border border-[var(--hairline)] bg-chaux-50 py-3 pl-10 pr-12 text-nuit-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-chaux-600 transition hover:text-chaux-600">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && <div className="rounded-xl border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">{error}</div>}
            {success && <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">{success}</div>}

            <button type="submit" disabled={loading} className="w-full rounded-full bg-gradient-to-r from-primary-600 to-primary-500 py-3.5 font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:translate-y-[-1px] disabled:opacity-60">
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            <div className="text-center text-sm text-chaux-600">
              Pas encore de compte ?{' '}
              <Link href="/register" className="font-bold text-primary-700 transition hover:text-primary-800">S&apos;inscrire</Link>
            </div>
          </form>
        </div>
      </motion.div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.18),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f5efe5_100%)] px-4 py-12">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
