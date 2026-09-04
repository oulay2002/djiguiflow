import { getMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreBoutiqueUuid } from '@/lib/boutiques';
import { etatBoutique } from '@/lib/horaires';

/**
 * CE QUE LA VITRINE MONTRE, CHARGE PAR LE SERVEUR.
 *
 * LE PROBLEME QU'ON RESOUD. La page `/boutiques/[id]` etait entierement un
 * composant client : elle partait vide, telechargeait son JavaScript, puis
 * demandait la fiche, PUIS le menu — deux allers-retours enchaines APRES
 * l'hydratation. Mesure le 4 septembre 2026 sur la production, profil
 * Galaxy S9+, 3G lente (400 kbit/s, 300 ms) et processeur ralenti x4 :
 *
 *   le <h1> apparait a 1,1 s, et il dit « Boutique »
 *   le nom du commerce a 10,9 s
 *   le premier produit a 11,5 s
 *
 * Pendant dix secondes, un client d'Abidjan regarde une page qui s'appelle
 * « Boutique » et ne vend rien. C'est exactement le public que `PRODUCT.md`
 * decrit : telephone d'entree de gamme, donnees cheres, reseau instable.
 *
 * Et ce que le HTML ne contient pas, aucun robot qui n'execute pas de
 * JavaScript ne le voit : le catalogue etait invisible au referencement.
 *
 * CES DEUX FONCTIONS SONT LA SOURCE UNIQUE. Les routes
 * `/api/boutiques/[id]` et `/api/boutiques/[id]/menu` les appellent, la page
 * les appelle : une regle recopiee finit par diverger, et c'est deja arrive
 * deux fois sur ce projet. Les routes restent — l'assistante n8n lit le menu
 * par HTTP depuis le 19 aout, et la vitrine s'en sert encore pour son repli.
 *
 * SERVEUR SEULEMENT : `getSupabaseAdmin` porte la cle de service. Rien ici ne
 * doit etre importe depuis un composant client.
 */

/** La fiche publique d'une boutique du registre. Ni classeur, ni jeton. */
export type FicheVitrine = {
  id: string;
  nom: string;
  secteur: string;
  emoji: string;
  /** Le logo depose par le marchand. Vide = il n'en a pas. */
  logo: string;
  ouvert: boolean;
  messageHoraire: string | null;
  /**
   * `null` quand la fiche n'a pas pu etre lue : la page se tait alors, au lieu
   * d'annoncer des valeurs par defaut que le marchand n'a pas choisies.
   */
  fiche: {
    zone: string | null;
    delai_livraison: string | null;
    zones_livrees: string | null;
    paiements_acceptes: string[] | null;
    commande_minimum: number | null;
    mode_recuperation: string;
    delai_preparation_min: number | null;
    livraison_offerte_des: number | null;
  } | null;
};

/** Un article, tel que la vitrine et l'assistante le lisent. */
export type ProduitVitrine = {
  id: string;
  nom: string;
  categorie: string;
  prix: number;
  description: string;
  image: string;
  duJour: boolean;
  /** `null` = le marchand ne compte pas ce produit. Jamais zero. */
  stock: number | null;
  groupe: string;
  couleur: string;
  marque: string;
  publicVise: string;
  attributNom: string;
  attributValeurs: string[];
};

/**
 * La fiche publique, ou `null` si la boutique n'est pas au registre.
 *
 * `null` n'est PAS une erreur : les boutiques qui commandent par lien WhatsApp
 * sans passer par le registre existent, et la vitrine sait les charger par
 * `vitrine_boutique`. C'est son repli, et il doit continuer de servir.
 */
export async function chargerFicheBoutique(id: string): Promise<FicheVitrine | null> {
  const m = await getMarchand(id);
  if (!m) return null;

  // L'etat d'ouverture voyage avec la fiche : la vitrine doit pouvoir le dire
  // AVANT que le client ne remplisse son panier. Le refuser seulement au moment
  // d'envoyer, apres qu'il a tout saisi, serait la pire des facons de le lui
  // apprendre.
  //
  // Le calcul vient de `etatBoutique`, la meme fonction que celle qui REFUSE la
  // commande cote serveur : l'ecran et le verrou ne peuvent donc pas dire deux
  // choses differentes.
  let ouvert = true;
  let messageHoraire: string | null = null;
  let fiche: FicheVitrine['fiche'] = null;

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const uuid = await resoudreBoutiqueUuid(sb, m);
      if (uuid) {
        const { data } = await sb
          .from('boutiques')
          // En UNE seule chaine litterale : concatenee, elle perd son inference.
          .select('horaires, pause_jusqua, zone, delai_livraison, zones_livrees, paiements_acceptes, commande_minimum, mode_recuperation, delai_preparation_min, livraison_offerte_des')
          .eq('id', uuid)
          .maybeSingle();
        const etat = etatBoutique(data?.horaires, new Date(), data?.pause_jusqua);
        ouvert = etat.ouvert;
        messageHoraire = etat.message;

        if (data) {
          fiche = {
            zone: data.zone,
            delai_livraison: data.delai_livraison,
            zones_livrees: data.zones_livrees,
            paiements_acceptes: data.paiements_acceptes,
            // `null` reste `null` : un minimum a zero se lirait comme un vrai
            // minimum de zero franc, ce qui ne veut rien dire.
            commande_minimum:
              typeof data.commande_minimum === 'number' && data.commande_minimum > 0
                ? data.commande_minimum
                : null,
            mode_recuperation: data.mode_recuperation || 'livraison',
            delai_preparation_min: data.delai_preparation_min,
            // ZERO GARDE SA VALEUR. Un `|| null` ferait de « toujours offerte »
            // un « le livreur annonce ses frais » — l'exact contraire.
            livraison_offerte_des: data.livraison_offerte_des,
          };
        }
      }
    } catch (e) {
      // Une lecture ratee laisse la boutique OUVERTE : mieux vaut une commande
      // de trop qu'une vitrine qui se ferme sur une panne de base.
      console.error(`Boutique ${m.id} — état d'ouverture illisible :`, e);
    }
  }

  // On ne renvoie que le public : ni sheetId, ni groupeLivreurs, ni whatsapp.
  return {
    id: m.id,
    nom: m.nom,
    secteur: m.secteur,
    emoji: m.emoji,
    // Le logo est PUBLIC : c'est la devanture, pas une donnee d'exploitation.
    logo: m.logo,
    ouvert,
    messageHoraire,
    fiche,
  };
}

