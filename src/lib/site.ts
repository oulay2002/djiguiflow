/**
 * Identite publique du site.
 *
 * Source unique de l'URL canonique : elle sert au sitemap, au robots.txt,
 * aux balises canonical et aux cartes de partage. Ne jamais reecrire une URL
 * en dur ailleurs — un domaine present a deux endroits finit toujours par
 * diverger, et Google indexe alors deux fois le meme contenu.
 *
 * L'apex djiguiflow.com redirige en 308 vers www : le canonique est donc www.
 * Si ce choix est inverse cote Vercel, poser NEXT_PUBLIC_SITE_URL suffit.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.djiguiflow.com'
).replace(/\/+$/, '');

export const SITE_NOM = 'DjiguiFlow';

export const SITE_TITRE = 'DjiguiFlow — vos commandes tournent sans vous';

/**
 * La phrase la plus vue du produit, et la seule que beaucoup liront.
 *
 * ELLE EST ACCENTUEE, contrairement aux messages techniques du depot. Ce n'est
 * pas une exception a la convention, c'est la convention : les alertes Telegram
 * sont ecrites sans accents pour traverser des passerelles ; celle-ci s'affiche
 * dans un resultat Google et sur un partage WhatsApp, a cote de resultats
 * ecrits en francais correct. « recoit » et « recu » s'y voyaient — au moment
 * precis ou se forme la premiere impression, et pour un public dont c'est la
 * langue.
 */
export const SITE_DESCRIPTION =
  'DjiguiFlow reçoit les commandes de votre boutique sur WhatsApp et Telegram, ' +
  'assigne le livreur de la zone et suit la livraison jusqu’au reçu.';

/** fr_CI : francais de Cote d’Ivoire, le marche vise. */
export const SITE_LOCALE = 'fr_CI';

/**
 * Chemins que les moteurs ne doivent pas explorer.
 *
 * `/suivi` porte des references de commande, `/dashboard` et `/api` sont
 * privees, `/login` et `/register` n’ont aucune valeur de recherche et
 * diluent le budget d’exploration.
 */
export const CHEMINS_PRIVES = [
  '/api/',
  '/dashboard/',
  '/suivi',
  '/login',
  '/register',
];

/**
 * Endpoints publics a laisser explorables malgre le blocage de `/api/`.
 *
 * La fiche boutique charge son contenu en JavaScript depuis ces routes. Or le
 * moteur de rendu de Google respecte le robots.txt pour les requetes que la
 * page emet : bloquer `/api/` sans exception lui ferait rendre une page vide,
 * et donc indexer une coquille. Une regle plus specifique l'emporte sur une
 * regle plus large, ces `Allow` priment donc sur `Disallow: /api/`.
 *
 * Ces deux routes n'exposent que du public — ni sheetId, ni groupe de
 * livreurs, ni numero WhatsApp.
 */
export const CHEMINS_API_PUBLICS = ['/api/marchands', '/api/boutiques/'];

/** Construit une URL absolue a partir d’un chemin interne. */
export function urlAbsolue(chemin: string): string {
  return `${SITE_URL}${chemin.startsWith('/') ? chemin : `/${chemin}`}`;
}
