import { describe, expect, it } from 'vitest';
import {
  HORS_DE_PORTEE,
  REGISTRE_MIS_A_JOUR,
  TRAITEMENTS,
  sortsAttendus,
  traitementsDuClient,
} from '@/lib/donneesPersonnelles';
import { dejaEfface } from '@/lib/dossierClient';
import { memeNumero } from '@/lib/telephone';

/**
 * L'inventaire des données personnelles, et la règle qui le tient.
 *
 * Ce fichier alimente TROIS choses qui doivent dire la même : l'écran des
 * droits, l'effacement, et le registre remis au régulateur. Les tests ci-dessous
 * ne vérifient pas des libellés — ils vérifient que ces trois usages ne peuvent
 * pas se contredire.
 */

describe('inventaire — la cohérence des trois usages', () => {
  /**
   * LA RÈGLE CENTRALE : TOUT CE QU'ON MONTRE, ON DOIT POUVOIR L'ATTEINDRE.
   *
   * Un traitement client qu'on affiche mais que l'effacement ne traite pas
   * serait le pire des deux mondes : on prouve par écrit qu'on détient la
   * donnée, et on prouve qu'on ne sait pas s'en séparer.
   */
  it('chaque traitement client a un sort d’effacement décidé', () => {
    const sorts = sortsAttendus();
    for (const t of traitementsDuClient()) {
      expect(sorts[t.cle], `« ${t.nom} » n’a pas de sort décidé`).toBeTruthy();
    }
  });

  /**
   * « GARDE » NE DOIT JAMAIS ÊTRE LA VALEUR COMMODE.
   *
   * C'est la seule issue qui laisse une donnée en place. Sans justification
   * obligatoire, elle deviendrait le choix qu'on pose sans y penser le jour où
   * l'effacement est compliqué à écrire.
   */
  it('tout traitement conservé porte sa justification', () => {
    for (const t of TRAITEMENTS.filter((x) => x.effacement === 'garde')) {
      expect(String(t.pourquoi ?? '').length, `« ${t.nom} » garde sans dire pourquoi`)
        .toBeGreaterThan(30);
    }
  });

  it('les clés sont uniques — deux traitements homonymes en masqueraient un', () => {
    const cles = TRAITEMENTS.map((t) => t.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('aucun traitement n’est déclaré sans finalité ni durée', () => {
    for (const t of TRAITEMENTS) {
      expect(t.finalite.length, `« ${t.nom} » sans finalité`).toBeGreaterThan(10);
      expect(t.conservation.length, `« ${t.nom} » sans durée`).toBeGreaterThan(10);
      expect(t.destinataires.length, `« ${t.nom} » sans destinataire`).toBeGreaterThan(0);
    }
  });
});

describe('inventaire — ce qu’on garde même après un effacement', () => {
  // Ces deux-là sont la trace de droits exercés. Les effacer retournerait le
  // droit contre la personne : la liste de refus vidée, plus rien n'empêche de
  // la démarcher à nouveau.
  it.each(['refus_demarchage', 'demandes_droits'])(
    '« %s » survit à un effacement',
    (cle) => {
      expect(TRAITEMENTS.find((t) => t.cle === cle)?.effacement).toBe('garde');
    },
  );

  /**
   * UNE COMMANDE S'ANONYMISE, ELLE NE SE SUPPRIME PAS.
   *
   * Elle est aussi la comptabilité du marchand. La supprimer sur demande d'un
   * client ferait disparaître une vente de ses livres — on effacerait la
   * personne ET l'argent.
   */
  it('les commandes sont anonymisées, jamais supprimées', () => {
    expect(TRAITEMENTS.find((t) => t.cle === 'commandes')?.effacement).toBe('anonymise');
  });

  // Un panier appartient à quelqu'un qui n'a JAMAIS commandé : aucune
  // comptabilité à préserver, donc aucune raison de le garder.
  it('un panier non converti se supprime entièrement', () => {
    expect(TRAITEMENTS.find((t) => t.cle === 'paniers')?.effacement).toBe('supprime');
  });
});

describe('inventaire — les limites déclarées', () => {
  /**
   * TAIRE UNE LIMITE SERAIT LA SEULE FAUTE VRAIMENT GRAVE.
   *
   * Une personne qui clique « effacer » et à qui l'on répond « c'est fait »
   * croit que tout est parti. La copie dans le tableur du marchand porte son
   * nom, son téléphone et son adresse — et l'écran ne l'atteint pas.
   */
  it('la copie chez le marchand est déclarée hors de portée', () => {
    const dit = HORS_DE_PORTEE.map((h) => `${h.quoi} ${h.pourquoi}`).join(' ').toLowerCase();
    expect(dit).toContain('tableur');
  });

  it('les messages déjà reçus et les sauvegardes sont déclarés aussi', () => {
    const sujets = HORS_DE_PORTEE.map((h) => h.quoi.toLowerCase()).join(' | ');
    expect(sujets).toMatch(/whatsapp|telegram|messages/);
    expect(sujets).toContain('sauvegarde');
  });

  it('chaque limite explique pourquoi, pas seulement quoi', () => {
    for (const h of HORS_DE_PORTEE) {
      expect(h.pourquoi.length, `« ${h.quoi} » sans explication`).toBeGreaterThan(30);
    }
  });
});

describe('inventaire — le registre couvre tout le monde', () => {
  // Un registre qui ne déclare que les clients est un registre faux : la
  // plateforme détient aussi les données de ses marchands et de leurs livreurs.
  it.each(['client', 'marchand', 'livreur'])('les %s y figurent', (qui) => {
    expect(TRAITEMENTS.some((t) => (t.concerne as string[]).includes(qui))).toBe(true);
  });

  /**
   * LA DATE NE SE CALCULE PAS.
   *
   * Une date automatique dirait « revu aujourd'hui » à chaque déploiement, et
   * ce serait un mensonge sur la seule ligne d'un registre qui engage.
   */
  it('la date de revue est écrite à la main', () => {
    expect(REGISTRE_MIS_A_JOUR).toMatch(/\d{4}/);
  });
});

describe('memeNumero — retrouver une personne sans en confondre deux', () => {
  /**
   * LE CAS QUI JUSTIFIE CETTE FONCTION.
   *
   * `cleAppariement` réunit les trois formes du même numéro — c'est ce qu'on
   * veut — mais elle réunit aussi deux abonnés qui ne diffèrent que par le
   * préfixe d'opérateur. Ailleurs le filtre boutique borne le risque ; sur
   * l'écran des droits, qui montre une adresse de domicile, ce serait une fuite.
   */
  it('deux abonnés que seul le préfixe sépare ne sont PAS la même personne', () => {
    expect(memeNumero('0102918886', '0702918886')).toBe(false);
  });

  it('les trois formes du même numéro se rejoignent', () => {
    expect(memeNumero('2250102918886', '0102918886')).toBe(true);
    expect(memeNumero('+225 01 02 91 88 86', '0102918886')).toBe(true);
  });

  // Forme d'avant 2021, à laquelle il manque le préfixe d'opérateur : rien ne
  // prouve le contraire, et refuser priverait de ses droits le client dont la
  // commande a été enregistrée sous une vieille forme.
  it('une forme ancienne est tolérée sur les huit chiffres stables', () => {
    expect(memeNumero('22502918886', '0102918886')).toBe(true);
  });

  it('un identifiant Telegram n’est jamais confondu avec un téléphone', () => {
    expect(memeNumero('123456789', '0102918886')).toBe(false);
    expect(memeNumero('', '0102918886')).toBe(false);
    expect(memeNumero(null, null)).toBe(false);
  });

  /**
   * LE PIÈGE QUI AURAIT TOUT CASSÉ.
   *
   * Une commande anonymisée porte un téléphone VIDE. Si deux chaînes vides se
   * reconnaissaient, le dossier d'une personne ramasserait toutes les commandes
   * déjà anonymisées de la plateforme — et les lui montrerait.
   */
  it('deux numéros vides ne désignent personne', () => {
    expect(memeNumero('', '')).toBe(false);
  });
});

describe('dejaEfface — le geste qui suit immédiatement un effacement', () => {
  /**
   * TROUVÉ EN VÉRIFIANT, PAS EN RELISANT.
   *
   * Après un effacement, l'écran répondait « Vos données n'ont pas pu être
   * rassemblées, réessayez dans un instant » — un message FAUX sur l'état du
   * service, servi à la personne dont les données venaient d'être effacées, et
   * qui l'invitait à recommencer sans fin.
   *
   * Or rouvrir le lien qu'on garde dans son message est le geste qui suit un
   * effacement. Le cas n'était pas rare : c'était le plus probable.
   */
  it('un téléphone vidé par l’anonymisation est reconnu comme déjà effacé', () => {
    expect(dejaEfface('')).toBe(true);
    expect(dejaEfface(null)).toBe(true);
  });

  it('un numéro réel n’est jamais pris pour un dossier effacé', () => {
    expect(dejaEfface('0102130443')).toBe(false);
    expect(dejaEfface('2250102130443')).toBe(false);
  });
});
