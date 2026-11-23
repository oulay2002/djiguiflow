import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPUIS_MAX,
  SCRIPT_AVANT_EVEIL,
  prendreLesAppuis,
  type FenetreAvantEveil,
} from '@/lib/vitrine/avantEveil';
import {
  ecrireRecu,
  etapesDuRecu,
  lienVersLaBoutique,
  lireRecu,
  recoursDuRecu,
  type Recu,
} from '@/lib/vitrine/recu';

/**
 * Les trois defauts que la troisieme critique de la vitrine avait laisses
 * ouverts (29/40, 23 novembre 2026).
 *
 *  1. Le recu demandait de repondre a un message, sans dire ou il arrive ni
 *     quoi faire s'il n'arrive pas.
 *  2. Le verdict d'un echec s'affichait en haut de page, le bouton pour
 *     reessayer 1 600 a 2 500 px plus bas.
 *  3. En reseau lent, les boutons etaient affiches mais sourds : le premier
 *     appui du client etait perdu.
 */

const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');

const RECU: Recu = {
  reference: 'ZH-1795442617116-AB12',
  jeton: 'jeton',
  lignes: [{ quantite: 1, nom: 'Garba', variante: '', montant: 1000 }],
  total: 1000,
  mode: 'livraison',
  heure: '',
  adresseRetrait: '',
  paiements: [],
  frais: '',
  telephoneBoutique: '2250700000000',
  numero: '07 08 09 10 11',
};

describe('1 — le recu dit ou arrive le message', () => {
  it('le numero saisi est rappele dans la premiere etape', () => {
    expect(etapesDuRecu(RECU)[0]).toBe(
      'Répondez au message WhatsApp qui va vous être envoyé au 07 08 09 10 11. '
      + 'La préparation ne commence qu’après votre réponse.',
    );
  });

  it('sans numero, la phrase reste entiere : ni « au » orphelin, ni trou', () => {
    const premiere = etapesDuRecu({ ...RECU, numero: undefined })[0];
    expect(premiere).toBe(
      'Répondez au message WhatsApp qui va vous être envoyé. '
      + 'La préparation ne commence qu’après votre réponse.',
    );
    expect(etapesDuRecu({ ...RECU, numero: '   ' })[0]).toBe(premiere);
  });

  it('LE NUMERO DU CLIENT N’EST JAMAIS ECRIT DANS LE STOCKAGE', () => {
    // Il sert a l'instant ou le recu s'affiche, pour reperer une erreur de
    // saisie. Rien de personnel ne reste dans le navigateur apres coup.
    const ecrit = ecrireRecu(RECU);
    expect(ecrit).not.toContain('07 08 09 10 11');
    expect(ecrit).not.toContain('"numero"');
    expect(lireRecu(ecrit)?.numero).toBeUndefined();
  });

  it('…et l’objet d’origine n’est pas abime par l’ecriture', () => {
    const copie = { ...RECU };
    ecrireRecu(copie);
    expect(copie.numero).toBe('07 08 09 10 11');
  });

  it('le numero du COMMERCE, lui, est garde : il est public', () => {
    expect(lireRecu(ecrireRecu(RECU))?.telephoneBoutique).toBe('2250700000000');
  });

  it('un recu ecrit avant ce champ reste lisible, sans recours', () => {
    const ancien = JSON.parse(ecrireRecu(RECU));
    delete ancien.telephoneBoutique;
    const relu = lireRecu(JSON.stringify(ancien));
    expect(relu).not.toBeNull();
    expect(relu?.telephoneBoutique).toBe('');
    expect(recoursDuRecu(relu!)).toBe('');
  });
});

