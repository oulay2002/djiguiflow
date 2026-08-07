import type { Metadata } from 'next';
import { getMarchand } from '@/lib/marchands';
import { SITE_LOCALE, SITE_NOM, SITE_URL } from '@/lib/site';

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

/**
 * Chaque boutique merite son propre titre et sa propre description.
 *
 * C'est ce qui fait la difference entre « une page de plus sur DjiguiFlow » et
 * un resultat qui ressort sur le nom du commerce. Sans cela, toutes les
 * boutiques partageraient le titre du site et se cannibaliseraient.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await getMarchand(id);

  // Boutique inconnue : surtout ne pas laisser indexer une page d'erreur.
  if (!m) {
    return { title: 'Boutique introuvable', robots: { index: false, follow: false } };
  }

  const titre = `${m.nom} — commander en ligne a Abidjan`;
  const description =
    `Commandez chez ${m.nom}${m.secteur ? ` (${m.secteur.toLowerCase()})` : ''} ` +
    'a Abidjan et suivez votre livraison en direct avec DjiguiFlow.';
  const chemin = `/boutiques/${m.id}`;

  return {
    title: titre,
    description,
    alternates: { canonical: chemin },
    openGraph: {
      type: 'website',
      url: chemin,
      siteName: SITE_NOM,
      title: titre,
      description,
      locale: SITE_LOCALE,
    },
    twitter: { card: 'summary_large_image', title: titre, description },
  };
}

// Le registre ne stocke ni adresse postale ni horaires : on n'affirme donc que
// ce qui est verifiable. Declarer une adresse inventee ferait plus de mal que
// de bien — Google sanctionne les donnees structurees non conformes a la page.
// Les libelles viennent de la saisie marchand : « restauration » et
// « restaurant » cohabitent en base. On couvre les deux plutot que d'imposer
// un vocabulaire au provisioning.
const TYPES_SCHEMA: Record<string, string> = {
  restaurant: 'Restaurant',
  restauration: 'Restaurant',
  maquis: 'Restaurant',
  fastfood: 'FastFoodRestaurant',
  'fast food': 'FastFoodRestaurant',
  boulangerie: 'Bakery',
  patisserie: 'Bakery',
  pharmacie: 'Pharmacy',
  supermarche: 'GroceryStore',
  superette: 'GroceryStore',
  epicerie: 'GroceryStore',
  alimentation: 'GroceryStore',
};

function typeSchema(secteur: string): string {
  // NFD puis retrait des diacritiques combinants, pour que « supermarché »
  // et « supermarche » tombent sur la meme cle.
  const cle = secteur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return TYPES_SCHEMA[cle] ?? 'LocalBusiness';
}

export default async function BoutiqueLayout({ children, params }: Props) {
  const { id } = await params;
  const m = await getMarchand(id);

  const donneesStructurees = m
    ? {
        '@context': 'https://schema.org',
        '@type': typeSchema(m.secteur ?? ''),
        '@id': `${SITE_URL}/boutiques/${m.id}#boutique`,
        name: m.nom,
        url: `${SITE_URL}/boutiques/${m.id}`,
        areaServed: { '@type': 'City', name: 'Abidjan' },
      }
    : null;

  return (
    <>
      {donneesStructurees && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
        />
      )}
      {children}
    </>
  );
}
