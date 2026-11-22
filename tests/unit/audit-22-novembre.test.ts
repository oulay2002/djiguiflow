import { describe, expect, it } from 'vitest';

import { memeChat } from '@/lib/appariementChat';
import { LIGNES_MAX, QUANTITE_MAX, lirePanierDemande } from '@/lib/panierDemande';
import { telephoneAtteste } from '@/lib/preuveClient';
import { cheminInterneSur } from '@/lib/redirection';
import { estReferenceDeVitrine, referenceDeVitrine } from '@/lib/reference';

/**
 * Les verrous poses a l'audit du 22 novembre 2026, cote fonctions pures.
 *
 * Chaque bloc porte le defaut qu'il ferme. Un test dont on ne sait plus ce
 * qu'il protege finit supprime le jour ou il gene.
 */

describe('le panier demande — fondu puis borne', () => {
  it('FOND LES DOUBLONS : le stock se juge sur la somme, pas ligne par ligne', () => {
    // Stock de 3, dix lignes de 3 : chaque ligne passait le controle, et la
    // commande portait 30 unites d'un article dont il restait 3.
    const panier = Array.from({ length: 10 }, () => ({ id: 'A', quantite: 3 }));
    const lu = lirePanierDemande(panier);
    expect(lu).toEqual({ ok: true, lignes: [{ id: 'A', quantite: 30, variante: '' }] });
  });

  it('ne fond PAS deux declinaisons du meme article', () => {
    const lu = lirePanierDemande([
      { id: 'A', quantite: 1, variante: '39' },
      { id: 'A', quantite: 1, variante: '41' },
    ]);
    expect(lu.ok && lu.lignes).toHaveLength(2);
  });

  it('refuse une quantite fractionnaire, negative ou illisible', () => {
    for (const quantite of [2.5, -1, 0, 'beaucoup', Number.NaN, 1e400]) {
      expect(lirePanierDemande([{ id: 'A', quantite }]).ok, String(quantite)).toBe(false);
    }
  });

  it('une quantite absente vaut 1, comme avant', () => {
    expect(lirePanierDemande([{ id: 'A' }])).toEqual({
      ok: true,
      lignes: [{ id: 'A', quantite: 1, variante: '' }],
    });
  });

  it('refuse au-dela de la quantite maximale — y compris par addition de doublons', () => {
    expect(lirePanierDemande([{ id: 'A', quantite: QUANTITE_MAX + 1 }]).ok).toBe(false);
    expect(
      lirePanierDemande([
        { id: 'A', quantite: QUANTITE_MAX },
        { id: 'A', quantite: 1 },
      ]).ok,
    ).toBe(false);
    expect(lirePanierDemande([{ id: 'A', quantite: QUANTITE_MAX }]).ok).toBe(true);
  });

  it('refuse un panier de cinquante mille lignes sans le parcourir en entier', () => {
    const enorme = Array.from({ length: 50_000 }, (_, i) => ({ id: `P${i}`, quantite: 1 }));
    expect(lirePanierDemande(enorme).ok).toBe(false);
  });

  it('refuse plus de lignes distinctes que la limite', () => {
    const trop = Array.from({ length: LIGNES_MAX + 1 }, (_, i) => ({ id: `P${i}` }));
    expect(lirePanierDemande(trop).ok).toBe(false);
    expect(lirePanierDemande(trop.slice(0, LIGNES_MAX)).ok).toBe(true);
  });

  it('ce qui n’est pas un tableau est un panier vide, pas une erreur', () => {
    for (const v of [undefined, null, 'x', 3, {}]) {
      expect(lirePanierDemande(v)).toEqual({ ok: true, lignes: [] });
    }
  });
});