describe('1 — et quoi faire s’il n’arrive pas', () => {
  it('le lien ouvre la conversation avec la boutique, reference deja ecrite', () => {
    const lien = lienVersLaBoutique('2250700000000', 'ZH-1');
    expect(lien.startsWith('https://wa.me/2250700000000?text=')).toBe(true);
    expect(decodeURIComponent(lien.split('text=')[1])).toBe(
      'Bonjour, je n’ai pas reçu le message de confirmation de ma commande ZH-1.',
    );
  });

  it('un numero local recoit l’indicatif', () => {
    expect(lienVersLaBoutique('07 00 00 00 00', 'ZH-1')).toContain('wa.me/2250700000000?');
  });

  it('sans numero lisible, aucun lien : mieux vaut rien qu’un WhatsApp invalide', () => {
    for (const tel of ['', '12345', 'appelez-moi']) {
      expect(lienVersLaBoutique(tel, 'ZH-1'), tel).toBe('');
    }
  });

  it('le recours suit ce que le recu sait', () => {
    expect(recoursDuRecu(RECU)).toContain('Vérifiez que ce numéro est le bon');
    expect(recoursDuRecu(RECU)).toContain('écrivez à la boutique');

    const sansBoutique = recoursDuRecu({ ...RECU, telephoneBoutique: '' });
    expect(sansBoutique).toContain('Vérifiez que ce numéro est le bon');
    expect(sansBoutique).not.toContain('boutique');

    const apresRechargement = recoursDuRecu({ ...RECU, numero: undefined });
    expect(apresRechargement).toContain('Écrivez à la boutique');
    expect(apresRechargement).not.toContain('ce numéro');

    expect(recoursDuRecu({ ...RECU, numero: undefined, telephoneBoutique: '' })).toBe('');
  });

  it('LE RECOURS NE CONFIRME PAS LA COMMANDE', () => {
    // Confirmer depuis cette page validerait une commande sans avoir jamais
    // verifie que le numero existe — ce que la confirmation par WhatsApp sert
    // justement a empecher.
    const composant = lire('src/app/boutiques/[id]/Recu.tsx');
    expect(composant).not.toContain('/api/confirmation');
    expect(lire('src/lib/vitrine/recu.ts')).not.toContain('/api/confirmation');
  });
});

describe('2 — le verdict d’un echec est pres du bouton', () => {
  it('il est rendu dans le ticket, juste avant le bouton d’envoi', () => {
    const verdict = vitrine.indexOf('ref={echecRef}');
    const bouton = vitrine.indexOf('onClick={commander}');
    expect(verdict).toBeGreaterThan(-1);
    expect(verdict).toBeLessThan(bouton);
    // Rien d'autre qu'un bloc entre les deux : ni champ, ni autre section.
    expect(vitrine.slice(verdict, bouton)).not.toMatch(/<input|<section/);
  });

  it('il n’y a plus de verdict d’echec en haut de page', () => {
    const haut = vitrine.slice(vitrine.indexOf('<div ref={verdictRef}'), vitrine.indexOf('CE QU\'IL FAUT SAVOIR AVANT DE COMMANDER'));
    expect(haut).not.toContain('REFUSÉE');
    expect(haut).not.toContain('{echec');
  });

  it('un echec ne fait plus remonter la page tout en haut', () => {
    // Seuls le recu et l'ouverture de WhatsApp y menent encore.
    const appels = vitrine.match(/verdictRef\.current\?\.scrollIntoView/g) ?? [];
    expect(appels.length).toBe(2);
    expect(vitrine).toContain("if (echec) echecRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });");
  });

  it('« sans reponse » dit que renvoyer est sans risque', () => {
    expect(vitrine).toContain('elle ne sera pas enregistrée deux fois.');
  });

  it('…ET LA PROMESSE TIENT MEME SANS STOCKAGE D’ONGLET', () => {
    // En navigation privee stricte, la cle etait retiree a chaque envoi : la
    // phrase ci-dessus aurait ete fausse.
    expect(vitrine).toContain('const memoireCle = useRef(new Map<string, string>());');
    expect(vitrine).toContain('stockageDeLaCle(),');
    expect(vitrine).toContain('oublierCle(stockageDeLaCle(), clefDeLaCle(slug));');
  });

  it('pas de second bouton rouge pour renvoyer : celui du ticket suffit', () => {
    expect(vitrine).not.toContain('Renvoyer la même commande');
  });
});

