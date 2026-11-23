import { lireHoraires, SEMAINE, type Jour } from '@/lib/horaires';
import { normaliserTelephone } from '@/lib/telephone';

/**
 * Ce qu'une page dit d'elle-meme aux moteurs — Google, Bing, et les assistants
 * qui repondent a leur place.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * Mesure le 23 novembre 2026 sur le HTML servi : la page d'un restaurant
 * declarait `Restaurant`, son nom, son adresse web et « Abidjan ». Rien
 * d'autre. Le menu, les prix, le telephone, les quartiers livres, les moyens de
 * paiement, les horaires etaient tous A L'ECRAN — et absents de ce que lit une
 * machine. A la question « ou commander une pizza a Cocody », un moteur n'avait
 * aucune raison de citer cette page plutot qu'une autre : elle ne disait ni
 * qu'elle vend des pizzas, ni qu'elle livre Cocody.
 *
 * ── LA REGLE : ON NE DECLARE QUE CE QUE LA PAGE AFFICHE ────────────────────
 *
 * Une donnee structuree qui dit autre chose que la page est une faute, et les
 * moteurs la sanctionnent. Chaque champ ci-dessous vient de la meme source que
 * l'ecran, et un champ que le marchand n'a pas rempli est OMIS — jamais
 * invente, jamais remplace par une valeur plausible. Une boutique sans
 * horaires ne declare pas « ouvert 24 h/24 » : elle ne declare rien, parce
 * qu'on ne le sait pas.
 *
 * Module pur : ni base, ni reseau. C'est ce qui permet de l'eprouver.
 */

const JOURS_SCHEMA: Record<Jour, string> = {
  lun: 'https://schema.org/Monday',
  mar: 'https://schema.org/Tuesday',
  mer: 'https://schema.org/Wednesday',
  jeu: 'https://schema.org/Thursday',
  ven: 'https://schema.org/Friday',
  sam: 'https://schema.org/Saturday',
  dim: 'https://schema.org/Sunday',
};

/** Les types qui portent un menu plutot qu'un catalogue. */
const TYPES_RESTAURATION = new Set(['Restaurant', 'FastFoodRestaurant', 'Bakery', 'CafeOrCoffeeShop']);

/** Au-dela, la page pese pour rien : un moteur n'a pas besoin de 300 lignes. */
export const ARTICLES_MAX = 60;

export type ArticleDeclare = {
  nom: string;
  description?: string;
  categorie?: string;
  prix: number;
  image?: string;
  /** `false` = epuise. Absent = on ne sait pas, donc on ne declare rien. */
  disponible?: boolean;
};

export type BoutiqueDeclaree = {
  url: string;
  type: string;
  nom: string;
  description?: string;
  logo?: string;
  telephone?: string;
  /** Le quartier ou se trouve la boutique. */
  zone?: string | null;
  /** « Cocody, Riviera » — tel que le marchand l'a ecrit. */
  zonesLivrees?: string | null;
  paiements?: string[] | null;
  horaires?: unknown;
  articles?: ArticleDeclare[];
};

const texte = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Une adresse d'image n'est declaree que si elle est absolue et en https. */
function imageSure(v: unknown): string | undefined {
  const url = texte(v);
  return /^https:\/\/[^\s]+$/.test(url) ? url : undefined;
}

function horairesDeclares(brut: unknown): Record<string, unknown>[] {
  const horaires = lireHoraires(brut);
  if (!horaires) return [];

  const lignes: Record<string, unknown>[] = [];
  for (const jour of SEMAINE) {
    const creneau = horaires[jour];
    if (!creneau) continue;
    lignes.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: JOURS_SCHEMA[jour],
      opens: creneau.ouvre,
      closes: creneau.ferme,
    });
  }
  return lignes;
}

function offre(a: ArticleDeclare): Record<string, unknown> {
  return {
    '@type': 'Offer',
    price: a.prix,
    priceCurrency: 'XOF',
    ...(a.disponible === false
      ? { availability: 'https://schema.org/OutOfStock' }
      : a.disponible === true
        ? { availability: 'https://schema.org/InStock' }
        : {}),
  };
}

/** Les articles, ranges par categorie, dans l'ordre ou elles apparaissent. */
function parCategorie(articles: ArticleDeclare[]): Map<string, ArticleDeclare[]> {
  const rayons = new Map<string, ArticleDeclare[]>();
  for (const a of articles) {
    const rayon = texte(a.categorie) || 'Divers';
    if (!rayons.has(rayon)) rayons.set(rayon, []);
    rayons.get(rayon)?.push(a);
  }
  return rayons;
}