/**
 * Le catalogue publie, ou `null` quand la base n'a pas repondu.
 *
 * `null` et `[]` NE SE CONFONDENT PAS. Un tableau vide dit « ce commercant n'a
 * pas encore publie d'article » ; `null` dit « on n'a pas su lire ». Les faire
 * passer pour la meme chose donnait au client une boutique qui ne vend rien
 * alors que la base etait simplement muette.
 */
export async function chargerMenuBoutique(id: string): Promise<ProduitVitrine[] | null> {
  const m = await getMarchand(id);
  if (!m) return null;

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from('produits')
    // photo_url et menu_du_jour manquaient : les photos televersees par le
    // marchand n'atteignaient jamais la vitrine, et le menu du jour qu'il
    // compose restait invisible.
    .select('reference, id, nom, categorie, prix, description, photo_url, menu_du_jour, stock, groupe, couleur, attribut_nom, attribut_valeurs, marque, public_vise')
    .eq('boutique_id', m.boutiqueId)
    .eq('disponible', true)
    .order('categorie', { ascending: true })
    .order('nom', { ascending: true });

  if (error) {
    console.error(`Menu — lecture Supabase impossible (${m.id}) :`, error);
    return null;
  }

  return (data ?? []).map((p) => ({
    // La reference de la feuille reste l'identifiant public : c'est elle que
    // le panier renvoie a /commander, et que n8n connait encore.
    id: String(p.reference ?? p.id),
    nom: String(p.nom ?? ''),
    categorie: String(p.categorie ?? ''),
    prix: Number(p.prix ?? 0),
    description: String(p.description ?? ''),
    image: String(p.photo_url ?? ''),
    duJour: Boolean(p.menu_du_jour),
    // LE STOCK ETAIT LU MAIS PAS RENDU — c'est tout ce qui manquait.
    //
    // Le tableau de bord affichait « Rupture », la vitrine proposait le plat
    // sans rien dire, et le client ne l'apprenait qu'au dernier clic, une fois
    // son panier compose et son adresse saisie. La pire facon de l'apprendre.
    //
    // `null` veut dire « le marchand ne compte pas ce produit », jamais zero :
    // confondre les deux epuiserait d'un coup tout le catalogue de ceux qui ne
    // tiennent pas de stock.
    stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
    // LA DECLINAISON. Deux articles partageant `groupe` dans une meme boutique
    // sont le meme article en plusieurs coloris : la vitrine n'en fait qu'une
    // carte. Vide, l'article s'affiche seul, exactement comme avant.
    groupe: String(p.groupe ?? '').trim(),
    couleur: String(p.couleur ?? '').trim(),
    // CE QU'UN CLIENT CHERCHE DANS UNE BOUTIQUE DE VETEMENTS : la marque
    // d'abord, puis pour qui c'est. Vide = le marchand ne l'a pas donne, et la
    // vitrine se tait — jamais « sans marque », jamais « pour tous ».
    marque: String(p.marque ?? '').trim(),
    publicVise: String(p.public_vise ?? '').trim(),
    // LA CARACTERISTIQUE : pointure, taille, contenance — le marchand la
    // nomme lui-meme. Le client la demandait par message, article par
    // article, et le marchand repondait a la main a chaque fois.
    //
    // ELLE PART AUSSI VERS L'ASSISTANTE, qui lit cette route depuis le
    // 19 aout. Sans elle, le bot aurait continue a ignorer une question
    // que tout acheteur de chaussures pose en premier.
    //
    // Les deux vont ensemble ou pas du tout — la base l'impose. On rend
    // donc une chaine vide et un tableau vide, jamais l'un sans l'autre.
    attributNom: String(p.attribut_nom ?? '').trim(),
    attributValeurs: Array.isArray(p.attribut_valeurs)
      ? p.attribut_valeurs.map((v) => String(v ?? '').trim()).filter(Boolean)
      : [],
  }));
}
