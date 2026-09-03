import type { Metadata } from 'next';
import Link from 'next/link';
import { getMarchand } from '@/lib/marchands';
import { SITE_LOCALE, SITE_NOM, SITE_URL } from '@/lib/site';
import { jsonLdSur } from '@/lib/jsonLd';
import { descriptionBoutique } from '@/lib/metaBoutique';

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

  // RETIREE DE L'ANNUAIRE : meme traitement qu'une page d'erreur.
  //
  // Jusqu'au 22 aout 2026, une boutique `actif = false` rendait `index, follow`
  // avec sa canonique et ses donnees structurees completes — exactement comme
  // une boutique en ligne. La plateforme la cachait de son propre annuaire et
  // la designait a Google dans le meme temps.
  //
  // Ce que ca coute : la boutique de demonstration etait soumise a
  // l'indexation ; et le jour ou un marchand part ou est suspendu, sa page lui
  // survit dans les resultats de recherche, avec un balisage `Restaurant` qui
  // affirme un commerce en activite. Le commentaire de TYPES_SCHEMA le dit plus
  // bas : « Google sanctionne les donnees structurees non conformes a la page ».
  //
  // La page reste ATTEIGNABLE — un lien deja partage ne doit pas casser — mais
  // elle n'est plus proposee.
  if (!m.actif) {
    return {
      title: `${m.nom} — boutique momentanement hors annuaire`,
      robots: { index: false, follow: false },
    };
  }

  const titre = `${m.nom} — commander en ligne a Abidjan`;

  /**
   * LA PHRASE DU MARCHAND D'ABORD, LE GABARIT SEULEMENT S'IL N'EN A PAS.
   *
   * Le commentaire en tete de ce fichier promettait « sa propre description »
   * depuis le debut. Le titre l'honorait ; la description non — elle etait un
   * gabarit identique pour toutes, ou le nom de la plateforme prenait la place
   * du commerce. Et `boutiques.description` etait remplie tout ce temps : c'est
   * `getMarchand` qui ne la lisait pas.
   *
   * Ce n'est pas qu'une affaire de referencement : c'est la phrase que WhatsApp
   * affiche quand un marchand colle le lien de sa boutique.
   */
  const description = descriptionBoutique(m);
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

  // LA MODE, QUE LA PLATEFORME VISE ET QUE CETTE TABLE IGNORAIT.
  //
  // Une boutique de vetements tombait sur le repli `LocalBusiness` : valide,
  // mais muet. `ClothingStore` et `ShoeStore` sont des types que Google sait
  // presenter richement — et c'est precisement le commerce pour lequel on
  // vient d'ajouter les pointures, les tailles et les coloris.
  //
  // Etendre cette table ne coute RIEN quand elle se trompe : le repli reste
  // `LocalBusiness`, toujours valide. C'est l'inverse d'une liste fermee qui
  // refuse ce qu'elle ne connait pas.
  mode: 'ClothingStore',
  vetement: 'ClothingStore',
  vetements: 'ClothingStore',
  'vetements et accessoire': 'ClothingStore',
  'vetements et accessoires': 'ClothingStore',
  'pret-a-porter': 'ClothingStore',
  friperie: 'ClothingStore',
  chaussure: 'ShoeStore',
  chaussures: 'ShoeStore',
  bijouterie: 'JewelryStore',
  cosmetique: 'HealthAndBeautyBusiness',
  cosmetiques: 'HealthAndBeautyBusiness',
  beaute: 'HealthAndBeautyBusiness',
  coiffure: 'HairSalon',
  electronique: 'ElectronicsStore',
  telephone: 'ElectronicsStore',
  librairie: 'BookStore',
  quincaillerie: 'HardwareStore',
};

function typeSchema(secteur: string): string {
  // U+0300 a U+036F, en echappements : ces caracteres sont INVISIBLES a
  // l affichage, et une edition ulterieure les effacerait sans qu on le voie.
  // NFD puis retrait des diacritiques combinants, pour que « supermarché »
  // et « supermarche » tombent sur la meme cle.
  const cle = secteur
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\u0300-\u036f]', 'g'), '');
  return TYPES_SCHEMA[cle] ?? 'LocalBusiness';
}

export default async function BoutiqueLayout({ children, params }: Props) {
  const { id } = await params;
  const m = await getMarchand(id);

  // Meme raison que le `noindex` plus haut : ne pas affirmer un commerce en
  // activite pour une boutique retiree de l'annuaire.
  const donneesStructurees = m && m.actif
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
          dangerouslySetInnerHTML={{ __html: jsonLdSur(donneesStructurees) }}
        />
      )}
      {children}

      {/**
        * LA VITRINE DU MARCHAND EST AUSSI LA NOTRE.
        *
        * Chaque vitrine est vue par les CLIENTS du marchand — et parmi les
        * clients d'un commerce d'Abidjan, il y a d'autres commercants. Ce sont
        * les prospects les mieux qualifies qui existent : ils voient le produit
        * fonctionner sur un commerce qu'ils connaissent, pas sur une page de
        * vente. Avant cette bande, rien ne le leur disait : le nom de la
        * plateforme n'apparaissait que dans la meta-description, que personne
        * ne lit.
        *
        * ELLE S'ADRESSE AU COMMERCANT, PAS A L'ACHETEUR. L'acheteur venu
        * commander son attieke ne s'y interesse pas, et c'est voulu : la
        * question en tete filtre d'elle-meme, celui qui n'est pas commercant
        * passe. C'est ce qui separe une mention utile d'un bandeau
        * publicitaire pose sur le commerce de quelqu'un d'autre.
        *
        * DISCRETE PAR CONSTRUCTION : sous la ligne de flottaison, petit texte,
        * aucun logo. La marque du marchand doit rester la seule que l'on voit.
        *
        * SEULEMENT SI LA BOUTIQUE EST ACTIVE. Meme raison que le `noindex` et
        * les donnees structurees plus haut : « cette boutique prend ses
        * commandes » serait faux pour une boutique retiree de l'annuaire.
        *
        * LA MARGE BASSE N'EST PAS DECORATIVE. La page pose une barre de panier
        * `fixed bottom-0` sur telephone des qu'un article est choisi : sans ces
        * 6 rem, elle recouvrirait cette bande exactement chez les visiteurs les
        * plus engages — ceux qui ont deja rempli un panier.
        */}
      {m?.actif && (
        <aside className="border-t border-chaux-200 bg-chaux-100 px-4 pb-24 pt-5 text-center lg:pb-5">
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-chaux-600">
            <strong className="font-semibold text-nuit-800">Vous tenez un commerce ?</strong>{' '}
            Cette boutique prend ses commandes sur WhatsApp avec {SITE_NOM}.{' '}
            <Link
              href="/"
              className="font-semibold text-nuit-800 underline underline-offset-2 hover:text-bissap-500"
            >
              Ouvrir la mienne
            </Link>
          </p>
        </aside>
      )}
    </>
  );
}
