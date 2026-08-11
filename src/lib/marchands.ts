import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export type Marchand = {
  id: string;
  boutiqueId: string; // uuid Supabase de la boutique
  nom: string;
  secteur: string;
  emoji: string;
  sheetId: string;
  sheetCommandes: string;
  sheetMenu: string;
  groupeLivreurs: string;
  whatsapp: string;
  /** Chat Telegram du gerant, pour lui adresser ses alertes. */
  telegramMarchand: string;
};

/**
 * Registre des marchands, tenu par Supabase seul.
 *
 * Une surcouche Google Sheets etait posee par-dessus, du temps ou la base
 * laissait des champs vides. Elle n'apportait plus, au 11 aout 2026, que
 * l'identifiant historique `boulangeriedor` et deux retouches cosmetiques —
 * tout le reste venait deja de Supabase, jeton et groupe de livreurs compris.
 *
 * La retirer supprime une panne silencieuse : une feuille renommee ou un
 * partage retire degradait le registre sans que rien ne le signale, et les
 * taches planifiees (retards, resumes, hygiene) s'en servent desormais pour
 * savoir ou joindre chaque marchand.
 *
 * L'identifiant historique survit par `clesDe`, qui indexe aussi la forme
 * compactee du slug : `boulangerie-d-or` repond donc a `boulangeriedor`, sans
 * table d'alias a tenir.
 */

const SHEET_ID = process.env.SHEET_ID!;

let cache: Record<string, Marchand> | null = null;
let cacheTime = 0;
const TTL = 30_000; // 30 secondes

/**
 * Cle principale d'un marchand : son slug, tel qu'il est en base.
 *
 * Elle prime toujours. Une boutique doit repondre a son propre slug meme si
 * l'alias d'une autre lui ressemble.
 */
function clePrincipale(m: Marchand): string {
  return String(m.id || '').trim();
}

/**
 * Cles secondaires, tolerees mais jamais prioritaires.
 *
 * Le slug compacte n'est pas un ornement : les liens deja partages et les
 * webhooks deja configures utilisent des identifiants sans tiret, herites du
 * registre Sheets — « boulangeriedor » doit continuer de repondre.
 *
 * L'uuid de la boutique est indexe pour la meme raison : les liens partages
 * avant les adresses lisibles pointent sur `/boutiques/<uuid>`, et le layout de
 * la fiche resout le titre et le canonical par ce chemin. Sans cet alias,
 * chacune de ces pages s'annoncait « Boutique introuvable » en `noindex`.
 *
 * Mais deux boutiques peuvent se disputer une meme forme compactee :
 * « chez-ali » produit l'alias « chezali », qui est le slug legitime d'une
 * autre. Si l'alias l'emportait, les commandes d'un marchand partiraient chez
 * son voisin — c'est pourquoi les alias ne sont poses qu'apres coup, et
 * seulement sur les cles encore libres.
 */
function alias(m: Marchand): string[] {
  return [m.boutiqueId, m.id.replace(/-/g, ''), m.nom.toLowerCase().replace(/\s+/g, '')]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
}

async function depuisSupabase(): Promise<Marchand[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const { data, error } = await sb
    .from('boutiques')
    .select(
      'id, slug, nom, categorie, emoji, sheet_commandes, sheet_menu, groupe_livreurs, telephone, telegram_marchand',
    );

  if (error) {
    console.error('Marchands — lecture Supabase impossible :', error);
    return [];
  }

  return (data ?? [])
    .filter((b) => String(b.slug ?? '').trim())
    .map((b) => ({
      id: String(b.slug),
      boutiqueId: String(b.id),
      nom: String(b.nom ?? ''),
      secteur: String(b.categorie ?? ''),
      emoji: String(b.emoji || '🏪'),
      sheetId: SHEET_ID,
      sheetCommandes: String(b.sheet_commandes || 'Commandes'),
      sheetMenu: String(b.sheet_menu || 'Menu'),
      groupeLivreurs: String(b.groupe_livreurs || ''),
      whatsapp: String(b.telephone || ''),
      telegramMarchand: String(b.telegram_marchand || ''),
    }));
}

async function chargerMarchands(): Promise<Record<string, Marchand>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  const base = await depuisSupabase();

  // Base muette : on garde le dernier etat connu plutot que de rendre toutes
  // les boutiques introuvables.
  if (!base.length) return cache ?? {};

  const dict: Record<string, Marchand> = {};

  // Deux passes, et l'ordre compte. Les slugs d'abord, pour qu'aucun alias ne
  // puisse prendre la place d'une boutique existante ; les alias ensuite, et
  // seulement la ou la cle est encore libre.
  for (const m of base) {
    const cle = clePrincipale(m);
    if (cle) dict[cle] = m;
  }

  for (const m of base) {
    for (const cle of alias(m)) {
      if (!dict[cle]) dict[cle] = m;
    }
  }

  cache = dict;
  cacheTime = now;
  return dict;
}

export async function getMarchand(id: string | null | undefined): Promise<Marchand | null> {
  if (!id) return null;
  const dict = await chargerMarchands();
  return dict[String(id).trim()] || null;
}

// Déduit la boutique depuis le préfixe de la référence (ZH-…, BO-…, APP-…)
export async function resoudreMarchandParRef(ref: string) {
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
    .eq('prefixe_commande', prefixe)
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

export async function listerMarchands(): Promise<Marchand[]> {
  const dict = await chargerMarchands();
  // Deduplication par identite d'objet : un meme marchand repond sous
  // plusieurs cles (id historique, slug Supabase, nom).
  const vus = new Set<Marchand>();
  const liste: Marchand[] = [];
  for (const m of Object.values(dict)) {
    if (vus.has(m)) continue;
    vus.add(m);
    liste.push(m);
  }
  return liste;
}

export function invaliderCacheMarchands(): void {
  cache = null;
  cacheTime = 0;
}

// Compatibilite retro (acces synchrone si cache deja charge)
export const MARCHANDS = new Proxy({} as Record<string, Marchand>, {
  get: (_t, key: string) => {
    if (!cache) return undefined;
    return cache[key];
  },
});
