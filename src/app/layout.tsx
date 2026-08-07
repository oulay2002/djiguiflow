import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import {
  SITE_DESCRIPTION,
  SITE_LOCALE,
  SITE_NOM,
  SITE_TITRE,
  SITE_URL,
} from "@/lib/site";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  // Rend absolues toutes les URL relatives des metadonnees ci-dessous et de
  // celles des segments enfants. Sans lui, un `canonical: '/'` casse le build.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITRE,
    // Une page enfant n'a qu'a poser `title: "Boutiques"` : le suffixe suit.
    template: `%s — ${SITE_NOM}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NOM,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NOM,
    title: SITE_TITRE,
    description: SITE_DESCRIPTION,
    locale: SITE_LOCALE,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITRE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Autorise les extraits longs et les grandes vignettes : sans cela
      // Google se limite a un resume court, moins cliquable.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  // Renseigne GOOGLE_SITE_VERIFICATION uniquement si tu valides la propriete
  // par balise HTML. La validation par enregistrement DNS TXT ne demande rien ici.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// Presente DjiguiFlow comme une entite a part entiere plutot que comme une
// page isolee : c'est ce qui permet a Google de relier le site a la marque.
const donneesStructurees = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organisation`,
      name: SITE_NOM,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#site`,
      name: SITE_NOM,
      url: SITE_URL,
      inLanguage: "fr-CI",
      publisher: { "@id": `${SITE_URL}/#organisation` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${bricolage.variable} ${instrumentSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
        />
        {children}
      </body>
    </html>
  );
}
