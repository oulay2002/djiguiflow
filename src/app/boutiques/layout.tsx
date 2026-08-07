import type { Metadata } from 'next';
import { SITE_LOCALE, SITE_NOM } from '@/lib/site';

// `boutiques/page.tsx` est un Client Component : il ne peut pas exporter de
// metadonnees. Ce layout serveur existe uniquement pour les porter. Le segment
// enfant `[id]` redefinit titre et canonical pour son propre compte.

const TITRE = 'Boutiques a Abidjan';
const DESCRIPTION =
  'Parcourez les boutiques et restaurants qui livrent a Abidjan avec DjiguiFlow. ' +
  'Commandez en ligne et suivez votre livraison en direct.';

export const metadata: Metadata = {
  title: TITRE,
  description: DESCRIPTION,
  alternates: { canonical: '/boutiques' },
  openGraph: {
    type: 'website',
    url: '/boutiques',
    siteName: SITE_NOM,
    title: TITRE,
    description: DESCRIPTION,
    locale: SITE_LOCALE,
  },
  twitter: { card: 'summary_large_image', title: TITRE, description: DESCRIPTION },
};

export default function BoutiquesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