describe('3 — un appui fait avant que la page reponde n’est pas perdu', () => {
  type Bouton = { disabled?: boolean; attrs: Record<string, string>; getAttribute(n: string): string | null; setAttribute(n: string, v: string): void };
  const bouton = (id: string, variante = '', disabled = false): Bouton => {
    const attrs: Record<string, string> = { 'data-ajout': id, 'data-variante': variante };
    return {
      disabled,
      attrs,
      getAttribute: (n) => attrs[n] ?? null,
      setAttribute: (n, v) => { attrs[n] = v; },
    };
  };

  /** Execute le script dans une fausse page, et rend de quoi simuler un appui. */
  function poser(fenetre: Record<string, unknown> = {}) {
    const ecouteurs: ((e: unknown) => void)[] = [];
    const document = { addEventListener: (_t: string, f: (e: unknown) => void) => { ecouteurs.push(f); } };
    new Function('window', 'document', SCRIPT_AVANT_EVEIL)(fenetre, document);
    const appuyer = (b: Bouton | null) =>
      ecouteurs.forEach((f) => f({ target: { closest: () => b } }));
    return { fenetre: fenetre as unknown as FenetreAvantEveil, appuyer, ecouteurs };
  }

  it('il retient l’article et le choix, et grise le bouton aussitot', () => {
    const { fenetre, appuyer } = poser();
    const b = bouton('burger', '41');
    appuyer(b);
    expect(fenetre.__djfAjouts).toEqual([['burger', '41']]);
    expect(b.attrs['aria-busy']).toBe('true');
  });

  it('un appui ailleurs que sur « Ajouter » n’est pas retenu', () => {
    const { fenetre, appuyer } = poser();
    appuyer(null);
    expect(fenetre.__djfAjouts).toEqual([]);
  });

  it('un bouton desactive n’est pas retenu', () => {
    const { fenetre, appuyer } = poser();
    appuyer(bouton('burger', '', true));
    expect(fenetre.__djfAjouts).toEqual([]);
  });

  it('DES QUE LA PAGE REPOND, IL NE RETIENT PLUS RIEN', () => {
    // Sinon chaque appui serait compte deux fois : une par React, une par lui.
    const { fenetre, appuyer } = poser();
    fenetre.__djfPret = true;
    const b = bouton('burger');
    appuyer(b);
    expect(fenetre.__djfAjouts).toEqual([]);
    expect(b.attrs['aria-busy']).toBeUndefined();
  });

  it('pose deux fois, il n’ecoute qu’une fois', () => {
    const fenetre: Record<string, unknown> = {};
    const premiere = poser(fenetre);
    const seconde = poser(fenetre);
    expect(premiere.ecouteurs).toHaveLength(1);
    expect(seconde.ecouteurs).toHaveLength(0);
  });

  it('une touche coincee ne remplit pas la file sans fin', () => {
    const { fenetre, appuyer } = poser();
    for (let i = 0; i < APPUIS_MAX + 30; i += 1) appuyer(bouton('burger'));
    expect(fenetre.__djfAjouts).toHaveLength(APPUIS_MAX);
  });

  it('il ne touche ni au reseau ni au stockage', () => {
    expect(SCRIPT_AVANT_EVEIL).not.toMatch(/fetch|XMLHttpRequest|sessionStorage|localStorage|cookie/);
  });

  it('la file se prend une fois, et ne rend que des couples bien formes', () => {
    const fenetre = {
      __djfAjouts: [['burger', ''], ['pizza', 'XL'], ['', 'x'], 'intrus', [1, 2], ['seul']],
    } as unknown as FenetreAvantEveil;
    expect(prendreLesAppuis(fenetre)).toEqual([['burger', ''], ['pizza', 'XL']]);
    expect(prendreLesAppuis(fenetre)).toEqual([]);
  });

  it('une page sans script (navigation interne) ne casse rien', () => {
    expect(prendreLesAppuis({} as FenetreAvantEveil)).toEqual([]);
  });

  it('le script est pose AVANT la vitrine, dans la page rendue par le serveur', () => {
    const page = lire('src/app/boutiques/[id]/page.tsx');
    const script = page.indexOf('dangerouslySetInnerHTML={{ __html: SCRIPT_AVANT_EVEIL }}');
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(page.indexOf('<Vitrine '));
  });

  it('LA FILE EST REJOUEE APRES LA RELECTURE DU BROUILLON, PAS AVANT', () => {
    // Dans l'autre ordre, l'article rejoue remplirait le panier, et le
    // brouillon — qui ne s'impose qu'a un panier vide — serait ecarte.
    const rejeu = vitrine.indexOf('const appuis = prendreLesAppuis(window as FenetreAvantEveil);');
    expect(rejeu).toBeGreaterThan(-1);
    expect(vitrine.slice(rejeu - 80, rejeu)).toContain('if (!brouillonRelu) return;');
  });

  it('le bouton porte de quoi etre reconnu, et montre qu’il a ete entendu', () => {
    expect(vitrine).toContain('data-ajout={p.id}');
    expect(vitrine).toContain('data-variante={tailleChoisie}');
    expect(vitrine).toContain('aria-busy:opacity-60');
  });
});
