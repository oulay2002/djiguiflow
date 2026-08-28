import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import EnregistrementServiceWorker from "@/components/pwa/EnregistrementServiceWorker";
import {
  SITE_DESCRIPTION,
  SITE_LOCALE,
  SITE_NOM,
  SITE_TITRE,
  SITE_URL,
} from "@/lib/site";
import { jsonLdSur } from '@/lib/jsonLd';

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

/**
 * LES GRAISSES DEMANDÉES, ET ELLES SEULES.
 *
 * La déclaration se trompait des deux côtés. Elle chargeait la 500, réclamée
 * par UN seul endroit du site ; et elle omettait la 700, réclamée par
 * TRENTE-SIX — dont le rôle `donnee` de DESIGN.md, qui est du mono 700.
 *
 * Une graisse absente ne fait pas échouer le rendu, elle le dégrade en
 * silence : le navigateur prend la face la plus proche et l'épaissit au trait.
 * Ce faux gras se voyait sur seize fichiers, et il coûtait déjà le
 * téléchargement de la 600 — tirée comme base de synthèse alors qu'aucune
 * classe de ces pages ne la demandait. On paie donc le même poids qu'avant
 * pour un vrai dessin au lieu d'un dessin épaissi.
 *
 * La 500 restante retombe sur la 400 : le navigateur descend avant de monter,
 * il n'y a pas de synthèse et l'écart d'un cran est invisible.
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

/**
 * Teinte la barre systeme du navigateur mobile en indigo.
 *
 * Le manifeste porte deja `theme_color`, mais il ne s'applique qu'une fois
 * l'application installee. Ici, la couleur vaut des la premiere visite —
 * c'est-a-dire pour la quasi-totalite des marchands, qui arrivent par un
 * lien WhatsApp sans jamais installer quoi que ce soit.
 */
export const viewport: Viewport = {
  themeColor: "#131c3d",
  width: "device-width",
  initialScale: 1,
  // `cover` est ce qui donne une valeur non nulle a env(safe-area-inset-*).
  // Sans lui, la barre de navigation du bas passe sous l'indicateur d'accueil
  // de l'iPhone et ses deux derniers onglets deviennent intouchables.
  viewportFit: "cover",
};

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
  // Safari ignore le manifeste : sans ce bloc, « Sur l'ecran d'accueil »
  // rouvre l'application dans un onglet avec la barre d'adresse. iOS exige
  // aussi ce mode pour delivrer les notifications push.
  appleWebApp: {
    capable: true,
    title: SITE_NOM,
    statusBarStyle: "default",
  },
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
        {/*
          LE LIEN D'EVITEMENT. Premier element focalisable de la page, invisible
          jusqu'a ce qu'on l'atteigne au clavier.

          Sans lui, quelqu'un qui navigue a la tabulation traverse la barre de
          navigation entiere AVANT d'atteindre le contenu — a chaque page, et
          l'annuaire en compte une par boutique. C'est le critere WCAG 2.4.1,
          de niveau A, et c'est celui qui coute le moins cher a poser.

          Il vise `#contenu`, pose sur la balise principale de chaque page.
        */}
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-nuit-900 focus:px-4 focus:py-2 focus:text-chaux-50"
        >
          Aller au contenu
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSur(donneesStructurees) }}
        />
        <EnregistrementServiceWorker />
        {children}
      </body>
    </html>
  );
}
