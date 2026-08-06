import { readSheet } from '@/lib/googleSheets';

export type Marchand = {
  id: string;
  nom: string;
  secteur: string;
  emoji: string;
  sheetId: string;
  sheetCommandes: string;
  sheetMenu: string;
  sheetNotes: string;
  groupeLivreurs: string;
  whatsapp: string;
};

// Marchand servi quand aucun boutique_id n'est précisé (dashboard admin
// mono-boutique aujourd'hui). Surchargeable sans redéploiement.
export const MARCHAND_DEFAUT = process.env.MARCHAND_DEFAUT || 'zahara';

// Repli utilisé UNIQUEMENT si le registre est injoignable ou vide, et
// uniquement pour le marchand par défaut. Il reprend les noms de feuilles
// historiques pour que le dashboard reste debout si l'onglet Marchands
// n'est pas encore créé.
const REPLI_HISTORIQUE: Marchand = {
  id: MARCHAND_DEFAUT,
  nom: 'Zahara',
  secteur: 'Restaurant',
  emoji: '🏪',
  sheetId: process.env.SHEET_ID!,
  sheetCommandes: 'Commandes_Zahara',
  sheetMenu: 'Menu',
  sheetNotes: 'Notes',
  groupeLivreurs: '',
  whatsapp: '',
};

// Cache en mémoire (évite de relire la feuille à chaque requête)
let cache: Record<string, Marchand> | null = null;
let cacheTime = 0;
const TTL = 30_000; // 30s

async function chargerMarchands(): Promise<Record<string, Marchand>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  try {
    const rows = await readSheet('Marchands!A:Z', process.env.SHEET_ID!);
    const dict: Record<string, Marchand> = {};
    for (const r of rows) {
      if (!r.id) continue;
      dict[r.id] = {
        id: r.id,
        nom: r.nom || '',
        secteur: r.secteur || '',
        emoji: r.emoji || '🏪',
        sheetId: process.env.SHEET_ID!,
        sheetCommandes: r.sheetCommandes || 'Commandes',
        sheetMenu: r.sheetMenu || 'Menu',
        // Colonne optionnelle : le registre est lu dynamiquement, ajouter
        // sheetNotes dans la feuille suffit, sans toucher au code.
        sheetNotes: r.sheetNotes || 'Notes',
        groupeLivreurs: r.groupeLivreurs || '',
        whatsapp: r.whatsapp || '',
      };
    }
    cache = dict;
    cacheTime = now;
    return dict;
  } catch (e) {
    console.error('Erreur lecture Marchands:', e);
    return {};
  }
}

export async function getMarchand(id: string): Promise<Marchand | null> {
  const dict = await chargerMarchands();
  return dict[id] || null;
}

/** Infos publiques des boutiques du registre, pour le sélecteur du dashboard. */
export type MarchandPublic = Pick<Marchand, 'id' | 'nom' | 'secteur' | 'emoji'>;

export async function listerMarchands(): Promise<MarchandPublic[]> {
  const dict = await chargerMarchands();
  return Object.values(dict)
    .map(({ id, nom, secteur, emoji }) => ({ id, nom, secteur, emoji }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Résout le marchand ciblé par une route dashboard / suivi.
 *
 * - `boutique_id` fourni et inconnu  -> null (la route doit répondre 404).
 *   On ne retombe JAMAIS sur le marchand par défaut : ce serait servir les
 *   données d'un autre tenant.
 * - `boutique_id` absent             -> marchand par défaut, avec repli
 *   historique si le registre n'est pas encore en place.
 */
export async function resoudreMarchand(boutiqueId?: string | null): Promise<Marchand | null> {
  const cle = (boutiqueId || '').trim();
  if (cle) return getMarchand(cle);

  const parDefaut = await getMarchand(MARCHAND_DEFAUT);
  return parDefaut ?? REPLI_HISTORIQUE;
}

// NOTE : ne jamais importer ce module depuis un composant client.
// Il dépend de googleSheets.ts, qui charge google-auth-library (Node only).
