import { readSheet } from '@/lib/googleSheets';

export type Marchand = {
  id: string;
  boutiqueId: string; // Alias pour compatibilité
  nom: string;
  secteur: string;
  emoji: string;
  sheetId: string;
  sheetCommandes: string;
  sheetMenu: string;
  groupeLivreurs: string;
  whatsapp: string;
};

const SHEET_ID = process.env.SHEET_ID!;
let cache: Record<string, Marchand> | null = null;
let cacheTime = 0;
const TTL = 30_000; // 30 secondes

async function chargerMarchands(): Promise<Record<string, Marchand>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  try {
    const rows = await readSheet('Marchands!A:Z', SHEET_ID);
    const dict: Record<string, Marchand> = {};
    
    for (const r of rows) {
      if (!r.id) continue;
      
      const marchand: Marchand = {
        id: r.id,
        boutiqueId: r.id, // Alias
        nom: r.nom || '',
        secteur: r.secteur || '',
        emoji: r.emoji || '🏪',
        sheetId: SHEET_ID,
        sheetCommandes: r.sheetCommandes || 'Commandes',
        sheetMenu: r.sheetMenu || 'Menu',
        groupeLivreurs: r.groupeLivreurs || '',
        whatsapp: r.whatsapp || '',
      };
      
      dict[marchand.id] = marchand;
      // Aussi accessible par le slug
      if (marchand.id !== marchand.nom.toLowerCase().replace(/\s+/g, '')) {
        dict[marchand.nom.toLowerCase().replace(/\s+/g, '')] = marchand;
      }
    }
    
    cache = dict;
    cacheTime = now;
    return dict;
  } catch (e) {
    console.error('Erreur lecture Marchands:', e);
    return cache || {};
  }
}

export async function getMarchand(id: string): Promise<Marchand | null> {
  const dict = await chargerMarchands();
  return dict[id] || null;
}

export async function resoudreMarchand(id: string): Promise<Marchand | null> {
  return getMarchand(id);
}

export async function listerMarchands(): Promise<Marchand[]> {
  const dict = await chargerMarchands();
  // Retourne une liste unique (sans doublons id/slug)
  const seen = new Set<string>();
  return Object.values(dict).filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function invaliderCacheMarchands(): void {
  cache = null;
  cacheTime = 0;
}

// Compatibilité rétro (accès synchrone si cache déjà chargé)
export const MARCHANDS = new Proxy({} as Record<string, Marchand>, {
  get: (_t, key: string) => {
    if (!cache) return undefined;
    return cache[key];
  },
});