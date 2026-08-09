import type { Marchand } from '@/lib/marchands';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le registre Marchands vit encore dans Google Sheets et sa colonne
// boutiqueId n'est pas toujours remplie : `marchands.ts` retombe alors sur le
// slug. Or `commandes.boutique_id` est un uuid avec cle etrangere — y ecrire
// un slug fait echouer l'insertion. Ce cache evite de refaire la resolution a
// chaque commande ; il est vide au redemarrage, ce qui suffit.
const parSlug = new Map<string, string>();

/**
 * Rend l'uuid Supabase d'une boutique a partir d'un marchand du registre.
 *
 * Retourne null quand la boutique n'existe pas encore dans Supabase — au
 * chargeur de decider si c'est bloquant. A supprimer le jour ou le registre
 * Marchands aura quitte Google Sheets : `m.boutiqueId` sera alors toujours un
 * uuid et cette indirection n'aura plus lieu d'etre.
 */
export async function resoudreBoutiqueUuid(
  sb: Admin,
  m: Marchand,
): Promise<string | null> {
  if (UUID.test(m.boutiqueId)) return m.boutiqueId;

  const connu = parSlug.get(m.id);
  if (connu) return connu;

  const { data, error } = await sb
    .from('boutiques')
    .select('id')
    .eq('slug', m.id)
    .maybeSingle();

  if (error) {
    console.error(`Boutique — resolution uuid impossible pour ${m.id} :`, error);
    return null;
  }
  if (!data?.id) return null;

  parSlug.set(m.id, data.id);
  return data.id;
}

/** Vide le cache slug → uuid (a appeler apres un provisioning). */
export function invaliderCacheBoutiques(): void {
  parSlug.clear();
}
