import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { descriptionBoutique, LONGUEUR_MAX_META } from '@/lib/metaBoutique';

/**
 * CE QUE LES GENS VOIENT AVANT D'OUVRIR LA BOUTIQUE.
 *
 * ── OÙ CETTE PHRASE APPARAÎT VRAIMENT ──────────────────────────────────────
 *
 * Pas seulement dans Google. **Quand un marchand colle le lien de sa boutique
 * dans WhatsApp**, l'aperçu affiche son titre et cette description — et
 * WhatsApp est LE canal de la plateforme. C'est donc la première phrase qu'un
 * client lit du commerce, avant même d'avoir cliqué.
 *
 * ── LE DÉFAUT, MESURÉ LE 3 SEPTEMBRE 2026 ──────────────────────────────────
 *
 * `boutiques/[id]/layout.tsx` s'ouvre sur : « Chaque boutique mérite son propre
 * titre et sa propre description. » Le titre, oui. La description, non : elle
 * était un **gabarit** — « Commandez chez X (secteur) a Abidjan et suivez votre
 * livraison en direct avec DjiguiFlow. » — identique pour toutes, et où le nom
 * de la plateforme prenait la place du commerce.
 *
 * Pendant ce temps `boutiques.description` existait, était remplie, servait à
 * la carte de l'annuaire et à sa recherche… et **`getMarchand` ne la lisait
 * pas**. Exactement le sort du logo, dont le commentaire dit : « IL N'ÉTAIT PAS
 * LU, ET C'EST LÀ QUE LA MARQUE SE PERDAIT. »
 */

const roseMonde = {
  nom: 'Rose Monde',
  secteur: 'vêtements et accessoire',
  description: 'Chaussures et vêtements pour enfants — livraison à Abidjan',
};

describe('la boutique parle d elle-meme quand elle a quelque chose a dire', () => {
  it('rend la phrase du marchand, telle quelle', () => {
    expect(descriptionBoutique(roseMonde)).toBe(
      'Chaussures et vêtements pour enfants — livraison à Abidjan',
    );
  });

  /**
   * LE CONTRÔLE QUI TIENT LA DÉCISION : le nom de la plateforme ne prend plus
   * la place du commerce. Si la règle retombait sur le gabarit, il
   * reviendrait — et toutes les boutiques se ressembleraient de nouveau.
   */
  it('et le nom de la plateforme n y figure plus', () => {
    expect(descriptionBoutique(roseMonde)).not.toContain('DjiguiFlow');
  });
});

/**
 * LE REPLI EST LÉGITIME, ET IL NE MASQUE RIEN.
 *
 * Une valeur par défaut qui cache une donnée manquante est le motif que ce
 * dépôt poursuit. Ici l'absence est déjà signalée ailleurs — `vitrine-muette`
 * la nomme dans la veille — donc le gabarit ne masque aucun silence : il évite
 * seulement une page sans description, qui serait pire.
 */
describe('sans description, le gabarit reprend la main', () => {
  it('rend le gabarit, avec le secteur', () => {
    const rendu = descriptionBoutique({ ...roseMonde, description: null });
    expect(rendu).toContain('Rose Monde');
    expect(rendu).toContain('vêtements et accessoire');
    expect(rendu).toContain('DjiguiFlow');
  });

  it('omet le secteur quand il manque, sans parenthese vide', () => {
    const rendu = descriptionBoutique({ nom: 'Rose Monde', secteur: '', description: '' });
    expect(rendu).not.toContain('()');
    expect(rendu).toContain('Rose Monde');
  });

  it('traite une description faite d espaces comme une absence', () => {
    expect(descriptionBoutique({ ...roseMonde, description: '   ' })).toContain('DjiguiFlow');
  });
});

describe('la forme de la phrase rendue', () => {
  /**
   * Google coupe autour de 160 caractères, et l'aperçu WhatsApp bien avant.
   * Une phrase tronquée au milieu d'un mot se lit mal : on coupe à l'espace.
   */
  it('borne une description trop longue, sur un mot entier', () => {
    // Des mots de longueurs inégales : avec « mot mot mot… », une coupe au
    // milieu d'un mot tomberait par hasard sur une frontière une fois sur
    // quatre, et le contrôle passerait sans rien prouver.
    const longue = `${'alpha bravocharlie delta echofoxtrot '.repeat(8)}fin`;
    const rendu = descriptionBoutique({ ...roseMonde, description: longue });

    expect(rendu.length).toBeLessThanOrEqual(LONGUEUR_MAX_META);
    expect(rendu.endsWith('…')).toBe(true);

    /**
     * AUCUN MOT TRANCHÉ. Le texte rendu, privé de son signe de coupe, doit être
     * un début exact de la description — et s'arrêter sur une frontière de mot,
     * donc être suivi d'une espace dans l'original.
     */
    const sansSigne = rendu.slice(0, -1);
    expect(longue.startsWith(sansSigne)).toBe(true);
    expect(longue[sansSigne.length]).toBe(' ');
  });

  it('ecrase les espaces et les retours a la ligne', () => {
    const rendu = descriptionBoutique({ ...roseMonde, description: 'Deux\n\nlignes   collees' });
    expect(rendu).toBe('Deux lignes collees');
  });

  it('ne touche pas a une description courte et propre', () => {
    expect(descriptionBoutique({ ...roseMonde, description: 'Maquis' })).toBe('Maquis');
  });
});

/**
 * LES DEUX GARDES QUI RELIENT LA RÈGLE À CE QUI EST SERVI.
 *
 * La fonction peut être parfaite : si `getMarchand` ne lit pas la colonne, elle
 * recevra toujours `undefined` et rendra le gabarit pour tout le monde — sans
 * qu'aucun test de règle ne bronche. C'est précisément ce qui est arrivé au
 * logo, et à `porteSupport` le 2 septembre.
 */
describe('la donnee arrive vraiment jusqu a la page', () => {
  const REGISTRE = readFileSync('src/lib/marchands.ts', 'utf8');
  const LAYOUT = readFileSync('src/app/boutiques/[id]/layout.tsx', 'utf8');

  it('getMarchand demande la colonne a la base, et l expose', () => {
    expect(REGISTRE).toContain('description');
    // Dans le `select`, pas seulement dans un commentaire.
    const debut = REGISTRE.indexOf('.select(');
    const select = REGISTRE.slice(debut, REGISTRE.indexOf(')', debut));
    expect(select).toContain('description');
  });

  it('le layout passe par la regle, et ne refabrique plus sa phrase', () => {
    expect(LAYOUT).toContain("from '@/lib/metaBoutique'");
    expect(LAYOUT).toContain('descriptionBoutique(');
    // Le gabarit vit dans la règle desormais : le layout ne doit plus le porter.
    expect(LAYOUT).not.toContain('suivez votre livraison en direct');
  });
});
