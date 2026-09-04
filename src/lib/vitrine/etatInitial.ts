import { EMOJI_DEFAUT } from '@/components/ui/Enseigne';
import { modeParDefaut } from '@/lib/retrait';
import type { FicheVitrine, ProduitVitrine } from '@/lib/vitrine/donnees';

/**
 * L'etat de depart, deduit de ce que le serveur a deja lu.
 *
 * ECRIT COMME UNE FONCTION PURE, et appele en initialiseur paresseux de chaque
 * `useState` : le premier rendu — celui qui part dans le HTML — porte donc deja
 * le nom du commerce et ses articles. C'est tout l'objet de ce travail ; un
 * `useEffect` qui poserait les memes valeurs apres coup ne changerait rien pour
 * le client sur une 3G, puisqu'il faut d'abord telecharger le JavaScript.
 */
export function etatInitial(fiche: FicheVitrine | null, menu: ProduitVitrine[] | null) {
  const f = fiche?.fiche ?? null;
  return {
    estMarchandSheets: fiche !== null,
    ouvert: fiche ? fiche.ouvert !== false : true,
    messageHoraire: String(fiche?.messageHoraire ?? ''),
    header: {
      nom: fiche?.nom || 'Boutique',
      secteur: fiche?.secteur || 'Commerce',
      emoji: fiche?.emoji || EMOJI_DEFAUT,
      logo: String(fiche?.logo ?? '').trim(),
    },
    zone: String(f?.zone ?? ''),
    infos: {
      delai: String(f?.delai_livraison ?? '').trim(),
      zones: String(f?.zones_livrees ?? '').trim(),
      paiements: Array.isArray(f?.paiements_acceptes)
        ? f.paiements_acceptes.map((v) => String(v ?? '').trim()).filter(Boolean)
        : [],
      minimum: typeof f?.commande_minimum === 'number' ? f.commande_minimum : null,
    },
    recuperation: {
      mode: String(f?.mode_recuperation ?? 'livraison'),
      preparationMin: typeof f?.delai_preparation_min === 'number' ? f.delai_preparation_min : null,
      // Zero garde sa valeur : c'est « toujours offerte », pas un trou.
      offerteDes: typeof f?.livraison_offerte_des === 'number' ? f.livraison_offerte_des : null,
    },
    modeChoisi: modeParDefaut(f?.mode_recuperation),
    produits: menu ?? [],
    /**
     * `null` sur le menu d'une boutique QUI EXISTE veut dire que la base n'a
     * pas repondu. Le taire afficherait « ce commercant n'a pas encore publie
     * d'article » sur une boutique pleine — le defaut silencieux exact que la
     * page a deja paye une fois.
     */
    pannePage: (fiche && menu === null ? 'reseau' : '') as '' | 'introuvable' | 'reseau',
    /** Le serveur a repondu : il n'y a plus rien a attendre. */
    chargement: fiche === null,
  };
}

