'use client';

import { useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import BoutonGoogle from '@/components/ui/BoutonGoogle';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

/**
 * L'ouverture d'une boutique, en bulletin d'inscription.
 *
 * Meme composition que la connexion et que la vitrine : bandeau indigo,
 * couture, et le bon pose sur le papier. Les champs perdent leurs icones
 * interieures — elles ne servaient qu'a meubler, et le libelle au-dessus dit
 * deja ce qu'on attend.
 */

/** Le fond de page, pour que les encoches du bon soient de vrais trous. */
const FOND_PAGE = '#eeece5';

const CHAMP =
  'w-full border border-[var(--hairline)] bg-white px-3 py-3 text-sm text-nuit-800 ' +
  'outline-none transition placeholder:text-chaux-400 focus:border-nuit-400';

const LIBELLE =
  'mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-chaux-600';

const TYPES_COMMERCE = [
  { valeur: 'restaurant', libelle: 'Restaurant / Fast-food' },
  { valeur: 'boutique', libelle: 'Boutique / Vêtements' },
  { valeur: 'pharmacie', libelle: 'Pharmacie' },
  { valeur: 'service', libelle: 'Service à domicile' },
  { valeur: 'epicerie', libelle: 'Épicerie / Supermarché' },
  { valeur: 'autre', libelle: 'Autre' },
];

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
      setError('Les deux mots de passe ne sont pas identiques.');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
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
      setSuccess('Compte créé. Ouvrez votre email pour confirmer votre adresse.');
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="indigo-weave relative bg-nuit-900 px-4 pb-9 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <LienRetour href="/">Retour à l&apos;accueil</LienRetour>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-mangue-300 sm:text-[11px]">
            30 jours offerts · sans carte bancaire
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-black leading-[1.05] sm:text-4xl">
            Ouvrir ma boutique
          </h1>
        </div>
        <div className="perf-line absolute inset-x-0 bottom-0 text-white" aria-hidden />
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-10">
        <div
          className="slip-in relative border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow sm:p-8"
          style={{ ['--tear-bg' as string]: FOND_PAGE }}
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-chaux-600">
            Bulletin d&apos;inscription
          </p>
          <div className="tear absolute inset-x-0 top-14 sm:top-16" />

          <div className="mt-9">
            <BoutonGoogle libelle="S’inscrire avec Google" forme="carree" />
          </div>

          <p className="mt-3 text-center text-xs text-chaux-600">
            Vous renseignerez votre boutique juste après, dans Réglages → Boutique.
          </p>

          {/* La couture entre les deux façons d'entrer. Le mot reste : une
              perforation separe, elle ne dit pas qu'on choisit. */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="perf-line absolute inset-x-0 text-nuit-900" aria-hidden />
            <span className="relative bg-chaux-50 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-chaux-600">
              ou
            </span>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="fullName" className={LIBELLE}>Nom complet</label>
              <input
                id="fullName" name="fullName" type="text" autoComplete="name"
                value={formData.fullName} onChange={handleChange} required
                className={CHAMP} placeholder="Moussa Koné"
              />
            </div>

            <div>
              <label htmlFor="email" className={LIBELLE}>Email</label>
              <input
                id="email" name="email" type="email" autoComplete="email"
                value={formData.email} onChange={handleChange} required
                className={CHAMP} placeholder="vous@exemple.com"
              />
            </div>

            <div>
              <label htmlFor="phone" className={LIBELLE}>Téléphone</label>
              <input
                id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel"
                value={formData.phone} onChange={handleChange} required
                className={CHAMP} placeholder="07 00 00 00 00"
              />
            </div>

            <div>
              <label htmlFor="businessName" className={LIBELLE}>Nom du commerce</label>
              <input
                id="businessName" name="businessName" type="text"
                value={formData.businessName} onChange={handleChange} required
                className={CHAMP} placeholder="Restaurant Le Palmier"
              />
            </div>

            <div>
              <label htmlFor="businessType" className={LIBELLE}>Type de commerce</label>
              <select
                id="businessType" name="businessType"
                value={formData.businessType} onChange={handleChange}
                className={CHAMP}
              >
                {TYPES_COMMERCE.map((t) => (
                  <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="password" className={LIBELLE}>Mot de passe</label>
              <div className="relative">
                <input
                  id="password" name="password" autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password} onChange={handleChange} required
                  className={`${CHAMP} pr-12`} placeholder="••••••••"
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

            <div>
              <label htmlFor="confirmPassword" className={LIBELLE}>Confirmer le mot de passe</label>
              <input
                id="confirmPassword" name="confirmPassword" autoComplete="new-password"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword} onChange={handleChange} required
                className={CHAMP} placeholder="••••••••"
              />
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
              {loading ? 'Ouverture…' : 'Ouvrir ma boutique'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-chaux-600">
          Vous avez déjà un compte ?{' '}
          <Link href="/login" className="font-bold text-bissap-600 underline underline-offset-2 hover:text-bissap-700">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
