import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Les preferences de notification du marchand.
 *
 * CE QUI ETAIT CASSE. L'ecran « Notifications » enregistrait cinq interrupteurs
 * que RIEN ne lisait. Le marchand decochait « Rapport quotidien » et continuait
 * de le recevoir.
 *
 * CE QUE CES TESTS PROTEGENT, dans l'ordre d'importance :
 *
 *  1. LE CLIENT N'EST JAMAIS FILTRE. Sa confirmation, son suivi et sa demande
 *     d'avis partent quoi qu'il arrive. Le groupe des livreurs non plus : une
 *     course qui n'est proposee a personne n'est pas une preference.
 *  2. LE DOUTE PROFITE A L'ENVOI. Base injoignable, ligne absente, type
 *     inconnu : on envoie. Une preference mal lue ne doit jamais faire
 *     disparaitre une alerte de commande.
 *  3. L'ABSENCE DE REGRESSION. Sans le champ `notification`, rien ne change.
 */

const etats = vi.hoisted(() => ({
  fiche: {
    id: 'boutique-A',
    telegram_marchand: '-100777',
    telephone: '0700000001',
  } as Record<string, string> | null,
  /** Les colonnes `notif_*` de la boutique. */
  reglages: null as Record<string, boolean> | null,
  ficheCassee: false,
  reglagesCasses: false,
  /** Les colonnes reellement demandees, pour verifier qu'on lit la bonne. */
  colonnesLues: [] as string[],
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let colonne = '';
      const chaine = {
        select: (c: string) => {
          colonne = c;
          if (table === 'notification_settings') etats.colonnesLues.push(c);
          return chaine;
        },
        eq: () => chaine,
        maybeSingle: async () => {
          if (table === 'boutiques') {
            return etats.ficheCassee
              ? { data: null, error: { message: 'fiche illisible' } }
              : { data: etats.fiche, error: null };
          }
          if (etats.reglagesCasses) {
            return { data: null, error: { message: 'reglages illisibles' } };
          }
          if (!etats.reglages) return { data: null, error: null };
          return { data: { [colonne]: etats.reglages[colonne] }, error: null };
        },
      };
      return chaine;
    },
  }),
}));

const { notificationAutorisee, typeNotification } = await import('@/lib/preferencesNotifications');

beforeEach(() => {
  etats.fiche = { id: 'boutique-A', telegram_marchand: '-100777', telephone: '0700000001' };
  etats.reglages = null;
  etats.ficheCassee = false;
  etats.reglagesCasses = false;
  etats.colonnesLues = [];
});

const demander = (destinataire: string, type: Parameters<typeof notificationAutorisee>[0]['type']) =>
  notificationAutorisee({ boutique: 'ma-boutique', destinataire, type });

describe('quand le marchand a coupe un type de notification', () => {
  beforeEach(() => {
    etats.reglages = { notif_stock_faible: false, notif_nouvelle_commande: true };
  });

  it('ne lui envoie pas cette notification', async () => {
    const v = await demander('-100777', 'stock_faible');
    expect(v.envoyer).toBe(false);
    expect(v.envoyer === false && v.raison).toContain('stock_faible');
  });

  it('lit bien la colonne correspondante, et pas une autre', async () => {
    await demander('-100777', 'stock_faible');
    expect(etats.colonnesLues).toEqual(['notif_stock_faible']);
  });

  it('continue de lui envoyer les autres', async () => {
    const v = await demander('-100777', 'nouvelle_commande');
    expect(v.envoyer).toBe(true);
  });

  it('le reconnait aussi par son numero, avec ou sans indicatif', async () => {
    const v = await demander('2250700000001', 'stock_faible');
    expect(v.envoyer).toBe(false);
  });
});

// LES TESTS QUI PORTENT LA DECISION.
describe('ce que la preference ne doit JAMAIS taire', () => {
  beforeEach(() => {
    etats.reglages = { notif_statut_livraison: false, notif_nouvelle_commande: false };
  });

  it('un message au CLIENT part quand meme', async () => {
    const v = await demander('2250102030405', 'statut_livraison');
    expect(v.envoyer).toBe(true);
  });

  it('un message au GROUPE DES LIVREURS part quand meme', async () => {
    // Le groupe n'est pas le gerant : une course qui n'est proposee a personne
    // est une panne, pas un choix.
    const v = await demander('-100888', 'nouvelle_commande');
    expect(v.envoyer).toBe(true);
  });

  it('un numero trop court ne se fait pas passer pour le gerant', async () => {
    // Moins de huit chiffres : un suffixe peut coincider par hasard.
    const v = await demander('0001', 'stock_faible');
    expect(v.envoyer).toBe(true);
  });
});

describe('le doute profite a l envoi', () => {
  it('envoie quand aucun type n est nomme', async () => {
    etats.reglages = { notif_stock_faible: false };
    const v = await demander('-100777', null);
    expect(v.envoyer).toBe(true);
    // On ne doit meme pas avoir interroge la base.
    expect(etats.colonnesLues).toHaveLength(0);
  });

  it('envoie quand la boutique est illisible', async () => {
    etats.ficheCassee = true;
    const v = await demander('-100777', 'stock_faible');
    expect(v.envoyer).toBe(true);
  });

  it('envoie quand les reglages sont illisibles', async () => {
    etats.reglagesCasses = true;
    const v = await demander('-100777', 'stock_faible');
    expect(v.envoyer).toBe(true);
  });

  it('envoie quand la boutique n a aucune ligne de reglages', async () => {
    etats.reglages = null;
    const v = await demander('-100777', 'stock_faible');
    expect(v.envoyer).toBe(true);
  });
});

describe('les types acceptes', () => {
  it('reconnait les cinq interrupteurs de l ecran', () => {
    for (const t of [
      'nouvelle_commande',
      'assignation_livreur',
      'statut_livraison',
      'rapport_quotidien',
      'stock_faible',
    ]) {
      expect(typeNotification(t)).toBe(t);
    }
  });

  it('rend null sur un type inconnu, plutot que de deviner', () => {
    expect(typeNotification('rapport')).toBeNull();
    expect(typeNotification('')).toBeNull();
    expect(typeNotification(undefined)).toBeNull();
  });
});
