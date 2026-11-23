/* eslint-disable @typescript-eslint/no-explicit-any --
   Les donnees structurees sont un arbre JSON libre : le typer ici reviendrait
   a recopier schema.org. On lit donc l'arbre tel quel, et ce sont les
   assertions qui disent ce qu'il doit contenir. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ARTICLES_MAX, structureBoutique, structureQuestions } from '@/lib/donneesStructurees';

/**
 * Ce qu'une page dit d'elle-meme aux moteurs.
 *
 * LA REGLE QUE CES TESTS TIENNENT : on ne declare que ce que la page affiche,
 * et un champ que le marchand n'a pas rempli est OMIS — jamais invente. Une
 * donnee structuree fausse est pire qu'une donnee absente : les moteurs la
 * sanctionnent, et un assistant la repete a un client.
 */

const URL = 'https://www.djiguiflow.com/boutiques/chez-awa';

const COMPLETE = {
  url: URL,
  type: 'Restaurant',
  nom: 'Chez Awa',
  description: 'Grillades et plats ivoiriens.',
  logo: 'https://exemple.supabase.co/storage/v1/object/public/images/logo.webp',
  telephone: '0700000042',
  zone: 'Cocody - Angré',
  zonesLivrees: 'Cocody, Riviera et Bingerville',
  paiements: ['Espèces à la livraison', 'Wave'],
  horaires: { lun: { ouvre: '08:00', ferme: '20:00' }, dim: null },
  articles: [
    { nom: 'Poulet braisé', description: 'Demi-poulet', categorie: 'Grillades', prix: 3500, disponible: true },
    { nom: 'Alloco', categorie: 'Accompagnements', prix: 500, disponible: false },
    { nom: 'Jus de bissap', categorie: 'Boissons', prix: 300 },
  ],
};

describe('la fiche d’une boutique', () => {
  const s = structureBoutique(COMPLETE) as Record<string, any>;

  it('dit qui elle est et ou la trouver', () => {
    expect(s['@type']).toBe('Restaurant');
    expect(s['@id']).toBe(`${URL}#boutique`);
    expect(s.name).toBe('Chez Awa');
    expect(s.url).toBe(URL);
    expect(s.telephone).toBe('+2250700000042');
    expect(s.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Cocody - Angré',
      addressLocality: 'Abidjan',
      addressCountry: 'CI',
    });
  });

  it('nomme les quartiers livres, un par un', () => {
    // C'est ce qui repond a « qui livre a Cocody ».
    expect(s.areaServed.map((z: any) => z.name)).toEqual(['Cocody', 'Riviera', 'Bingerville']);
  });

  it('declare le menu, par categorie, avec les prix en francs CFA', () => {
    const rayons = s.hasMenu.hasMenuSection;
    expect(rayons.map((r: any) => r.name)).toEqual(['Grillades', 'Accompagnements', 'Boissons']);
    const poulet = rayons[0].hasMenuItem[0];
    expect(poulet.name).toBe('Poulet braisé');
    expect(poulet.offers).toMatchObject({ price: 3500, priceCurrency: 'XOF' });
    expect(s.priceRange).toBe('300–3500 FCFA');
  });

  it('dit « epuise » seulement quand on le sait', () => {
    const [poulet] = s.hasMenu.hasMenuSection[0].hasMenuItem;
    const [alloco] = s.hasMenu.hasMenuSection[1].hasMenuItem;
    const [bissap] = s.hasMenu.hasMenuSection[2].hasMenuItem;
    expect(poulet.offers.availability).toBe('https://schema.org/InStock');
    expect(alloco.offers.availability).toBe('https://schema.org/OutOfStock');
    // Stock non suivi : on ne sait pas, on ne declare rien.
    expect(bissap.offers.availability).toBeUndefined();
  });

  it('declare les jours ouverts, et se tait sur les jours fermes', () => {
    expect(s.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '08:00', closes: '20:00' },
    ]);
  });

  it('declare les moyens de paiement', () => {
    expect(s.paymentAccepted).toBe('Espèces à la livraison, Wave');
    expect(s.currenciesAccepted).toBe('XOF');
  });
});

