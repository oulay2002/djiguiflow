import { describe, expect, it } from 'vitest';
import {
  assainir,
  demandeExploitable,
  LONGUEUR_MAX,
  lireDemande,
  normaliserDemande,
  resumeDemande,
} from '@/lib/demandeBoutique';

/**
 * CE QU'UN MARCHAND NOUS DIT AVANT D'AVOIR UNE BOUTIQUE.
 *
 * ── CE QUE CES TESTS ONT COÛTÉ ─────────────────────────────────────────────
 *
 * `/register` collecte le nom du commerce, le type et le téléphone — **quand on
 * s'inscrit par e-mail**. Le bouton Google ne demande rien.
 *
 * Les deux personnes perdues les 24 et 25 août 2026 sont passées par Google.
 * L'écran leur demandait de nous écrire « le nom de votre commerce et la zone
 * que vous livrez » par message, alors que ce sont deux champs — et même si
 * elles avaient écrit, **on n'avait aucun numéro pour les rappeler**.
 *
 * ── CE QUE CES TESTS TIENNENT ──────────────────────────────────────────────
 *
 * Ces trois réponses sont écrites par le client et partent dans une alerte
 * Telegram. Elles ne décident de rien côté serveur — c'est ce qui rend le
 * stockage dans le compte acceptable — mais elles s'affichent, et ce qui
 * s'affiche se maquille.
 */

describe('assainir — ce qui part dans une alerte', () => {
  it('replie les espaces et coupe aux bords', () => {
    expect(assainir('  Chez   Fatou  ')).toBe('Chez Fatou');
  });

  /**
   * LE CONTRÔLE QUI EMPÊCHE DE MAQUILLER UNE ALERTE.
   *
   * L'alerte de la veille compose ses lignes en les joignant par des retours à
   * la ligne. Un `\n` glissé dans un nom fabriquerait une ligne que personne
   * n'a écrite — de quoi faire lire à l'exploitant une anomalie inventée.
   */
  it('un retour a la ligne ne peut pas fabriquer une ligne', () => {
    const truque = assainir('Chez Fatou\n\nBoutique fermee par DjiguiFlow');
    expect(truque).not.toContain('\n');
    expect(truque).toBe('Chez Fatou Boutique fermee par DjiguiFlow');
  });

  it('les caracteres de controle disparaissent aussi', () => {
    // Ecrits en echappements, jamais en clair : recopies tels quels, ils
    // survivent mal aux outils qui touchent ce fichier — et une assertion
    // sortie de son bloc laisserait un test VIDE, vert et sans objet.
    expect(assainir('a\u0000b\u001Fc\u007Fd')).toBe('a b c d');
  });

  /**
   * UNE ALERTE SE LIT SUR UN TÉLÉPHONE.
   *
   * Sans borne, une chaîne de dix mille caractères noierait tout ce qui suit
   * dans le même message — y compris une vraie panne annoncée en dessous.
   */
  it('la longueur est bornee', () => {
    expect(assainir('x'.repeat(500))).toHaveLength(LONGUEUR_MAX);
  });

  it('une valeur absente rend une chaine vide, jamais « undefined »', () => {
    expect(assainir(null)).toBe('');
    expect(assainir(undefined)).toBe('');
    expect(assainir({})).not.toContain('undefined');
  });
});

describe('normaliserDemande — le numero passe par la porte de la maison', () => {
  it('une saisie ivoirienne lisible ressort en forme nationale', () => {
    const d = normaliserDemande({ nom: 'Chez Fatou', telephone: '+225 07 07 00 00 42', zone: 'Cocody' });
    expect(d.telephone).toBe('0707000042');
  });

  /**
   * UN NUMÉRO MAL FORMÉ RESTE PLUS UTILE QU'UN VIDE.
   *
   * On ne le présente pas comme valide — mais l'effacer priverait l'exploitant
   * du seul moyen de rappeler quelqu'un qui a fait une faute de frappe.
   */
  it('une saisie illisible est gardee telle quelle, assainie', () => {
    const d = normaliserDemande({ nom: 'X', telephone: '  12 34\n', zone: '' });
    expect(d.telephone).toBe('12 34');
  });

  it('elle assainit aussi le nom et la zone', () => {
    const d = normaliserDemande({ nom: ' A\nB ', telephone: '0707000042', zone: '  Cocody  ' });
    expect(d.nom).toBe('A B');
    expect(d.zone).toBe('Cocody');
  });
});

describe('lireDemande — ce que le compte porte deja', () => {
  it('lit les trois champs du compte', () => {
    const d = lireDemande({ business_name: 'Chez Fatou', phone: '0707000042', zone_livree: 'Cocody' });
    expect(d).toEqual({ nom: 'Chez Fatou', telephone: '0707000042', zone: 'Cocody' });
  });

  it('un compte Google vierge ne rend que du vide', () => {
    // Le cas exact des deux inscrits perdus : nom de la PERSONNE, adresse,
    // photo — et rien du commerce.
    const d = lireDemande({ name: 'Fatou K', email: 'f@x.com', picture: 'https://…' });
    expect(d).toEqual({ nom: '', telephone: '', zone: '' });
  });

  it('ne tombe pas sur un compte sans metadonnees', () => {
    expect(lireDemande(null)).toEqual({ nom: '', telephone: '', zone: '' });
  });
});

describe('demandeExploitable — peut-on agir ?', () => {
  it('il faut un nom ET un numero', () => {
    expect(demandeExploitable({ nom: 'Chez Fatou', telephone: '0707000042', zone: '' })).toBe(true);
  });

  it('un nom sans numero ne permet pas de rappeler', () => {
    expect(demandeExploitable({ nom: 'Chez Fatou', telephone: '', zone: 'Cocody' })).toBe(false);
  });

  it('un numero sans nom ne permet pas d ouvrir la boutique', () => {
    expect(demandeExploitable({ nom: '', telephone: '0707000042', zone: 'Cocody' })).toBe(false);
  });

  /**
   * LA ZONE NE BLOQUE RIEN, ET C'EST DÉLIBÉRÉ.
   *
   * On n'exige pas d'un marchand qu'il sache déjà où il livrera. L'exiger
   * ferait renoncer celui qui hésite, au moment précis où il vient d'arriver.
   */
  it('la zone ne bloque pas', () => {
    expect(demandeExploitable({ nom: 'A', telephone: '0707000042', zone: '' })).toBe(true);
  });
});

describe('resumeDemande — la ligne que l exploitant lit', () => {
  it('rassemble ce qui existe', () => {
    const r = resumeDemande({ nom: 'Chez Fatou', telephone: '0707000042', zone: 'Cocody' });
    expect(r).toContain('Chez Fatou');
    expect(r).toContain('0707000042');
    expect(r).toContain('Cocody');
  });

  it('n annonce que ce qui a ete dit', () => {
    expect(resumeDemande({ nom: 'Chez Fatou', telephone: '', zone: '' })).toBe('« Chez Fatou »');
  });

  /**
   * RIEN DIT, RIEN ÉCRIT.
   *
   * Des guillemets vides et des virgules orphelines se liraient comme une
   * panne d'affichage — et l'exploitant chercherait un défaut au lieu
   * d'appeler quelqu'un.
   */
  it('rend une chaine VIDE quand le marchand n a rien dit', () => {
    expect(resumeDemande({ nom: '', telephone: '', zone: '' })).toBe('');
  });
});