describe('la redirection apres connexion', () => {
  it('REFUSE LA TABULATION : le navigateur la retire et lit `//evil.example`', () => {
    // `/login?next=/%09/evil.example` emmenait le marchand chez un tiers juste
    // apres une authentification reussie.
    expect(cheminInterneSur('/\t/evil.example/x')).toBe('/dashboard');
    expect(cheminInterneSur('/\t\t//evil.example')).toBe('/dashboard');
    expect(cheminInterneSur('/dashboard\t')).toBe('/dashboard');
  });

  it('refuse tout caractere de controle et tout antislash, ou qu’ils soient', () => {
    for (const cible of ['/a\rb', '/a\nb', '/a\0b', '/a\u000bb', '/a\u007fb', '/a\\b', '/\\evil.example']) {
      expect(cheminInterneSur(cible), JSON.stringify(cible)).toBe('/dashboard');
    }
  });

  it('refuse toujours les formes deja connues', () => {
    for (const cible of ['//evil.example', 'https://evil.example', 'evil.example', '', null, undefined]) {
      expect(cheminInterneSur(cible)).toBe('/dashboard');
    }
  });

  it('laisse passer un vrai chemin interne, avec sa requete et son ancre', () => {
    for (const cible of ['/dashboard/commandes', '/dashboard?boutique=zahara#haut', '/onboarding']) {
      expect(cheminInterneSur(cible)).toBe(cible);
    }
  });
});

describe('un numero ATTESTE n’est pas un numero SAISI', () => {
  it('la fabrique et le detecteur de reference de vitrine sont accordes', () => {
    // Si l'un change sans l'autre, une commande de vitrine redevient une
    // preuve de numero — c'est-a-dire la fuite elle-meme.
    for (const prefixe of ['ZAH', 'DJ', 'A', 'R0S']) {
      expect(estReferenceDeVitrine(referenceDeVitrine(prefixe)), prefixe).toBe(true);
    }
  });

  it('une reference de l’assistante n’a pas la forme d’une reference de vitrine', () => {
    for (const ref of ['ATT-1000000006', 'ZH-42', 'ZAH-12', '']) {
      expect(estReferenceDeVitrine(ref), ref).toBe(false);
    }
  });

  const whatsapp = {
    reference: 'ATT-1000000006',
    canal: 'whatsapp',
    chat_id: '2250102918886',
    client_telephone: '0102918886',
  };

  it('ATTESTE : commande WhatsApp dont le telephone EST l’expediteur', () => {
    expect(telephoneAtteste(whatsapp)).toBe(true);
  });

  it('PAS ATTESTE : commande de vitrine — le numero y est tape', () => {
    // La vitrine ecrit `chat_id = telephone` : sans le controle de forme, elle
    // passerait pour attestee, et commander au numero d'un voisin ouvrirait
    // son dossier.
    const tape = '2250102918886';
    expect(
      telephoneAtteste({
        reference: referenceDeVitrine('ZAH'),
        canal: 'whatsapp',
        chat_id: tape,
        client_telephone: tape,
      }),
    ).toBe(false);
  });

  it('PAS ATTESTE : le client a dicte a l’assistante un numero qui n’est pas le sien', () => {
    expect(telephoneAtteste({ ...whatsapp, client_telephone: '0707070707' })).toBe(false);
  });

  it('PAS ATTESTE : meme suffixe, autre operateur', () => {
    expect(telephoneAtteste({ ...whatsapp, client_telephone: '0702918886' })).toBe(false);
  });

  it('PAS ATTESTE : Telegram, canal absent, chat_id absent', () => {
    expect(telephoneAtteste({ ...whatsapp, canal: 'telegram' })).toBe(false);
    expect(telephoneAtteste({ ...whatsapp, canal: null })).toBe(false);
    expect(telephoneAtteste({ ...whatsapp, chat_id: null })).toBe(false);
    expect(telephoneAtteste({ ...whatsapp, chat_id: '' })).toBe(false);
  });
});

describe('deux chat_id designent-ils le meme client ?', () => {
  it('oui a l’identique, et sous les trois formes d’un meme numero', () => {
    expect(memeChat('123456789', '123456789')).toBe(true);
    expect(memeChat('2250102918886', '0102918886')).toBe(true);
    expect(memeChat('22502918886', '0102918886')).toBe(true);
  });

  it('non pour deux identifiants Telegram differents, ni pour une valeur vide', () => {
    expect(memeChat('123456789', '123456780')).toBe(false);
    expect(memeChat('', '')).toBe(false);
    expect(memeChat('0102918886', null)).toBe(false);
  });
});
