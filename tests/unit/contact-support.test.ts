import { describe, expect, it } from 'vitest';
import { COURRIEL_SUPPORT, porteSupport } from '@/lib/contactSupport';

/**
 * Il y a TOUJOURS une porte pour nous joindre.
 *
 * `SansBoutique` — l'écran d'un marchand qui vient de créer son compte —
 * enveloppait tout son bloc de contact dans `{(whatsapp || telephone) && …}`.
 * Les deux variables absentes, le bloc disparaissait, et il ne restait que
 * « Écrivez-nous […] et nous vous rappelons » : sans rien à cliquer.
 *
 * C'est le seul écran dont l'issue dépende entièrement de nous — le marchand
 * n'a pas de boutique et ne peut rien faire d'autre que nous joindre.
 *
 * ⚠ La variable EST posée en production au 2 septembre 2026 : le défaut est
 * latent, pas vivant. Mais une variable `NEXT_PUBLIC_` est inlinée AU BUILD ;
 * elle se perd sans bruit sur un nouvel environnement, et rien n'échoue.
 */

const MESSAGE = 'Bonjour, je souhaite ouvrir ma boutique.';
const OBJET = 'Ouvrir ma boutique';

describe('sans numero WhatsApp, la porte reste ouverte', () => {
  it('LE DEFAUT : il ne restait AUCUN lien', () => {
    const p = porteSupport({ whatsapp: '', telephone: '', message: MESSAGE, objet: OBJET });
    expect(p.href).toContain(`mailto:${COURRIEL_SUPPORT}`);
    expect(p.href).not.toBe('');
  });

  it('et le libelle dit le VRAI canal', () => {
    // « Nous écrire sur WhatsApp » au-dessus d'un `mailto:` ferait chercher une
    // conversation qui n'existe pas : le marchand croirait le bouton casse.
    const p = porteSupport({ whatsapp: null, telephone: null, message: MESSAGE, objet: OBJET });
    expect(p.libelle).toContain('e-mail');
    expect(p.libelle).not.toMatch(/WhatsApp/i);
  });

  it('l objet du courriel voyage, encode', () => {
    const p = porteSupport({ whatsapp: '', telephone: '', message: MESSAGE, objet: 'Un été' });
    expect(p.href).toContain(encodeURIComponent('Un été'));
  });
});

describe('avec un numero, c est WhatsApp', () => {
  it('temoin : le lien mene bien a la conversation', () => {
    // Sans lui, « il y a toujours une porte » serait vrai d'une fonction qui
    // rendrait toujours un mailto.
    const p = porteSupport({ whatsapp: '2250102918886', telephone: null, message: MESSAGE, objet: OBJET });
    expect(p.href).toContain('wa.me/2250102918886');
    expect(p.libelle).toContain('WhatsApp');
  });

  it('le numero est nettoye de tout ce qui n est pas un chiffre', () => {
    const p = porteSupport({ whatsapp: '+225 01 02 91 88 86', telephone: null, message: MESSAGE, objet: OBJET });
    expect(p.href).toContain('wa.me/2250102918886');
  });

  it('le message pre-ecrit s affiche chez la personne, donc il est encode', () => {
    const p = porteSupport({ whatsapp: '2250102918886', telephone: null, message: 'Bonjour à vous', objet: OBJET });
    expect(p.href).toContain(encodeURIComponent('Bonjour à vous'));
  });
});

describe('le lien d appel', () => {
  it('n existe que si un numero est configure', () => {
    expect(porteSupport({ whatsapp: '', telephone: '', message: MESSAGE, objet: OBJET }).telephone).toBeNull();
  });

  it('garde la forme lisible a l affichage, et la forme composable dans le lien', () => {
    const p = porteSupport({ whatsapp: '', telephone: '+225 01 02 91 88 86', message: MESSAGE, objet: OBJET });
    expect(p.telephone?.affichage).toBe('+225 01 02 91 88 86');
    expect(p.telephone?.href).toBe('tel:+2250102918886');
  });
});
