import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { etatBoutique } from '@/lib/horaires';

/**
 * L'ANNUAIRE, CHARGE PAR LE SERVEUR.
 *
 * MEME DEFAUT QUE LA FICHE, MEME REMEDE. `/boutiques` etait un composant client
 * qui appelait `vitrine_boutiques()` dans un `useEffect` : son HTML ne
 * contenait pas un seul nom de commerce. C'est la page d'entree de la place de
 * marche — celle qu'on partage et que les moteurs visitent.
 *
 * LA PORTE RESTE `vitrine_boutiques()`, ET C'EST IMPORTANT. Lire `boutiques`
 * directement ne rend que ses propres enseignes des qu'on est connecte : la
 * lecture publique n'est accordee qu'au role `anon`, et la place de marche se
 * vidait pour un marchand qui la consultait. La fonction est `SECURITY
 * DEFINER` et ne depend d'aucun role — l'appeler ici avec la cle de service
 * rend exactement les memes lignes.
 *
 * SERVEUR SEULEMENT : `getSupabaseAdmin` porte la cle de service.
 */

type VitrineRow = {
  id: string;
  slug: string | null;
  nom: string | null;
  description: string | null;
  zone: string | null;
  categorie: string | null;
  logo_url: string | null;
  articles: number | null;
  note_moyenne: number | string | null;
  avis: number | null;
  palier_livraisons: number | null;
  apercus: string[] | null;
  prix_min: number | string | null;
  horaires: unknown;
  pause_jusqua: string | null;
  vedette: string | null;
  vedette_commandes: number | null;
};

export type BoutiqueAnnuaire = {
  id: string;
  lien: string;
  nom: string;
  zone: string;
  categorie: string;
  description: string;
  logo: string | null;
  produits: number;
  note: number | null;
  avis: number;
  palier: number;
  /** Jusqu'a quatre photos d'articles : la vitrine, au sens propre. */
  apercus: string[];
  /** Plancher de prix, `null` quand rien n'est encore chiffre. */
  prixMin: number | null;
  /**
   * Le produit que le plus de clients DIFFERENTS ont commande ces trente
   * jours. Vide tant qu'aucun ne se detache.
   */
  vedette: string | null;
  ouvert: boolean;
  messageHoraire: string | null;
};

/**
 * Les boutiques listees, ou `null` quand la base n'a pas repondu.
 *
 * `null` et `[]` NE SE CONFONDENT PAS : un tableau vide dit « aucune boutique
 * n'est encore branchee », `null` dit « on n'a pas su lire ». L'ecran affiche
 * deux messages differents, et c'est la seule facon de ne pas faire passer une
 * panne pour une place de marche deserte.
 */
export async function chargerAnnuaire(): Promise<BoutiqueAnnuaire[] | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  let data: VitrineRow[] | null = null;
  try {
    // `rpc()` rend un PostgrestBuilder, qui n'implemente que `then` : lui
    // enchainer un `.catch` leve un TypeError avant meme la requete. On attend
    // donc dans un `try`, seule forme qui couvre aussi une coupure reseau.
    const reponse = await (sb.rpc as unknown as (
      nom: string,
    ) => PromiseLike<{ data: VitrineRow[] | null; error: unknown }>)('vitrine_boutiques');
    if (reponse.error) throw reponse.error;
    data = reponse.data;
  } catch (e) {
    console.error('Annuaire — chargement des boutiques', e);
    return null;
  }

  if (!data) return null;

  // L'INSTANT EST CELUI DE LA REQUETE, et il est le meme pour toute la page :
  // calculer `new Date()` par boutique ferait dependre l'etat d'ouverture du
  // rang de la ligne, a la seconde ou une boutique ferme.
  const maintenant = new Date();

  return data.map((f) => {
    const moyenne = f.note_moyenne == null ? null : Number(f.note_moyenne);
    const prix = f.prix_min == null ? null : Number(f.prix_min);

    // L'etat d'ouverture vient de la MEME fonction que la fiche et que le refus
    // de commande : une carte qui annoncerait « ouvert » quand le serveur
    // refuse serait pire que pas d'indication du tout.
    const etat = etatBoutique(f.horaires, maintenant, f.pause_jusqua);

    return {
      id: f.id,
      // Une vitrine se partage : `/boutiques/zahara` se lit, se dicte au
      // telephone et se reconnait dans un resultat de recherche. L'uuid reste
      // accepte par la fiche, pour les liens deja envoyes.
      lien: f.slug?.trim() || f.id,
      nom: f.nom?.trim() || 'Boutique sans nom',
      zone: f.zone?.trim() || 'Abidjan',
      categorie: f.categorie?.trim() || 'Autre',
      description: f.description?.trim() || '',
      logo: f.logo_url?.trim() || null,
      // Le compte est fait en base et ne retient que le disponible, comme la
      // fiche : promettre douze articles pour en presenter trois est une
      // promesse rompue des le clic.
      produits: f.articles ?? 0,
      note: moyenne !== null && Number.isFinite(moyenne) ? moyenne : null,
      avis: f.avis ?? 0,
      palier: f.palier_livraisons ?? 0,
      // La marchandise. Sans elle, la carte est une fiche d'annuaire : le
      // visiteur lit un nom et une categorie, et n'a toujours aucune raison
      // d'entrer.
      apercus: (f.apercus ?? []).filter((u) => String(u ?? '').trim()),
      prixMin: prix !== null && Number.isFinite(prix) && prix > 0 ? prix : null,
      // La base ne la renvoie qu'au-dela de trois commandes distinctes : en
      // dessous, ce serait une preference habillee en tendance.
      vedette: f.vedette?.trim() || null,
      ouvert: etat.ouvert,
      messageHoraire: etat.message,
    };
  });
}
