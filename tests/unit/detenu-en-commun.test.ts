import { describe, expect, it } from 'vitest';
import { detenuEnCommun } from '@/lib/dossierClient';

/**
 * La phrase « nous y conservons… » ne se dit une fois que si elle est une.
 *
 * Mesuré sur l'écran des droits le 2 septembre 2026 : six commandes, six fois
 * « Nous y conservons votre nom, votre adresse de livraison, votre identifiant
 * de messagerie. » — mot pour mot. Ce qui se répète à l'identique ne distingue
 * rien, et occupait plus de hauteur que les références.
 *
 * MAIS `detenu` EST CALCULÉ PAR COMMANDE. Une commande de la vitrine et une
 * autre prise sur WhatsApp ne retiennent pas les mêmes champs. Hisser la
 * phrase sans condition dirait donc parfois faux — et sur un écran de droits,
 * dire faux sur ce qu'on détient est la faute à ne pas commettre.
 */

const cmd = (...detenu: string[]) => ({ detenu });

describe('la phrase se hisse quand elle est commune', () => {
  it('LE CAS MESURE : six commandes identiques donnent une seule phrase', () => {
    const six = Array.from({ length: 6 }, () =>
      cmd('votre nom', 'votre adresse de livraison', 'votre identifiant de messagerie'));
    expect(detenuEnCommun(six))
      .toBe('votre nom, votre adresse de livraison, votre identifiant de messagerie');
  });

  it('deux commandes suffisent', () => {
    expect(detenuEnCommun([cmd('votre nom'), cmd('votre nom')])).toBe('votre nom');
  });
});

describe('elle NE se hisse PAS des que les commandes divergent', () => {
  it('un champ de plus sur une seule commande suffit a tout garder par ligne', () => {
    // C'est le coeur de la regle : la phrase redevient une information des
    // qu'elle distingue.
    expect(detenuEnCommun([
      cmd('votre nom', 'votre adresse de livraison'),
      cmd('votre nom'),
    ])).toBeNull();
  });

  it('un champ different, a nombre egal, ne passe pas non plus', () => {
    // Comparer les longueurs seules aurait laisse passer celui-ci.
    expect(detenuEnCommun([
      cmd('votre nom', 'votre adresse de livraison'),
      cmd('votre nom', 'votre identifiant de messagerie'),
    ])).toBeNull();
  });

  it('l ordre compte, et on ne trie pas pour le masquer', () => {
    // `detenuSurCommande` enumere toujours dans le meme ordre : un ordre
    // different veut dire que quelque chose a change en amont, et ce n'est
    // pas a l'affichage de le cacher.
    expect(detenuEnCommun([
      cmd('votre nom', 'votre adresse de livraison'),
      cmd('votre adresse de livraison', 'votre nom'),
    ])).toBeNull();
  });
});

describe('les cas ou il n y a rien a dire en commun', () => {
  it('une seule commande garde sa phrase sur sa ligne', () => {
    // Il n'y a rien a dedupliquer, et « pour chacune » sur une seule commande
    // annoncerait un ensemble qui n'existe pas.
    expect(detenuEnCommun([cmd('votre nom')])).toBeNull();
  });

  it('aucune commande', () => {
    expect(detenuEnCommun([])).toBeNull();
  });

  it('des commandes qui ne detiennent rien ne produisent pas une phrase vide', () => {
    expect(detenuEnCommun([cmd(), cmd()])).toBeNull();
  });
});