function menuDeclare(url: string, articles: ArticleDeclare[]): Record<string, unknown> {
  return {
    '@type': 'Menu',
    '@id': `${url}#menu`,
    hasMenuSection: [...parCategorie(articles)].map(([rayon, plats]) => ({
      '@type': 'MenuSection',
      name: rayon,
      hasMenuItem: plats.map((p) => ({
        '@type': 'MenuItem',
        name: p.nom,
        ...(texte(p.description) ? { description: texte(p.description) } : {}),
        ...(imageSure(p.image) ? { image: imageSure(p.image) } : {}),
        offers: offre(p),
      })),
    })),
  };
}

function catalogueDeclare(articles: ArticleDeclare[]): Record<string, unknown> {
  return {
    '@type': 'OfferCatalog',
    name: 'Catalogue',
    itemListElement: articles.map((a) => ({
      ...offre(a),
      itemOffered: {
        '@type': 'Product',
        name: a.nom,
        ...(texte(a.description) ? { description: texte(a.description) } : {}),
        ...(texte(a.categorie) ? { category: texte(a.categorie) } : {}),
        ...(imageSure(a.image) ? { image: imageSure(a.image) } : {}),
      },
    })),
  };
}

/**
 * La fiche d'une boutique, telle qu'un moteur la lit.
 *
 * Un article sans nom ou sans prix lisible est ecarte : declarer « 0 XOF »
 * dirait qu'il est gratuit.
 */
export function structureBoutique(b: BoutiqueDeclaree): Record<string, unknown> {
  const articles = (b.articles ?? [])
    .filter((a) => texte(a.nom) && Number.isFinite(a.prix) && a.prix > 0)
    .slice(0, ARTICLES_MAX);

  const telephone = normaliserTelephone(b.telephone);
  const zones = texte(b.zonesLivrees)
    .split(/[,;/]|\bet\b/)
    .map((z) => z.trim())
    .filter((z) => z.length > 1);

  const prix = articles.map((a) => a.prix);
  const horaires = horairesDeclares(b.horaires);
  const paiements = (b.paiements ?? []).map(texte).filter(Boolean);
  const restauration = TYPES_RESTAURATION.has(b.type);

  return {
    '@context': 'https://schema.org',
    '@type': b.type,
    '@id': `${b.url}#boutique`,
    name: texte(b.nom),
    url: b.url,
    ...(texte(b.description) ? { description: texte(b.description) } : {}),
    ...(imageSure(b.logo) ? { image: imageSure(b.logo), logo: imageSure(b.logo) } : {}),
    ...(telephone.ok ? { telephone: `+${telephone.international}` } : {}),
    address: {
      '@type': 'PostalAddress',
      // « Abidjan » saisi comme quartier ne precise rien : la ville est deja
      // dite une ligne plus bas, et la repeter n'est pas une adresse.
      ...(texte(b.zone) && texte(b.zone).toLowerCase() !== 'abidjan'
        ? { streetAddress: texte(b.zone) }
        : {}),
      addressLocality: 'Abidjan',
      addressCountry: 'CI',
    },
    // Les quartiers nommes par le marchand, sinon la ville : c'est ce qui
    // repond a « qui livre a Cocody ».
    areaServed: zones.length
      ? zones.map((z) => ({ '@type': 'Place', name: z }))
      : { '@type': 'City', name: 'Abidjan' },
    ...(horaires.length ? { openingHoursSpecification: horaires } : {}),
    ...(paiements.length ? { paymentAccepted: paiements.join(', '), currenciesAccepted: 'XOF' } : {}),
    ...(prix.length
      ? { priceRange: `${Math.min(...prix)}–${Math.max(...prix)} FCFA` }
      : {}),
    ...(articles.length
      ? restauration
        ? { hasMenu: menuDeclare(b.url, articles) }
        : { hasOfferCatalog: catalogueDeclare(articles) }
      : {}),
    // Ce qu'on peut FAIRE sur cette page : commander.
    potentialAction: {
      '@type': 'OrderAction',
      target: { '@type': 'EntryPoint', urlTemplate: b.url, inLanguage: 'fr-CI' },
    },
  };
}

/** Les questions de l'accueil, telles qu'elles sont affichees. */
export function structureQuestions(
  url: string,
  questions: { q: string; r: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#questions`,
    mainEntity: questions
      .filter((x) => texte(x.q) && texte(x.r))
      .map((x) => ({
        '@type': 'Question',
        name: texte(x.q),
        acceptedAnswer: { '@type': 'Answer', text: texte(x.r) },
      })),
  };
}
