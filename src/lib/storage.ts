'use client';

import { supabase } from '@/lib/supabase';

/** Bucket Supabase Storage public utilise pour toutes les images du produit. */
export const BUCKET_IMAGES = 'images';

/**
 * Dossier racine dans lequel le marchand connecte a le droit d'ecrire.
 *
 * Les policies Storage n'acceptent un upload que si le premier segment du
 * chemin est l'id d'une boutique possedee par l'utilisateur, ou son propre
 * user_id. Le repli sur user_id couvre l'amorcage : sur /dashboard/ma-boutique
 * le logo est televerse AVANT que la ligne `boutiques` existe, donc aucun
 * boutique_id n'est encore disponible.
 *
 * @param slug Slug de la boutique selectionnee (celui de `useBoutique`).
 *             Vide = premiere boutique possedee.
 */
export async function dossierMarchand(slug?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Session expiree — reconnecte-toi.');

  // RLS ne renvoie ici que les boutiques de l'utilisateur.
  const { data, error } = await supabase.from('boutiques').select('id, slug');
  if (error) return user.id;

  const boutiques = data ?? [];
  // Un slug qui n'appartient pas a l'utilisateur retombe sur son dossier
  // personnel : jamais sur la boutique d'un autre.
  const cible = slug ? boutiques.find(b => b.slug === slug) : boutiques[0];
  return cible?.id ?? user.id;
}

/** Rend un nom de fichier utilisable comme cle Storage (pas d'accent ni d'espace). */
export function nomFichierSain(nom: string): string {
  return nom.replace(/[^a-zA-Z0-9.-]+/g, '-');
}
