import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Le secret qui ouvre les webhooks n8n, lu au coffre.
 *
 * Il vivait en trois exemplaires : la credential n8n, la variable Vercel
 * `N8N_WEBHOOK_SECRET`, et le coffre Supabase. Les declencheurs Postgres
 * lisaient le coffre, l'application lisait Vercel. Le 12 aout 2026, une
 * rotation faite sur deux des trois a fait echouer les trois declencheurs en
 * 403 — plus aucun marchand n'etait prevenu d'une nouvelle commande, et rien
 * ne le signalait.
 *
 * Le coffre est desormais la source unique : l'application et la base y lisent
 * la meme valeur. Il ne reste que deux endroits a tenir accordes, le coffre et
 * n8n qui doit bien connaitre ce qu'il verifie.
 *
 * `N8N_WEBHOOK_SECRET` reste accepte, mais seulement quand le coffre ne rend
 * rien — le temps de la transition, et pour les environnements sans base. Une
 * valeur presente des deux cotes n'est jamais arbitree : le coffre gagne
 * toujours, sans quoi on aurait recree la divergence qu'on supprime.
 */

let cache: { valeur: string; expire: number } | null = null;
const TTL = 60_000;

export async function secretWebhookN8n(): Promise<string> {
  if (cache && Date.now() < cache.expire) return cache.valeur;

  let duCoffre = '';
  try {
    const sb = getSupabaseAdmin();
    if (sb) {
      // `secret_webhook_n8n` est posterieure aux types generes.
      const rpc = sb.rpc as unknown as (n: string) => PromiseLike<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc('secret_webhook_n8n');
      if (error) throw error;
      duCoffre = String(data ?? '').trim();
    }
  } catch (e) {
    console.error('Secret n8n — lecture du coffre impossible :', e);
  }

  const valeur = duCoffre || String(process.env.N8N_WEBHOOK_SECRET ?? '').trim();

  // Un secret vide se remarque : sans cela, l'appel part quand meme et n8n
  // repond 403, ce qui ressemble a un probleme de reseau plutot qu'a une
  // configuration absente.
  if (!valeur) {
    console.error('Secret n8n — introuvable, ni au coffre ni en variable : les webhooks refuseront.');
  }

  // On ne met en cache que ce qui vaut la peine : une valeur vide doit etre
  // reessayee au prochain appel, le coffre pouvant etre renseigne entre-temps.
  if (valeur) cache = { valeur, expire: Date.now() + TTL };
  return valeur;
}

/** Vide le cache : a appeler apres une rotation, pour ne pas attendre le TTL. */
export function invaliderSecretN8n(): void {
  cache = null;
}
