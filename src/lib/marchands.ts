import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/*
  CETTE CONVENTION DE NOMMAGE A SURVECU A GOOGLE SHEETS, ET C'EST VOULU.

  Elle vivait dans `provisioning.ts`, qui creait les onglets. Le 28 aout 2026
  l'app a cesse d'appeler Google : plus une seule ligne n'est ecrite ni lue
  dans un classeur. Restent les champs `sheet_commandes` et `sheet_menu` de la
  fiche, que les workflows n8n se passent encore de noeud en noeud — sans
  jamais s'en servir pour appeler Google, puisqu'ils n'ont plus un seul noeud
  Google (verifie : 23 workflows actifs, 0 noeud).

  On ne les retire donc PAS d'ici : rendre `undefined` la ou une chaine etait
  attendue casserait une expression n8n en silence, et c'est du nettoyage
  cote n8n, pas cote application. Ce commentaire dit pourquoi ce code a l'air
  mort et ne l'est pas encore tout a fait.
*/

/** « rosemonde » -> « Rosemonde », pour composer un nom d'onglet lisible. */
function capitaliser(slug: string): string {
  const compact = slug.replace(/-/g, '');
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

export function nomsOngletsParDefaut(slug: string) {
  const suffixe = capitaliser(slug);
  return { sheetCommandes: `Commandes_${suffixe}`, sheetMenu: `Menu_${suffixe}` };
}

export type Marchand = {
  id: string;
  boutiqueId: string; // uuid Supabase de la boutique
  nom: string;
  secteur: string;
  emoji: string;
  /**
   * Le logo depose par le marchand, s'il en a un.
   *
   * IL N'ETAIT PAS LU, ET C'EST LA QUE LA MARQUE SE PERDAIT. Un commercant
   * qui deposait son logo a l'inscription voyait l'emoji generique sur SA
   * PROPRE FICHE — l'ecran ou sa marque compte le plus. La colonne existait
   * en base et la fonction de vitrine la rendait deja : seul ce registre
   * l'oubliait, et la fiche n'avait donc rien a afficher.
   */
  logo: string;
  /*
    `sheetId` ET `sheetMenu` SONT PARTIS le 28 aout 2026 : plus personne ne
    les lisait une fois Google Sheets retire. `sheetCommandes` reste, seul,
    parce que la route de commande le transmet encore a n8n — voir la note en
    tete de ce fichier.
  */
  sheetCommandes: string;
  groupeLivreurs: string;
  whatsapp: string;
  /** Chat Telegram du gerant, pour lui adresser ses alertes. */
  telegramMarchand: string;
  /**
   * La boutique est-elle LISTEE publiquement ?
   *
   * `false` la retire de l'annuaire et de `vitrine_boutiques()`. Le champ
   * remonte jusqu'ici parce que le sitemap et les metadonnees en ont besoin :
   * jusqu'au 22 aout 2026, une boutique retiree de l'annuaire restait soumise
   * a l'indexation et rendait `index, follow`. Google se voyait donc designer
   * une boutique que la plateforme cachait — et le jour ou un marchand part,
   * sa page lui survit dans les resultats.
   */
  actif: boolean;
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
      'id, slug, nom, categorie, emoji, logo_url, sheet_commandes, groupe_livreurs, telephone, telegram_marchand, actif',
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
      logo: String(b.logo_url ?? '').trim(),
      sheetCommandes: String(b.sheet_commandes || parDefaut.sheetCommandes),
      groupeLivreurs: String(b.groupe_livreurs || ''),
      whatsapp: String(b.telephone || ''),
      telegramMarchand: String(b.telegram_marchand || ''),
      // `null` vaut ACTIF : c'est la regle de `vitrine_boutiques()`, on ne la
      // duplique pas differemment ici.
      actif: b.actif !== false,
      };
    });
}

/**
 * Charge le registre, depuis le cache tant qu'il est frais.
 *
 * `forcer` saute le TTL sans rien detruire. C'est la nuance qui compte : une
 * premiere version de la relecture appelait `invaliderCacheMarchands()`, donc
 * posait `cache = null` AVANT de relire. Si la base etait muette a cet
 * instant, le repli ci-dessous n'avait plus rien a garder et rendait `{}` :
 * un seul slug mal tape pendant une panne aurait rendu TOUTES les boutiques
 * introuvables sur cette instance. Le remede aurait ete pire que le mal.
 */
async function chargerMarchands(forcer = false): Promise<Record<string, Marchand>> {
  const now = Date.now();
  if (!forcer && cache && now - cacheTime < TTL) return cache;

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

/**
 * Délai minimal entre deux relectures FORCÉES du registre.
 *
 * Il ne protège pas le cache — il protège la base. Sans lui, une rafale de
 * slugs inconnus provoquerait une lecture par appel. Cinq secondes bornent
 * cela à une lecture toutes les cinq secondes et par instance, tout en
 * laissant une boutique neuve devenir joignable presque aussitôt.
 */
const PLANCHER_RELECTURE_MS = 5_000;

/**
 * Le marchand derrière un slug — et une absence n'est PAS une réponse.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION A PORTÉ ───────────────────────────────────
 *
 * Elle lisait le cache et rendait `null` si la clé n'y était pas. La route
 * publique traduisait ce `null` en **404 « Marchand introuvable »**.
 *
 * Or le cache vit trente secondes et par INSTANCE. Une boutique créée à
 * l'instant est donc absente du cache de toute instance chargée avant elle —
 * et `provisioning.ts` a beau invalider le sien, il ne peut rien pour les
 * autres. Pendant une demi-minute, la vitrine d'un marchand qui vient de
 * s'inscrire répondait « cette boutique n'existe pas » à qui suivait son lien.
 *
 * Un 404 n'est pas « je ne sais pas », c'est « cela n'existe pas ». Rendre une
 * certitude fausse à partir d'une ignorance est le défaut que ce dépôt passe
 * son temps à fermer — c'est le même que le banc qui concluait « un livreur est
 * parti » d'une lecture ratée.
 *
 * ── CE QU'ELLE FAIT MAINTENANT ─────────────────────────────────────────────
 *
 * Sur une clé absente, elle RELIT la base une fois avant de conclure. Le coût
 * ne se paie que sur les clés réellement inconnues, et `PLANCHER_RELECTURE_MS`
 * empêche qu'une énumération ne le transforme en charge.
 *
 * Trouvé le 29 août 2026 par le banc multi-marchand, qui échouait un tour sur
 * deux à son premier contrôle — l'intermittence était le symptôme, pas le
 * problème.
 */
export async function getMarchand(id: string | null | undefined): Promise<Marchand | null> {
  if (!id) return null;
  const cle = String(id).trim();

  const dict = await chargerMarchands();
  const trouve = dict[cle];
  if (trouve) return trouve;

  // Le cache vient d'être relu : insister n'apprendrait rien de plus, et
  // ouvrirait la porte à une rafale de slugs inconnus.
  if (Date.now() - cacheTime < PLANCHER_RELECTURE_MS) return null;

  return (await chargerMarchands(true))[cle] || null;
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
