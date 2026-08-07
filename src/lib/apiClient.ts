'use client';

import { supabase } from '@/lib/supabase';

/**
 * fetch vers une route /api/dashboard/*, avec l'access token du marchand.
 *
 * Ces routes exigent desormais une session : sans cet en-tete elles
 * repondent 401. Passer par ce helper evite d'oublier l'authentification
 * sur un nouvel ecran.
 */
export async function fetchDashboard(url: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Session expiree — reconnecte-toi.');

  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
