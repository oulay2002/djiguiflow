import { describe, expect, it } from 'vitest';
import {
  heureRetraitMinimale,
  horodaterRetrait,
  livraisonOfferte,
  mentionFrais,
  modeAccepte,
  modeParDefaut,
  modesProposes,
} from '@/lib/retrait';

/**
 * « Ce que le client choisit, et ce qu'il paiera. »
 *
 * CE QUE CES TESTS PROTEGENT. Ces regles servent aux DEUX bouts de la meme
 * commande : la vitrine les affiche, la route les applique. Si elles
 * divergeaient, le client lirait « livraison offerte » et paierait le livreur
 * a sa porte — ou l'inverse, et le marchand reglerait une course qu'il n'a
 * jamais offerte. Ce sont les deux erreurs qui se decouvrent sur le pas de la
 * porte, la ou plus personne ne peut les rattraper.
 */

describe('les modes qu une boutique propose', () => {
  it('livraison seule : aucun choix a poser', () => {
    expect(modesProposes('livraison')).toEqual(['livraison']);
  });

  it('retrait seul : aucun choix a poser non plus', () => {
    expect(modesProposes('retrait')).toEqual(['retrait']);
  });

  it('les deux : la livraison est proposee en premier', () => {
    // C'est le comportement que connaissent les clients deja servis ; le
    // retrait s'ajoute, il ne prend pas la place par surprise.
    expect(modesProposes('les_deux')).toEqual(['livraison', 'retrait']);
    expect(modeParDefaut('les_deux')).toBe('livraison');
  });

  it('UN MODE INCONNU RETOMBE SUR LA LIVRAISON', () => {
    // L'inverse cesserait d'alerter les livreurs d'une boutique qui livre,
    // pour une faute de frappe en base, et sans que rien ne le dise.
    expect(modesProposes('retait')).toEqual(['livraison']);
    expect(modesProposes(null)).toEqual(['livraison']);
    expect(modesProposes('')).toEqual(['livraison']);
    expect(modeParDefaut(undefined)).toBe('livraison');
  });
});

describe('le serveur refuse un mode que la boutique ne propose pas', () => {
  it('pas de retrait chez qui ne fait que livrer', () => {
    expect(modeAccepte('livraison', 'retrait')).toBe(false);
    expect(modeAccepte('livraison', 'livraison')).toBe(true);
  });

  it('pas de livraison chez qui ne fait que du retrait', () => {
    expect(modeAccepte('retrait', 'livraison')).toBe(false);
    expect(modeAccepte('retrait', 'retrait')).toBe(true);
  });

  it('les deux acceptent les deux, et rien d autre', () => {
    expect(modeAccepte('les_deux', 'livraison')).toBe(true);
    expect(modeAccepte('les_deux', 'retrait')).toBe(true);
    expect(modeAccepte('les_deux', 'les_deux')).toBe(false);
    expect(modeAccepte('les_deux', '')).toBe(false);
  });
});

describe('la gratuite, et le zero qui est un seuil', () => {
  it('NULL veut dire « le livreur annonce ses frais », jamais « offerte »', () => {
    expect(livraisonOfferte(null, 50_000)).toBe(false);
    expect(livraisonOfferte(undefined, 50_000)).toBe(false);
  });

  it('zero veut dire toujours offerte, meme pour un panier a un franc', () => {
    expect(livraisonOfferte(0, 1)).toBe(true);
    expect(livraisonOfferte(0, 0)).toBe(true);
  });

  it('un seuil s applique a partir du montant, bornes comprises', () => {
    expect(livraisonOfferte(10_000, 9_999)).toBe(false);
    expect(livraisonOfferte(10_000, 10_000)).toBe(true);
    expect(livraisonOfferte(10_000, 10_001)).toBe(true);
  });

  it('une valeur illisible ne fait pas offrir une livraison', () => {
    expect(livraisonOfferte('offerte', 50_000)).toBe(false);
    expect(livraisonOfferte(-1, 50_000)).toBe(false);
  });
});

