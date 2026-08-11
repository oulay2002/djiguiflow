'use client';

import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { cheminInterneSur } from '@/lib/redirection';
import { Loader2 } from 'lucide-react';

/**
 * Le G officiel de Google. Les quatre chemins sont imposes par les regles de
 * marque : ni recoloration, ni icone generique a la place.
 */
function LogoGoogle() {
	return (
		<svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
			/>
			<path
				fill="#34A853"
				d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
			/>
			<path
				fill="#FBBC05"
				d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
			/>
			<path
				fill="#EA4335"
				d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
			/>
		</svg>
	);
}

/**
 * Connexion Google.
 *
 * Le bouton n'ouvre pas de session : il emmene vers Google, qui renverra un
 * code a /auth/callback. C'est cette route qui echange le code contre une
 * session. Rien n'est donc a lire ici au retour.
 */
export default function BoutonGoogle({
	suite,
	libelle = 'Continuer avec Google',
}: {
	/** Chemin interne a rejoindre une fois connecte. */
	suite?: string | null;
	libelle?: string;
}) {
	const [chargement, setChargement] = useState(false);
	const [erreur, setErreur] = useState('');

	const connecter = async () => {
		setErreur('');

		if (!isSupabaseConfigured) {
			setErreur('Configuration Supabase manquante.');
			return;
		}

		setChargement(true);

		const cible = cheminInterneSur(suite);
		const retour = `${window.location.origin}/auth/callback?next=${encodeURIComponent(cible)}`;

		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: retour,
				queryParams: {
					// Sans ces deux parametres, Google ne redonne un refresh token
					// qu'a la toute premiere autorisation : un marchand qui
					// reinstalle l'app se retrouverait sans session persistante.
					access_type: 'offline',
					prompt: 'consent',
				},
			},
		});

		if (error) {
			setErreur(error.message);
			setChargement(false);
		}
		// Succes : le navigateur part chez Google, inutile de relacher l'etat.
	};

	return (
		<div className="space-y-3">
			<button
				type="button"
				onClick={connecter}
				disabled={chargement}
				className="flex w-full items-center justify-center gap-3 rounded-full border border-[var(--hairline)] bg-white py-3.5 font-semibold text-nuit-700 shadow-sm transition hover:bg-chaux-50 disabled:opacity-60"
			>
				{chargement ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogoGoogle />}
				{chargement ? 'Redirection vers Google...' : libelle}
			</button>

			{erreur && (
				<div className="rounded-xl border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
					{erreur}
				</div>
			)}
		</div>
	);
}
