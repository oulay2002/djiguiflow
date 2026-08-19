import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { nomsOngletsParDefaut } from '@/lib/provisioning';

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
      'id, slug, nom, categorie, emoji, sheet_document_id, sheet_commandes, sheet_menu, groupe_livreurs, telephone, telegram_marchand',
    );

  if (error) {
    console.error('Marchands — lecture Supabase impossible :', error);
    return [];
  }

  return (data ?? [])
    .filter((b) => String(b.slug ?? '').trim())
    .map((b) => {
      // Meme convention que `/api/internal/fiche`. Les deux divergeaient :
      // la fiche rendait « Commandes_Rosemonde », ce registre « Commandes ».
      // Les routeurs, qui lisent la fiche, et les taches planifiees, qui
      // lisent ce registre, auraient donc vise deux onglets differents pour
      // une meme boutique — l'une des deux ecrivant dans le vide.
      const parDefaut = nomsOngletsParDefaut(String(b.slug));
      return {
      id: String(b.slug),
      boutiqueId: String(b.id),
      nom: String(b.nom ?? ''),
      secteur: String(b.categorie ?? ''),
      emoji: String(b.emoji || '🏪'),
      // LE DOCUMENT DU MARCHAND, PAS UN SEUL POUR TOUT LE MONDE.
      //
      // Ce registre imposait `SHEET_ID` a tous, alors que n8n lit
      // `sheet_document_id` de la fiche. Tant qu'il n'y avait qu'un marchand,
      // les deux designaient le meme classeur et rien ne le revelait. Au
      // deuxieme marchand ayant son propre document, l'application ecrivait sa
      // commande dans le classeur global pendant que n8n la cherchait dans le
      // sien : commande introuvable, aucun livreur lance, et pas un message
      // d'erreur — les deux cotes travaillaient sans se douter de rien.
      //
      // Le repli sur `SHEET_ID` garde les marchands existants a l'identique.
      sheetId: String(b.sheet_document_id || SHEET_ID || ''),
      sheetCommandes: String(b.sheet_commandes || parDefaut.sheetCommandes),
      sheetMenu: String(b.sheet_menu || parDefaut.sheetMenu),
      groupeLivreurs: String(b.groupe_livreurs || ''),
      whatsapp: String(b.telephone || ''),
      telegramMarchand: String(b.telegram_marchand || ''),
      };
    });
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

/**
 * Prefixe des references de commande, propre a chaque marchand.
 *
 * `APP-` etait ecrit en dur pour tout le monde, et le Cerveau n8n ecrivait
 * `ZH-` — les initiales de Zahara — pour tout le monde aussi. Deux marchands
 * pouvaient donc emettre la meme reference, ce que l'unicite en base ne
 * refusait pas : elle ne portait que sur le couple (boutique_id, reference).
 * Le suivi, qui cherche desormais par reference seule, serait tombe sur deux
 * lignes et aurait rendu un 503 opaque.
 *
 * La regle doit rester identique des deux cotes : trois lettres du slug, sans
 * separateur, en capitales. Le noeud `Mettre_a_jour_commande` du workflow
 * « Cerveau marchand » applique la meme, dans son expression `$fromAI`.
 */
export function prefixeReference(slug: string): string {
  const lettres = String(slug || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3);
  return (lettres || 'dj').toUpperCase();
}

export async function getMarchand(id: string | null | undefined): Promise<Marchand | null> {
  if (!id) return null;
  const dict = await chargerMarchands();
  return dict[String(id).trim()] || null;
}

export async function resoudreMarchand(id: string | null | undefined): Promise<Marchand | null> {
  return getMarchand(id);
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