describe('la phrase que lit le client', () => {
  it('en retrait, on ne parle pas de livraison du tout', () => {
    const t = mentionFrais({ mode: 'retrait', offerteDes: null, total: 5_000 });
    expect(t).toContain('sur place');
    expect(t).not.toContain('livreur');
  });

  it('offerte : on dit qu il ne reglera rien de plus', () => {
    expect(mentionFrais({ mode: 'livraison', offerteDes: 0, total: 5_000 }))
      .toContain('offerte');
  });

  it('sous le seuil : on annonce le seuil ET le fait qu il paiera', () => {
    const t = mentionFrais({ mode: 'livraison', offerteDes: 10_000, total: 4_000 });
    // Le separateur de milliers vient de `toLocaleString('fr-FR')`, comme
    // partout ailleurs dans ce depot : c'est une espace fine insecable, pas
    // une espace ordinaire. L'ecrire en dur ici ferait crier ce test sur une
    // phrase parfaitement juste.
    expect(t).toContain((10_000).toLocaleString('fr-FR'));
    expect(t).toContain('livreur');
  });

  it('au-dessus du seuil : la promesse est tenue, pas repetee', () => {
    expect(mentionFrais({ mode: 'livraison', offerteDes: 10_000, total: 10_000 }))
      .not.toContain('à partir de');
  });

  it('sans reglage, la phrase d origine ne bouge pas', () => {
    // Toutes les boutiques en service sont dans ce cas : leur vitrine doit
    // dire exactement ce qu'elle disait hier.
    expect(mentionFrais({ mode: 'livraison', offerteDes: null, total: 5_000 }))
      .toBe('Les frais de livraison sont annoncés par le livreur et se règlent en plus, à la réception.');
  });
});

// Abidjan est a UTC+0 toute l'annee : l'heure UTC EST l'heure locale.
const a = (iso: string) => new Date(iso);

describe('l heure de retrait', () => {
  it('vide veut dire « des que pret », et vaut null', () => {
    const v = horodaterRetrait('', a('2026-08-26T10:00:00Z'), 20);
    expect(v).toEqual({ ok: true, iso: null });
  });

  it('une heure tenable devient un instant de la journee en cours', () => {
    const v = horodaterRetrait('12:30', a('2026-08-26T10:00:00Z'), 20);
    expect(v.ok && v.iso).toBe('2026-08-26T12:30:00.000Z');
  });

  it('le temps de preparation repousse la premiere heure possible', () => {
    expect(heureRetraitMinimale(a('2026-08-26T10:00:00Z'), 45)).toBe('10:45');
    // NULL veut dire « non renseigne » : on n'invente aucun delai.
    expect(heureRetraitMinimale(a('2026-08-26T10:00:00Z'), null)).toBe('10:00');
  });

  it('une heure trop tot se refuse, en disant a partir de quand', () => {
    const v = horodaterRetrait('10:10', a('2026-08-26T10:00:00Z'), 30);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.message).toContain('10:30');
  });

  it('UNE HEURE PASSEE NE BASCULE PAS AU LENDEMAIN', () => {
    // Reporter « 08:00 » saisi a 23 h 50 donnerait au client et au marchand
    // deux lectures de la meme commande, et c'est le client qui se
    // deplacerait pour rien.
    const v = horodaterRetrait('08:00', a('2026-08-26T23:50:00Z'), null);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.message).toContain('déjà passée');
  });

  it('l heure exacte du plancher passe', () => {
    const v = horodaterRetrait('10:30', a('2026-08-26T10:00:00Z'), 30);
    expect(v.ok).toBe(true);
  });

  it('une saisie illisible se refuse au lieu d etre devinee', () => {
    for (const brut of ['midi', '25:00', '12:70', '1230']) {
      expect(horodaterRetrait(brut, a('2026-08-26T10:00:00Z'), 0).ok).toBe(false);
    }
  });
});
