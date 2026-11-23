import type { MetadataRoute } from 'next';
import { listerMarchands } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { documentsPubliables } from '@/lib/legal';
import { SITE_URL } from '@/lib/site';

// Le registre des boutiques vit en base, pas dans le code. On rafraichit donc
// l'index toutes les heures : une boutique provisionnee cet apres-midi devient
// indexable sans attendre un redeploiement.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * UNE DATE VRAIE, OU PAS DE DATE.
   *
   * Chaque page portait, comme date de modification, l'heure de generation du
   * fichier. Toutes les pages « modifiees » a la meme seconde, a chaque
   * passage : un moteur qui constate qu'une date ment cesse de la lire, pour
   * tout le site. Mieux vaut ne rien declarer que declarer faux.
   *
   * Pour une boutique, on connait une vraie date : celle de son dernier
   * article ajoute. Elle sous-estime (un prix corrige ne la change pas), ce
   * qui est sans consequence ; elle ne surestime jamais.
   */
  const dernierArticle = new Map<string, Date>();
  try {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data } = await sb
        .from('produits')
        .select('boutique_id, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      for (const p of data ?? []) {
        if (p.boutique_id && p.created_at && !dernierArticle.has(p.boutique_id)) {
          dernierArticle.set(p.boutique_id, new Date(p.created_at));
        }
      }
    }
  } catch (e) {
    console.error('Sitemap : dates des articles illisibles :', e);
  }

  const pagesFixes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/boutiques`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      // LA PAGE QUI EXISTE POUR ETRE TROUVEE, ET QUI NE L'ETAIT PAS.
      //
      // Le guide de branchement a ete ecrit pour qu'un commercant se branche
      // SEUL, sans appeler personne. Sa raison d'etre est donc d'apparaitre
      // quand quelqu'un cherche comment vendre depuis son WhatsApp — et le
      // sitemap ne la declarait pas. Une page d'aide absente de l'index n'aide
      // que ceux a qui on a deja donne le lien, c'est-a-dire ceux qui avaient
      // deja appele.
      //
      // `monthly` : elle change avec le produit, pas avec le catalogue.
      url: `${SITE_URL}/aide/brancher`,
      changeFrequency: 'monthly',
      priority: 0.7,
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
      // Une boutique de demonstration reste en ligne sans etre soumise.
      .filter((m) => m.actif && m.indexable !== false)
      .map((m) => ({
      url: `${SITE_URL}/boutiques/${m.id}`,
      // La date du dernier article ajoute, quand on la connait. Sinon RIEN.
      ...(dernierArticle.get(m.boutiqueId) ? { lastModified: dernierArticle.get(m.boutiqueId) } : {}),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error('Sitemap : registre des marchands illisible :', e);
  }

  // LES DOCUMENTS JURIDIQUES, ET SEULEMENT CEUX QUI SONT FINIS.
  //
  // Un document qui porte encore un `[A COMPLETER]` est un projet : le
  // soumettre aux moteurs ferait remonter une CGV a trous sur une recherche
  // « conditions DjiguiFlow », avec l'autorite d'un resultat Google. La liste
  // se calcule donc a partir des fichiers eux-memes, pas d'un drapeau qu'on
  // oublierait de basculer — le jour ou le dernier marqueur est comble, la
  // page entre au sitemap toute seule.
  //
  // L'index /legal ne s'annonce que s'il a quelque chose a montrer.
  let legal: MetadataRoute.Sitemap = [];
  try {
    const publiables = await documentsPubliables();
    if (publiables.length > 0) {
      legal = [
        {
          url: `${SITE_URL}/legal`,
          changeFrequency: 'yearly' as const,
          priority: 0.3,
        },
        ...publiables.map((doc) => ({
          url: `${SITE_URL}/legal/${doc.slug}`,
          changeFrequency: 'yearly' as const,
          priority: 0.3,
        })),
      ];
    }
  } catch (e) {
    // Meme principe que pour les boutiques : un sitemap partiel vaut mieux
    // qu'une erreur 500, qui ferait chuter la frequence de passage du robot.
    console.error('Sitemap : documents legaux illisibles :', e);
  }

  return [...pagesFixes, ...boutiques, ...legal];
}
