import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

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

let supabaseClient = createClient<Database>(fallbackUrl, fallbackAnonKey);

try {
	supabaseClient = createClient<Database>(resolvedUrl, resolvedAnonKey);
} catch {
	if (typeof window !== 'undefined') {
		console.warn('Unable to initialize Supabase client with env values, using safe fallback.');
	}
}

export const supabase = supabaseClient;