describe('ce qu’on ne sait pas ne se declare pas', () => {
  const s = structureBoutique({ url: URL, type: 'Restaurant', nom: 'Chez Awa' }) as Record<string, any>;

  it('une fiche vide ne porte aucun champ invente', () => {
    for (const champ of ['description', 'image', 'logo', 'telephone', 'openingHoursSpecification',
      'paymentAccepted', 'priceRange', 'hasMenu', 'hasOfferCatalog']) {
      expect(s[champ], champ).toBeUndefined();
    }
    // Ni « ouvert 24 h/24 », ni adresse de rue : on ne les connait pas.
    expect(s.address.streetAddress).toBeUndefined();
    expect(s.areaServed).toEqual({ '@type': 'City', name: 'Abidjan' });
  });

  it('« Abidjan » saisi comme quartier n’est pas repete en adresse', () => {
    for (const zone of ['ABIDJAN', 'Abidjan', ' abidjan ']) {
      const adresse = (structureBoutique({ url: URL, type: 'Restaurant', nom: 'X', zone }) as any).address;
      expect(adresse.streetAddress, zone).toBeUndefined();
      expect(adresse.addressLocality).toBe('Abidjan');
    }
  });

  it('un numero qui n’en est pas un n’est pas declare', () => {
    for (const telephone of ['12345', 'appelez-moi', '']) {
      expect((structureBoutique({ url: URL, type: 'Restaurant', nom: 'X', telephone }) as any).telephone).toBeUndefined();
    }
  });

  it('un article sans prix lisible est ecarte — « 0 XOF » dirait qu’il est gratuit', () => {
    const avec = structureBoutique({
      url: URL, type: 'Restaurant', nom: 'X',
      articles: [
        { nom: 'Sans prix', prix: 0 },
        { nom: 'Prix illisible', prix: Number.NaN },
        { nom: '', prix: 500 },
        { nom: 'Bon', prix: 1000 },
      ],
    }) as Record<string, any>;
    const noms = avec.hasMenu.hasMenuSection.flatMap((r: any) => r.hasMenuItem.map((i: any) => i.name));
    expect(noms).toEqual(['Bon']);
  });

  it('une image qui n’est pas en https n’est pas declaree', () => {
    for (const logo of ['http://exemple.com/a.png', '/logo.png', 'javascript:alert(1)']) {
      expect((structureBoutique({ url: URL, type: 'Restaurant', nom: 'X', logo }) as any).image).toBeUndefined();
    }
  });
});

describe('la forme suit le metier', () => {
  const articles = [{ nom: 'Robe wax', categorie: 'Robes', prix: 15000 }];

  it('un restaurant porte un menu', () => {
    const s = structureBoutique({ url: URL, type: 'Restaurant', nom: 'X', articles }) as any;
    expect(s.hasMenu).toBeDefined();
    expect(s.hasOfferCatalog).toBeUndefined();
  });

  it('une boutique de mode porte un catalogue, pas un menu', () => {
    const s = structureBoutique({ url: URL, type: 'ClothingStore', nom: 'X', articles }) as any;
    expect(s.hasMenu).toBeUndefined();
    expect(s.hasOfferCatalog.itemListElement[0]).toMatchObject({
      price: 15000,
      priceCurrency: 'XOF',
      itemOffered: { '@type': 'Product', name: 'Robe wax', category: 'Robes' },
    });
  });

  it('un tres gros catalogue est borne', () => {
    const beaucoup = Array.from({ length: ARTICLES_MAX + 40 }, (_, i) => ({ nom: `Article ${i}`, prix: 1000 }));
    const s = structureBoutique({ url: URL, type: 'ClothingStore', nom: 'X', articles: beaucoup }) as any;
    expect(s.hasOfferCatalog.itemListElement).toHaveLength(ARTICLES_MAX);
  });
});

describe('les questions de l’accueil', () => {
  it('sont declarees telles qu’elles sont affichees, et les vides sont ecartees', () => {
    const s = structureQuestions('https://www.djiguiflow.com', [
      { q: 'Faut-il une application ?', r: 'Non.' },
      { q: '', r: 'Orpheline' },
    ]) as Record<string, any>;
    expect(s['@type']).toBe('FAQPage');
    expect(s.mainEntity).toEqual([
      { '@type': 'Question', name: 'Faut-il une application ?', acceptedAnswer: { '@type': 'Answer', text: 'Non.' } },
    ]);
  });
});

describe('les pages publiques ne se declarent pas copie de l’accueil', () => {
  // Le layout racine pose `canonical: '/'`. Une page qui n'en pose pas une a
  // elle en herite — et dit a un moteur : « je suis l'accueil, ne m'indexez
  // pas ». La page d'aide etait dans ce cas, mesure sur le HTML servi.
  it.each([
    ['src/app/aide/brancher/page.tsx', "canonical: '/aide/brancher'"],
    ['src/app/legal/page.tsx', "canonical: '/legal'"],
    ['src/app/boutiques/layout.tsx', "canonical: '/boutiques'"],
  ])('%s pose sa propre adresse canonique', (chemin, attendu) => {
    expect(readFileSync(chemin, 'utf8')).toContain(attendu);
  });
});

describe('une boutique de demonstration reste en ligne sans etre proposee aux moteurs', () => {
  // `zahara` est factice. Depuis que chaque vitrine declare menu, prix et
  // telephone, une boutique factice indexee serait un faux restaurant avec une
  // fiche complete. Le drapeau `indexable` la retire des trois endroits ou un
  // moteur la trouverait — et de ces trois-la ensemble, sinon il la retrouve
  // par celui qu'on a oublie.
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');

  it('le plan du site ne la soumet pas', () => {
    expect(lire('src/app/sitemap.ts')).toContain('m.actif && m.indexable !== false');
  });

  it('llms.txt ne la liste pas', () => {
    expect(lire('src/app/llms.txt/route.ts')).toContain('m.actif && m.indexable !== false');
  });

  it('sa page se declare noindex, et ne publie pas sa fiche', () => {
    const page = lire('src/app/boutiques/[id]/layout.tsx');
    expect(page).toContain('m.indexable === false ? { robots: { index: false, follow: true } }');
    expect(page).toContain('if (m && m.actif && m.indexable !== false) {');
  });

  it('une valeur absente vaut « indexable » : on ne retire jamais par defaut', () => {
    expect(lire('src/lib/marchands.ts')).toContain('indexable: b.indexable !== false,');
  });
});
