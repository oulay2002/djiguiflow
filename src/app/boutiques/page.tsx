import { chargerAnnuaire } from '@/lib/vitrine/annuaire';
import Annuaire from './Annuaire';

/**
 * LA PLACE DE MARCHE PART DU SERVEUR, COMME LA FICHE.
 *
 * `/boutiques` etait un composant client qui appelait `vitrine_boutiques()`
 * dans un `useEffect` : son HTML ne contenait pas un seul nom de commerce.
 * C'est pourtant la page d'entree — celle qu'on partage, et celle que les
 * moteurs visitent en premier. Un robot qui n'execute pas de JavaScript n'y
 * voyait aucune boutique a suivre.
 *
 * La recherche, le filtre par categorie et le tri restent du navigateur :
 * c'est de l'interaction sur une liste deja recue, et rien ne gagnerait a
 * faire un aller-retour pour filtrer trois cartes.
 *
 * `force-dynamic` POUR LA MEME RAISON QUE LA FICHE. Les cartes portent l'etat
 * d'ouverture, calcule par `etatBoutique` a l'instant de la requete : mis en
 * cache, l'annuaire annoncerait « ouvert » sur des commerces fermes depuis des
 * heures. Il porte aussi le compte d'articles et la note, qui bougent.
 */
export const dynamic = 'force-dynamic';

export default async function PageAnnuaire() {
  const boutiques = await chargerAnnuaire();
  return <Annuaire boutiques={boutiques} />;
}
