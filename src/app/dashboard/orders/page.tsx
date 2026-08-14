import { redirect } from 'next/navigation';

/**
 * Ancien ecran des commandes, fondu dans `/dashboard/commandes`.
 *
 * Il y en avait deux pour le meme sujet. Celui-ci ne figurait pas au menu :
 * on n'y arrivait que par la notification push et par un lien depuis Clients.
 * Le marchand qui touchait l'alerte « nouvelle commande » atterrissait donc
 * sur un ecran different de celui qu'il ouvrait le reste de la journee.
 *
 * L'ecart n'etait pas cosmetique. Cet ecran ecrivait `statut` DIRECTEMENT en
 * base depuis le navigateur, sans passer par `/api/dashboard/commandes/statut`
 * — donc sans miroir dans la feuille, sans `statut_livraison`, et surtout SANS
 * NOTIFIER LE CLIENT. Une commande avancait ici et le client n'en savait rien,
 * pendant que l'autre ecran continuait de l'afficher « en attente ».
 *
 * Ce qu'il avait de bon est parti avec lui : l'alerte temps reel et la
 * recherche vivent desormais sur `/dashboard/commandes`.
 *
 * La redirection reste : des liens partages, un raccourci d'ecran d'accueil ou
 * un signet pointent encore ici.
 */
export default function Page() {
  redirect('/dashboard/commandes');
}
