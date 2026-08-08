import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

/**
 * Client Supabase cote serveur, adosse aux cookies de la requete.
 *
 * A ne pas confondre avec `getSupabaseAdmin()` : celui-ci porte l'identite du
 * marchand connecte et reste soumis a RLS. Le client admin, lui, contourne
 * RLS et ne doit servir qu'aux routes qui ont deja verifie les droits.
 *
 * Utilisable dans les Route Handlers et les Server Components. Dans un Server
 * Component, l'ecriture de cookies est interdite par Next : l'echec est
 * silencieux, car le proxy a deja rafraichi la session en amont.
 */
export async function supabaseServeur() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
	const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

	if (!url || !cle) {
		throw new Error('Configuration Supabase absente cote serveur.');
	}

	const magasin = await cookies();

	return createServerClient<Database>(url, cle, {
		cookies: {
			getAll: () => magasin.getAll(),
			setAll: (aPoser) => {
				try {
					for (const { name, value, options } of aPoser) {
						magasin.set(name, value, options);
					}
				} catch {
					// Server Component : lecture seule. Sans incidence, le proxy
					// ecrit les cookies rafraichis sur la reponse.
				}
			},
		},
	});
}
