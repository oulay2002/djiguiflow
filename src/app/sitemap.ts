import type { MetadataRoute } from 'next';
import { listerMarchands } from '@/lib/marchands';
import { SITE_URL } from '@/lib/site';

// Le registre des boutiques vit en base, pas dans le code. On rafraichit donc
// l'index toutes les heures : une boutique provisionnee cet apres-midi devient
// indexable sans attendre un redeploiement.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const maintenant = new Date();

  const pagesFixes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: maintenant,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/boutiques`,
      lastModified: maintenant,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  // Un registre injoignable ne doit pas faire echouer tout le sitemap :
  // mieux vaut servir un index partiel a Googlebot qu'une erreur 500, qui
  // ferait chuter la frequence de passage du robot.
  let boutiques: MetadataRoute.Sitemap = [];
  try {
    // ON NE SOUMET QUE CE QUE L'ANNUAIRE MONTRE. Jusqu'au 22 aout 2026 ce
    // sitemap proposait TOUTES les boutiques, y compris celles retirees de
    // l'annuaire : Googlebot se voyait donc designer des pages que la
    // plateforme cache. La boutique de demonstration y figurait, et le jour ou
    // un marchand part, sa page lui aurait survecu dans les resultats.
    boutiques = (await listerMarchands())
      .filter((m) => m.actif)
      .map((m) => ({
      url: `${SITE_URL}/boutiques/${m.id}`,
      lastModified: maintenant,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('Sitemap : registre des marchands illisible :', e);
  }

  return [...pagesFixes, ...boutiques];
}
