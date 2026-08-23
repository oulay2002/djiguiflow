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
 * LE REPLI SUR LA VARIABLE VERCEL EST RETIRE (23 aout 2026). Il n'existait que
 * « le temps de la transition » ; la transition est finie, et
 * `N8N_WEBHOOK_SECRET` a ete supprimee de Vercel apres la rotation du 22 aout,
 * ou elle ne portait plus que l'ANCIENNE valeur.
 *
 * Le garder aurait ete pire que de le retirer : une variable vide ne sert a
 * rien, et une variable qu'on repose un jour « pour depanner » y remettrait
 * une valeur perimee que le coffre ne verrait pas. C'est exactement la
 * divergence du 12 aout — trois exemplaires, une rotation sur deux, et plus
 * aucun marchand prevenu.
 *
 * UNE SEULE SOURCE, DONC : le coffre. Sans lui, pas de secret, et ca se dit.
 */

let cache: { valeur: string; expire: number } | null = null;
const TTL = 60_000;

export async function secretWebhookN8n(): Promise<string> {
  if (cache && Date.now() < cache.expire) return cache.valeur;

  let duCoffre = '';
  try {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data, error } = await sb.rpc('secret_webhook_n8n');
      if (error) throw error;
      duCoffre = String(data ?? '').trim();
    }
  } catch (e) {
    console.error('Secret n8n — lecture du coffre impossible :', e);
  }

  const valeur = duCoffre;

  // Un secret vide se remarque : sans cela, l'appel part quand meme et n8n
  // repond 403, ce qui ressemble a un probleme de reseau plutot qu'a une
  // configuration absente.
  if (!valeur) {
    console.error('Secret n8n — introuvable au coffre : les webhooks refuseront.');
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
