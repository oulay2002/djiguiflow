'use client';

import { Suspense, useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import BoutonGoogle from '@/components/ui/BoutonGoogle';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { cheminInterneSur } from '@/lib/redirection';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * L'entree du marchand, en bon d'acces.
 *
 * La page etait une carte flottante sur un degrade peche, avec une tuile
 * degradee portant un « D » : le formulaire de connexion que produit n'importe
 * quel gabarit, et qui ne ressemblait a aucun autre ecran du produit. Le
 * marchand y decide pourtant si l'outil est serieux.
 *
 * C'est donc le meme objet que partout ailleurs — un bon, perfore en haut,
 * pose sur le papier chaux. Et la perforation remplace le sempiternel « OU » :
 * deux entrees separees par une vraie couture, ce que le trait gris ne disait
 * pas.
 */

/** Le fond de page, pour que les encoches du bon soient de vrais trous. */
const FOND_PAGE = '#eeece5';

const MESSAGES_OAUTH: Record<string, string> = {
  oauth: "La connexion Google n'a pas abouti. Réessayez ou utilisez votre mot de passe.",
  oauth_refuse: 'Connexion Google annulée.',
};

const CHAMP =
  'w-full border border-[var(--hairline)] bg-white px-3 py-3 text-sm text-nuit-800 ' +
  'outline-none transition placeholder:text-chaux-400 focus:border-nuit-400';

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
      setSuccess('Connexion réussie, redirection…');
      setTimeout(() => {
        window.location.href = suite;
      }, 1500);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* La meme composition que la vitrine et le carnet de commandes : un
          bandeau indigo, une couture, et le papier en dessous. C'est a ca que
          le marchand doit reconnaitre qu'il est chez lui. */}
      <header className="indigo-weave relative bg-nuit-900 px-4 pb-9 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <LienRetour href="/">Retour à l&apos;accueil</LienRetour>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-mangue-300 sm:text-[11px]">
            Espace marchand
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-black leading-[1.05] sm:text-4xl">
            DjiguiFlow
          </h1>
        </div>
        <div className="perf-line absolute inset-x-0 bottom-0 text-white" aria-hidden />
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-10">
        <div
          className="slip-in relative border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow sm:p-8"
          style={{ ['--tear-bg' as string]: FOND_PAGE }}
        >
          {/* Le talon du bon, au-dessus de la perforation. */}
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-chaux-600">
            Connexion
          </p>
          <div className="tear absolute inset-x-0 top-14 sm:top-16" />

          {erreurOAuth && (
            <p role="alert" className="mt-5 border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
              {erreurOAuth}
            </p>
          )}

          <div className="mt-9">
            <BoutonGoogle suite={suite} libelle="Se connecter avec Google" forme="carree" />
          </div>

          {/* La couture entre les deux façons d'entrer. Le mot reste : une
              perforation separe, elle ne dit pas qu'on choisit. */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="perf-line absolute inset-x-0 text-nuit-900" aria-hidden />
            <span className="relative bg-chaux-50 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-chaux-600">
              ou
            </span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-chaux-600">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={CHAMP}
                placeholder="vous@exemple.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-chaux-600">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${CHAMP} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-chaux-600 transition hover:text-nuit-800"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
                {success}
              </p>
            )}

            <button type="submit" disabled={loading} className={`${classesBouton('action', 'md', 'carree')} w-full`}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>

        {/* Le meme mot que sur l'accueil : une action garde son nom d'un bout
            a l'autre du parcours. */}
        <p className="mt-6 text-center text-sm text-chaux-600">
          Pas encore de compte ?{' '}
          <Link href="/register" className="font-bold text-bissap-600 underline underline-offset-2 hover:text-bissap-700">
            Ouvrir ma boutique
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12">
          <p className="font-mono text-sm text-chaux-600">Chargement…</p>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
