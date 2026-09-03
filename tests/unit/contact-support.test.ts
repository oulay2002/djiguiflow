import { readFileSync } from 'node:fs';
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

/**
 * L'ÉCRAN LUI-MÊME, ET PAS SEULEMENT LA FONCTION.
 *
 * ── CE QUE CE GARDE A COÛTÉ AVANT D'EXISTER ────────────────────────────────
 *
 * `porteSupport` garantit qu'il y a toujours un lien. Elle ne garantit pas
 * qu'on l'affiche. Le défaut d'origine n'était pas dans le calcul du lien : il
 * était dans le JSX, où tout le bloc de contact était enveloppé dans
 * `{(whatsapp || telephone) && …}`.
 *
 * Établi le 3 septembre 2026 : le commit du 30 août constate, vérifié en
 * production ce jour-là, que `NEXT_PUBLIC_SUPPORT_WHATSAPP` « n'est posée nulle
 * part » — et `NEXT_PUBLIC_SUPPORT_PHONE` ne l'était pas davantage. **Les deux
 * personnes inscrites les 24 et 25 août ont donc vu un écran qui leur demandait
 * de nous écrire sans rien à cliquer.** Ni bouton, ni adresse, ni numéro.
 * L'une est revenue trois minutes plus tard. Aucune n'est jamais revenue après.
 *
 * Les tests du dessus étaient tous verts pendant ce temps-là : ils éprouvaient
 * la fonction, que personne n'appelait au bon endroit.
 *
 * ── CE QUE CE GARDE TIENT ──────────────────────────────────────────────────
 *
 * Que les variables d'environnement ne puissent pas redevenir un interrupteur,
 * et que le lien principal ne soit enveloppé dans aucune condition. Le lien
 * d'appel, lui, a le droit d'être conditionnel : sans numéro configuré il n'y a
 * rien à composer, et `porteSupport` rend alors `null`.
 */
describe('le seul bouton du nouveau marchand ne peut plus disparaitre', () => {
  const source = readFileSync('src/components/dashboard/SansBoutique.tsx', 'utf8');

  it('la porte vient de porteSupport, et de nulle part ailleurs', () => {
    expect(source).toContain("from '@/lib/contactSupport'");
    expect(source).toContain('porteSupport({');
  });

  it('les variables d environnement ne sont lues QUE pour la construire', () => {
    // LE DEFAUT D ORIGINE COMMENCAIT LA : elles etaient lues dans des variables
    // locales, qui servaient ensuite a CONDITIONNER le JSX. Les garder a
    // l interieur de l appel les empeche de redevenir un interrupteur.
    const debut = source.indexOf('porteSupport({');
    const appel = source.slice(debut, source.indexOf('});', debut));

    const total = (source.match(/NEXT_PUBLIC_SUPPORT_/g) ?? []).length;
    const dansLAppel = (appel.match(/NEXT_PUBLIC_SUPPORT_/g) ?? []).length;

    expect(total).toBeGreaterThan(0);
    expect(dansLAppel).toBe(total);
  });

  it('le lien principal n est enveloppe dans AUCUNE condition', () => {
    const avantLeLien = source.slice(
      source.indexOf('return ('),
      source.indexOf('href={support.href}'),
    );

    // Un temoin : sur un fichier renomme, les deux index vaudraient -1 et la
    // tranche serait vide — un garde vide passe au vert sans rien tenir.
    expect(avantLeLien.length).toBeGreaterThan(200);
    expect(avantLeLien).not.toContain('&&');
  });
});
