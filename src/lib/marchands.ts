import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type Marchand = {
  id: string;
  slug: string;
  nom: string;
  prefixe_commande: string | null;
  groupe_livreurs: string | null;
  actif: boolean;
};

export async function resoudreMarchand(slugOrId: string | null): Promise<Marchand | null> {
  if (!slugOrId) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data } = await sb
    .from('boutiques')
    .select('id, slug, nom, prefixe_commande, groupe_livreurs, actif')
    .eq('actif', true)
    .or(`id.eq.${slugOrId},slug.eq.${slugOrId}`)
    .maybeSingle();

  return data ?? null;
}

export async function resoudreMarchandParRef(ref: string): Promise<Marchand | null> {
  const match = ref.match(/^([A-Z]{2,4})-/i);
  if (!match) return null;
  const prefixe = match[1].toUpperCase();

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  // D'abord chercher par préfixe exact
  const { data } = await sb
    .from('boutiques')
    .select('id, slug, nom, prefixe_commande, groupe_livreurs, actif')
    .eq('actif', true)
    .eq('prefixe_commande' as any, prefixe)
    .maybeSingle();

  if (data) return data;

  // Fallback historique : APP → Zahara (refs legacy)
  if (prefixe === 'APP') {
    const { data: fb } = await sb
      .from('boutiques')
      .select('id, slug, nom, prefixe_commande, groupe_livreurs, actif')
      .eq('slug', 'zahara')
      .maybeSingle();
    return fb;
  }
  return null;
}