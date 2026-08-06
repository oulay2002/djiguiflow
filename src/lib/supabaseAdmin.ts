import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Client Supabase a privileges eleves, reserve aux routes API.
// Les tables sont protegees par RLS et les policies s'appuient sur auth.uid() :
// une route serveur n'a pas de session utilisateur, elle ne verrait donc aucune
// commande avec la cle anonyme. La cle service_role contourne RLS.
//
// NE JAMAIS importer ce module depuis un composant client : la cle donne un
// acces total a la base.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Retourne le client admin, ou null si la configuration est absente.
 * Le null est volontaire : pendant la periode de double ecriture, une
 * configuration Supabase incomplete ne doit pas empecher une commande
 * d'aboutir dans Google Sheets, qui reste la source de verite.
 */
export function getSupabaseAdmin() {
  if (client) return client;
  if (!url || !serviceKey) return null;

  client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function supabaseAdminConfigure(): boolean {
  return Boolean(url && serviceKey);
}
