import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Les preferences de notification du marchand, enfin honorees.
 *
 * POURQUOI CE FICHIER EXISTE. L'ecran « Notifications » enregistrait cinq
 * interrupteurs que RIEN ne lisait — ni `canaux.ts`, ni le diagnostic, ni un
 * workflow n8n. Le marchand decochait « Rapport quotidien » et continuait de le
 * recevoir. Un ecran qui a l'air de marcher est pire qu'un ecran absent.
 *
 * TROIS REGLES QUI NE DOIVENT PAS BOUGER.
 *
 * 1. CELA NE CONCERNE QUE LE MARCHAND. Un client n'a pas a subir les
 *    preferences de la boutique : sa confirmation, son suivi et sa demande
 *    d'avis partent toujours. Le groupe des livreurs non plus — une course qui
 *    n'est proposee a personne n'est pas une preference, c'est une panne.
 *
 * 2. LE DOUTE PROFITE A L'ENVOI. Ligne absente, base injoignable, type inconnu,
 *    destinataire non reconnu : on envoie. Une preference mal lue ne doit
 *    JAMAIS faire disparaitre une alerte de commande — c'est le seul defaut
 *    qui coute plus cher que celui qu'on repare.
 *
 * 3. LES INTERRUPTEURS DE CANAL (`whatsapp_actif`, `telegram_actif`) NE SONT
 *    PAS LUS ICI. Mesure le 23 aout 2026 : `telegram_actif` vaut `false` par
 *    defaut en base, et une boutique reelle sur deux le portait a `false` tout
 *    en etant prevenue sur Telegram. Les honorer aurait coupe ses alertes le
 *    soir meme. Le canal se regle dans « Branchement », qui est la source de
 *    verite ; ces deux colonnes decrivent un etat que personne n'a jamais tenu.
 */

/** Ce qu'un interrupteur de l'ecran « Notifications » gouverne. */
export type TypeNotification =
  | 'nouvelle_commande'
  | 'assignation_livreur'
  | 'statut_livraison'
  | 'rapport_quotidien'
  | 'stock_faible';

const COLONNE: Record<TypeNotification, string> = {
  nouvelle_commande: 'notif_nouvelle_commande',
  assignation_livreur: 'notif_assignation_livreur',
  statut_livraison: 'notif_statut_livraison',
  rapport_quotidien: 'notif_rapport_quotidien',
  stock_faible: 'notif_stock_faible',
};

/** Rend le type s'il est connu, `null` sinon — un inconnu ne filtre rien. */
export function typeNotification(valeur: unknown): TypeNotification | null {
  const v = String(valeur ?? '').trim().toLowerCase();
  return v in COLONNE ? (v as TypeNotification) : null;
}

/**
 * Ce destinataire est-il le GERANT de cette boutique ?
 *
 * Volontairement plus etroit que `destinataireDeLaMaison` de `canaux.ts`, qui
 * reconnait aussi le groupe des livreurs : une course ne se tait pas sur une
 * preference.
 *
 * Le numero du gerant peut etre note avec ou sans indicatif — meme regle de
 * suffixe qu'ailleurs, huit chiffres au minimum pour qu'une coincidence ne
 * fasse pas passer un inconnu pour le gerant.
 */
function estLeGerant(
  fiche: { telegram_marchand: string | null; telephone: string | null },
  destinataire: string,
): boolean {
  const cible = String(destinataire ?? '').trim();
  if (!cible) return false;

  const chiffres = (v: string) => v.replace(/[^0-9]/g, '');
  const c = chiffres(cible);

  return [fiche.telegram_marchand, fiche.telephone]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .some((v) => {
      if (v === cible) return true;
      const d = chiffres(v);
      if (!d || !c || Math.min(d.length, c.length) < 8) return false;
      return d.endsWith(c) || c.endsWith(d);
    });
}

export type VerdictPreference =
  | { envoyer: true }
  | { envoyer: false; raison: string };

/**
 * Faut-il envoyer cette notification au marchand ?
 *
 * @param boutique   Slug ou uuid, comme partout ailleurs.
 * @param destinataire Celui qu'on s'apprete a joindre.
 * @param type       L'interrupteur concerne. `null` = on envoie.
 */
export async function notificationAutorisee(params: {
  boutique: string;
  destinataire: string;
  type: TypeNotification | null;
}): Promise<VerdictPreference> {
  const { boutique, destinataire, type } = params;

  // Sans type, il n'y a rien a decider : l'appelant n'a pas nomme sa
  // notification, et deviner serait pire que ne rien filtrer.
  if (!type) return { envoyer: true };

  const sb = getSupabaseAdmin();
  if (!sb) return { envoyer: true };

  const estUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boutique);

  try {
    const requete = sb.from('boutiques').select('id, telegram_marchand, telephone');
    const { data: fiche, error } = estUuid
      ? await requete.eq('id', boutique).maybeSingle()
      : await requete.eq('slug', boutique).maybeSingle();

    if (error || !fiche) return { envoyer: true };

    // Client ou livreur : les preferences du marchand ne les concernent pas.
    if (!estLeGerant(fiche, destinataire)) return { envoyer: true };

    const colonne = COLONNE[type];
    const { data: reglages, error: errReglages } = await sb
      .from('notification_settings')
      .select(colonne)
      .eq('boutique_id', fiche.id)
      .maybeSingle();

    // Pas de ligne, ou lecture impossible : les defauts valent `true`.
    if (errReglages || !reglages) return { envoyer: true };

    const valeur = (reglages as unknown as Record<string, unknown>)[colonne];
    if (valeur === false) {
      return { envoyer: false, raison: `le marchand a désactivé « ${type} »` };
    }
    return { envoyer: true };
  } catch (e) {
    console.error(`Preferences — lecture impossible (${boutique}/${type}) :`, e);
    return { envoyer: true };
  }
}
