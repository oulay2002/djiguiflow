import { LIGNES_MAX, QUANTITE_MAX } from '@/lib/panierDemande';
import type { ModeCommande } from '@/lib/retrait';

/**
 * Le brouillon d'une commande : ce que le client a compose, et qui doit
 * survivre a un rechargement.
 *
 * ── POURQUOI IL EXISTE ─────────────────────────────────────────────────────
 *
 * Mesure sur la production le 23 novembre 2026 : deux plats, un nom, un numero
 * et une adresse saisis, puis un rechargement — ticket vide, champs disparus.
 * Rien n'etait garde nulle part. Or le client d'ici commande sur un Android
 * d'entree de gamme : il passe sur WhatsApp retrouver une adresse, le systeme
 * decharge l'onglet pour liberer de la memoire, et il revient sur une page
 * neuve. Tout refaire, sur un clavier de telephone, c'est partir.
 *
 * ── POURQUOI `sessionStorage`, ET PAS `localStorage` ───────────────────────
 *
 * Le brouillon porte un nom, un numero et une adresse de domicile. Un
 * telephone se prete : garde sans limite, le prochain qui ouvre la boutique
 * lirait l'adresse du precedent dans le formulaire. `sessionStorage` vit le
 * temps de l'onglet — il survit au rechargement et a l'onglet decharge, qui
 * sont le defaut a corriger, et disparait quand on le ferme.
 *
 * C'est aussi ce que la politique de confidentialite autorise sans
 * consentement (article 9) : un stockage strictement necessaire au service
 * demande, lu par personne d'autre que la page qui l'a ecrit.
 *
 * ── CE QUI EST RELU N'EST JAMAIS CRU SUR PAROLE ────────────────────────────
 *
 * Entre l'ecriture et la relecture, le marchand a pu retirer un plat, vider un
 * stock, cesser de livrer. Et ce stockage est modifiable par n'importe qui
 * depuis la console du navigateur. Tout est donc revalide contre le catalogue
 * du jour : un article disparu sort du panier, une quantite se plie au stock,
 * un mode que la boutique ne propose plus est ecarte. Le serveur refuse de
 * toute facon ce qui ne tient pas — ceci evite seulement de montrer au client
 * un panier que la commande rejettera.
 */

export type Brouillon = {
  /** Clef = `id` ou `id::variante`, comme dans la vitrine. */
  panier: Record<string, number>;
  /** `null` = aucun choix a restaurer : la boutique garde son mode par defaut. */
  mode: ModeCommande | null;
  heureRetrait: string;
  nom: string;
  tel: string;
  adresse: string;
  instructions: string;
};

/** Ce qu'il faut connaitre d'un article pour juger une ligne de panier. */
export type ArticleConnu = {
  id: string;
  stock?: number | null;
  attributValeurs?: string[];
};

const VERSION = 1;
const SEPARATEUR = '::';

/** Une clef par boutique : le panier d'un maquis n'est pas celui du voisin. */
export function clefBrouillon(slug: string): string {
  return `djiguiflow:brouillon:${slug}`;
}

function texte(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Le texte a ecrire, ou `null` quand il n'y a rien a garder — l'appelant
 * efface alors la clef au lieu d'y laisser un brouillon vide.
 */
export function ecrireBrouillon(b: Brouillon): string | null {
  const vide = Object.keys(b.panier).length === 0
    && !b.nom.trim() && !b.tel.trim() && !b.adresse.trim()
    && !b.instructions.trim() && !b.heureRetrait;
  if (vide) return null;
  return JSON.stringify({ v: VERSION, ...b });
}

/**
 * Relit un brouillon, et ne rend que ce qui tient encore.
 *
 * Rend `null` quand il n'y a rien d'exploitable : texte absent, illisible,
 * d'une autre version, ou dont plus rien ne correspond au catalogue.
 */
export function lireBrouillon(
  brut: string | null | undefined,
  articles: ArticleConnu[],
  modesProposes: ModeCommande[],
): Brouillon | null {
  if (!brut) return null;

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return null;
  const o = lu as Record<string, unknown>;
  if (o.v !== VERSION) return null;

  // ---- Le panier, ligne par ligne, contre le catalogue du jour -------------
  const connus = new Map(articles.map((a) => [a.id, a]));
  const panier: Record<string, number> = {};
  const prisPar = new Map<string, number>();

  const lignes = o.panier && typeof o.panier === 'object' && !Array.isArray(o.panier)
    ? Object.entries(o.panier as Record<string, unknown>).slice(0, LIGNES_MAX)
    : [];

  for (const [clef, q] of lignes) {
    const i = clef.indexOf(SEPARATEUR);
    const pid = i < 0 ? clef : clef.slice(0, i);
    const variante = i < 0 ? '' : clef.slice(i + SEPARATEUR.length);

    const article = connus.get(pid);
    if (!article) continue;

    // La variante doit etre une de celles que l'article propose AUJOURD'HUI.
    // Un article a variantes sans variante, ou l'inverse, n'est pas commandable.
    const valeurs = article.attributValeurs ?? [];
    if (valeurs.length > 0 ? !valeurs.includes(variante) : variante !== '') continue;

    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1) continue;

    // LE STOCK EST CELUI DE L'ARTICLE, PAS DE LA VARIANTE : meme regle que la
    // vitrine et que le serveur. `null` ou absent = non compte, aucune borne.
    const plafond = typeof article.stock === 'number' ? article.stock : QUANTITE_MAX;
    const deja = prisPar.get(pid) ?? 0;
    const garde = Math.min(q, QUANTITE_MAX, plafond - deja);
    if (garde < 1) continue;

    panier[clef] = garde;
    prisPar.set(pid, deja + garde);
  }

  // ---- Le mode : seulement s'il est encore propose -------------------------
  const mode = modesProposes.includes(o.mode as ModeCommande) ? (o.mode as ModeCommande) : null;

  // L'heure n'a de sens qu'en retrait ; sa valeur, c'est le serveur qui la juge.
  const heure = texte(o.heureRetrait, 5);
  const heureRetrait = mode === 'retrait' && /^\d{2}:\d{2}$/.test(heure) ? heure : '';

  const brouillon: Brouillon = {
    panier,
    mode,
    heureRetrait,
    nom: texte(o.nom, 120),
    tel: texte(o.tel, 20),
    adresse: texte(o.adresse, 300),
    instructions: texte(o.instructions, 300),
  };

  return ecrireBrouillon(brouillon) === null ? null : brouillon;
}
