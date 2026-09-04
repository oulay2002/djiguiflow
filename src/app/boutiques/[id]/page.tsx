import { chargerFicheBoutique, chargerMenuBoutique } from '@/lib/vitrine/donnees';
import Vitrine from './Vitrine';

/**
 * LA VITRINE PART DU SERVEUR, DESORMAIS.
 *
 * Ce fichier etait un composant client de 1900 lignes qui chargeait sa fiche
 * PUIS son menu apres l'hydratation — deux allers-retours enchaines, une fois
 * le JavaScript telecharge. Mesure sur la production le 4 septembre 2026,
 * profil Galaxy S9+, 3G lente et processeur ralenti x4 : le nom du commerce
 * apparaissait a 10,9 s, le premier produit a 11,5 s, et le titre affichait
 * « Boutique » pendant tout ce temps.
 *
 * Le composant client n'a pas disparu — le panier, les filtres, le formulaire
 * de commande sont bien de l'interaction, et c'est leur place. Il recoit
 * simplement ce que le serveur a deja lu.
 *
 * `force-dynamic` N'EST PAS UNE PRECAUTION DE STYLE. Sans lui, Next met la
 * route entiere en cache : la vitrine servirait le stock et l'etat d'ouverture
 * du dernier rendu. Un plat epuise resterait commandable, et une boutique
 * fermee dirait « ouvert » — exactement ce que `etatBoutique` existe pour
 * empecher. Le chargement reste dynamique, ce sont les DEUX ALLERS-RETOURS DU
 * NAVIGATEUR qu'on a supprimes, pas la fraicheur de la donnee.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function PageBoutique({ params }: Props) {
  const { id } = await params;

  // En parallele : les deux lectures sont independantes, et les enchainer
  // rendrait au serveur le defaut qu'on vient de retirer au navigateur.
  const [fiche, menu] = await Promise.all([
    chargerFicheBoutique(id),
    chargerMenuBoutique(id),
  ]);

  /**
   * `key` FAIT REPARTIR L'ECRAN A NEUF d'une boutique a l'autre.
   *
   * Sans elle, une navigation de `/boutiques/zahara` vers `/boutiques/rose-monde`
   * remonte le meme composant a la meme place : React garde son etat, et le
   * panier compose chez l'un s'ouvrirait chez l'autre. L'ancien code s'en
   * protegeait par la dependance `[slug]` de son effet de chargement ; l'etat
   * initial venant maintenant des props, c'est le montage qu'il faut refaire.
   */
  return <Vitrine key={id} slug={id} fiche={fiche} menu={menu} />;
}
