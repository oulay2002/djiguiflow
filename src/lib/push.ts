import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Envoi des notifications push web.
 *
 * NE JAMAIS importer depuis un composant client : VAPID_PRIVATE_KEY signe les
 * messages au nom du domaine, et fuite dans le bundle si ce module y entre.
 */

const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const clePrivee = process.env.VAPID_PRIVATE_KEY?.trim();

// `mailto:` est exige par la specification VAPID : c'est l'adresse que le
// service de push (Google, Mozilla, Apple) contacte en cas d'abus.
const contact = process.env.VAPID_CONTACT?.trim() || 'mailto:contact@djiguiflow.com';

let configure = false;

/**
 * Retourne vrai si le push est utilisable.
 *
 * Les cles sont volontairement optionnelles : un deploiement qui ne les a pas
 * encore doit continuer a servir le tableau de bord, pas tomber au demarrage.
 * Les alertes marchand passent de toute facon aussi par WhatsApp et Telegram.
 */
export function pushConfigure(): boolean {
  if (!clePublique || !clePrivee) return false;
  if (!configure) {
    webpush.setVapidDetails(contact, clePublique, clePrivee);
    configure = true;
  }
  return true;
}

export type ChargePush = {
  titre: string;
  corps: string;
  /** Ou mene le clic sur la notification. */
  url?: string;
  /** Regroupe les notifications de meme nature au lieu de les empiler. */
  tag?: string;
};

type Abonnement = {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

export type ResultatEnvoi = {
  envoyes: number;
  expires: number;
  echecs: number;
};

/**
 * Envoie une charge a tous les appareils d'une boutique.
 *
 * Les abonnements morts sont supprimes au passage. C'est necessaire, pas
 * cosmetique : un navigateur desinstalle ou un cache vide laisse un endpoint
 * qui repond 404/410 indefiniment, et sans purge la table grossit jusqu'a ce
 * que chaque commande declenche des dizaines d'appels voues a l'echec.
 */
export async function envoyerPushBoutique(
  boutiqueId: string,
  charge: ChargePush,
): Promise<ResultatEnvoi> {
  const vide: ResultatEnvoi = { envoyes: 0, expires: 0, echecs: 0 };

  if (!pushConfigure()) return vide;

  const sb = getSupabaseAdmin();
  if (!sb) return vide;

  const { data, error } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_secret')
    .eq('boutique_id', boutiqueId);

  if (error) {
    console.error('Lecture des abonnements push impossible :', error);
    return vide;
  }

  const abonnements = (data ?? []) as Abonnement[];
  if (abonnements.length === 0) return vide;

  const corps = JSON.stringify(charge);
  const perimes: string[] = [];
  let envoyes = 0;
  let echecs = 0;

  // En parallele : un endpoint injoignable peut mettre plusieurs secondes a
  // expirer, et la route qui appelle cette fonction repond a n8n.
  await Promise.all(
    abonnements.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth_secret } },
          corps,
        );
        envoyes += 1;
      } catch (e) {
        const statut = (e as { statusCode?: number }).statusCode;
        // 404 « inconnu » et 410 « parti » sont definitifs : le navigateur a
        // revoque l'abonnement. Tout autre code peut etre passager.
        if (statut === 404 || statut === 410) {
          perimes.push(a.endpoint);
        } else {
          echecs += 1;
          console.error('Envoi push echoue :', statut, e);
        }
      }
    }),
  );

  if (perimes.length > 0) {
    const { error: erreurPurge } = await sb
      .from('push_subscriptions')
      .delete()
      .in('endpoint', perimes);
    if (erreurPurge) {
      console.error('Purge des abonnements push expires impossible :', erreurPurge);
    }
  }

  return { envoyes, expires: perimes.length, echecs };
}
