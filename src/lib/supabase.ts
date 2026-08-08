import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

// Client navigateur. La session vit dans des cookies, pas dans localStorage :
// c'est ce qui la rend lisible par le serveur, donc verifiable par le proxy
// avant tout rendu de /dashboard. Avec localStorage, aucune garde serveur
// n'etait possible — la protection s'arretait au JavaScript de la page.
//
// A noter : ces cookies ne sont PAS httpOnly, et ne peuvent pas l'etre. Les
// pages interrogent Supabase depuis le navigateur en s'appuyant sur RLS, ce
// qui suppose que le navigateur porte une session utilisable. La defense
// contre le vol de session par XSS repose donc sur les en-tetes de
// next.config.ts, pas sur le support de stockage.

function normalizeEnvValue(rawValue: string | undefined): string | null {
	if (!rawValue) {
		return null;
	}

	const withoutQuotes = rawValue
		.trim()
		.replace(/^"(.*)"$/, '$1')
		.replace(/^'(.*)'$/, '$1')
		.trim();

	return withoutQuotes.length > 0 ? withoutQuotes : null;
}

function isValidSupabaseUrl(value: string | null): boolean {
	if (!value) {
		return false;
	}

	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
	} catch {
		return false;
	}
}

const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
	console.warn(
		'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.',
	);
}

const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackAnonKey = 'public-anon-placeholder-key';

const resolvedUrl =
	supabaseUrl && isValidSupabaseUrl(supabaseUrl) ? supabaseUrl : fallbackUrl;
const resolvedAnonKey =
	supabaseAnonKey && supabaseAnonKey.length > 0 ? supabaseAnonKey : fallbackAnonKey;

// Une seule instanciation, et surtout pas la construction « repli d'abord,
// vraies valeurs ensuite » utilisee avec createClient : createBrowserClient
// memoise son premier client dans le navigateur, si bien qu'un premier appel
// sur l'URL de repli serait rendu a tous les suivants. L'application aurait
// alors parle a placeholder.supabase.co sans jamais echouer bruyamment.
function construireClient() {
	try {
		return createBrowserClient<Database>(resolvedUrl, resolvedAnonKey);
	} catch {
		if (typeof window !== 'undefined') {
			console.warn('Unable to initialize Supabase client with env values, using safe fallback.');
		}
		return createBrowserClient<Database>(fallbackUrl, fallbackAnonKey);
	}
}

export const supabase = construireClient();