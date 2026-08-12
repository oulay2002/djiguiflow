import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Envoi des notifications push web.
 *
 * NE JAMAIS importer depuis un composant client : VAPID_PRIVATE_KEY signe les
 * messages au nom du domaine, et fuite dans le bundle si ce module y entre.
 */

/**
 * La cle publique VAPID, vue du serveur.
 *
 * `VAPID_PUBLIC_KEY` d'abord, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en secours.
 * L'ordre a son importance : une variable prefixee `NEXT_PUBLIC_` est figee
 * dans le bundle A LA COMPILATION, y compris dans le code serveur. Le 12 aout
 * 2026, la poser dans Vercel puis redeployer n'a rien change — le build
 * reutilisait son cache, et le serveur gardait la valeur « absente » compilee
 * la veille. Une variable sans prefixe, elle, est lue a l'execution : la
 * configuration cesse de dependre de ce qu'un build a bien voulu figer.
 */
export function clePubliqueVapid(): string {
  return (
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    ''
  );
}

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
  const clePublique = clePubliqueVapid();
  const clePrivee = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!clePublique || !clePrivee) return false;
  if (configure) return true;

  // `setVapidDetails` ne rend pas un booleen : il LEVE si une cle est mal
  // formee. Sans ce filet, une valeur collee avec ses guillemets — l'erreur de
  // saisie la plus banale — faisait repondre 500 a /api/push/abonner au lieu
  // du 503 prevu, et le marchand voyait une panne la ou il y a une variable a
  // corriger.
  try {
    webpush.setVapidDetails(contact, clePublique, clePrivee);
  } catch (e) {
    console.error('Cles VAPID invalides, notifications push desactivees :', e);
    return false;
  }

  configure = true;
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
