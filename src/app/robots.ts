import type { MetadataRoute } from 'next';
import { CHEMINS_PRIVES, SITE_URL } from '@/lib/site';

// Sert /robots.txt. Le fichier est genere, pas ecrit a la main : la liste des
// chemins prives et l'URL du site restent ainsi partagees avec le sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: CHEMINS_PRIVES,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Indique le domaine canonique aux robots qui savent le lire.
    host: SITE_URL,
  };
}
