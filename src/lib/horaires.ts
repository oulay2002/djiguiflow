/**
 * Ouvert ou ferme, et si c'est ferme, quand ca rouvre.
 *
 * POURQUOI CE FICHIER EXISTE. Rien n'empechait un client de commander a 3 h du
 * matin. Personne ne repond, il n'a aucune explication, et c'est le RESTAURANT
 * qu'il juge — pas l'heure. Une commande hors service ne coute pas une vente,
 * elle coute un client.
 *
 * AUCUN IMPORT ICI, ET C'EST VOULU. Ce calcul sert a la fois au navigateur (le
 * bandeau de la vitrine), au serveur (le refus de la commande) et a la fiche
 * que lit l'assistante. Une regle recopiee finit par diverger — on l'a paye sur
 * la note client et sur le visuel hebdomadaire. Elle vit donc ici, seule, et
 * traverse la frontiere serveur/navigateur sans rien entrainer avec elle.
 *
 * L'heure de reference est celle d'Abidjan : UTC+0 toute l'annee, sans heure
 * d'ete. Aucune conversion, donc aucune erreur de conversion.
 */

export type Creneau = { ouvre: string; ferme: string };
export type Horaires = Partial<Record<Jour, Creneau | null>>;

export const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const;
export type Jour = (typeof JOURS)[number];

export const NOMS_JOURS: Record<Jour, string> = {
  lun: 'Lundi',
  mar: 'Mardi',
  mer: 'Mercredi',
  jeu: 'Jeudi',
  ven: 'Vendredi',
  sam: 'Samedi',
  dim: 'Dimanche',
};

/** L'ordre dans lequel un humain lit une semaine, qui n'est pas celui de Date. */
export const SEMAINE: Jour[] = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

export type EtatBoutique = {
  ouvert: boolean;
  /**
   * `null` quand la boutique n'a pas d'horaires : elle est alors toujours
   * ouverte, et il n'y a rien a annoncer.
   */
  message: string | null;
};

/** « 11:00 » → 660. `null` si la valeur n'a pas la forme attendue. */
function minutes(hhmm: unknown): number | null {
  const m = String(hhmm ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 660 → « 11h ». On ecrit « 11h30 » seulement quand il y a des minutes. */
export function enHeure(hhmm: string): string {
  const t = minutes(hhmm);
  if (t === null) return hhmm;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Lit ce qui vient de la base sans jamais lever.
 *
 * Le contenu est du JSON libre : il peut avoir ete saisi de travers, ou dater
 * d'une version anterieure. Une horaire illisible doit laisser la boutique
 * OUVERTE — fermer un commerce sur une erreur de lecture serait le pire des
 * comportements.
 */
export function lireHoraires(brut: unknown): Horaires | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;

  const source = brut as Record<string, unknown>;
  const sortie: Horaires = {};
  let auMoinsUnJourValide = false;

  for (const jour of JOURS) {
    const v = source[jour];
    if (v === null) {
      sortie[jour] = null;
      auMoinsUnJourValide = true;
      continue;
    }
    if (!v || typeof v !== 'object') continue;

    const c = v as Record<string, unknown>;
    const ouvre = String(c.ouvre ?? '').trim();
    const ferme = String(c.ferme ?? '').trim();
    if (minutes(ouvre) === null || minutes(ferme) === null) continue;

    sortie[jour] = { ouvre, ferme };
    auMoinsUnJourValide = true;
  }

  return auMoinsUnJourValide ? sortie : null;
}

/** Le creneau couvre-t-il cet instant ? Gere la fermeture apres minuit. */
function dansLeCreneau(c: Creneau, minute: number): boolean {
  const debut = minutes(c.ouvre);
  const fin = minutes(c.ferme);
  if (debut === null || fin === null) return false;

  // « 18:00 → 02:00 » : le creneau enjambe minuit. C'est le cas courant d'un
  // maquis, pas une exception a traiter en dernier.
  if (fin <= debut) return minute >= debut || minute < fin;
  return minute >= debut && minute < fin;
}

/**
 * Ouvert maintenant ? Et sinon, quand ?
 *
 * @param maintenant Injectable pour que le calcul soit eprouvable sans
 *   dependre de l'heure qu'il est — une regle horaire testee « quand ca tombe
 *   bien » n'est pas testee.
 */
export function etatBoutique(brut: unknown, maintenant: Date = new Date()): EtatBoutique {
  const horaires = lireHoraires(brut);

  // Pas d'horaires : toujours ouvert. Les boutiques deja en service n'en ont
  // pas, et les fermer d'office ferait plus de degats que le probleme qu'on
  // corrige.
  if (!horaires) return { ouvert: true, message: null };

  const minuteDuJour = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  const indexJour = maintenant.getUTCDay();
  const aujourdhui = JOURS[indexJour];

  // Ouvert par le creneau du jour…
  const creneauDuJour = horaires[aujourdhui];
  if (creneauDuJour && dansLeCreneau(creneauDuJour, minuteDuJour)) {
    return { ouvert: true, message: `Ouvert jusqu’à ${enHeure(creneauDuJour.ferme)}` };
  }

  // …ou par celui de la VEILLE qui deborde apres minuit. Sans ce cas, un maquis
  // ouvert jusqu'a 2 h se declarait ferme des minuit passee, en plein service.
  const hier = JOURS[(indexJour + 6) % 7];
  const creneauHier = horaires[hier];
  if (creneauHier) {
    const debut = minutes(creneauHier.ouvre);
    const fin = minutes(creneauHier.ferme);
    if (debut !== null && fin !== null && fin <= debut && minuteDuJour < fin) {
      return { ouvert: true, message: `Ouvert jusqu’à ${enHeure(creneauHier.ferme)}` };
    }
  }

  // Ferme : on cherche la prochaine ouverture, aujourd'hui puis les jours
  // suivants. Dire « ferme » sans dire quand on rouvre laisse le client sans
  // rien a faire de l'information.
  for (let d = 0; d < 8; d++) {
    const jour = JOURS[(indexJour + d) % 7];
    const c = horaires[jour];
    if (!c) continue;
    const debut = minutes(c.ouvre);
    if (debut === null) continue;

    if (d === 0 && debut > minuteDuJour) {
      return { ouvert: false, message: `Fermé — ouvre à ${enHeure(c.ouvre)}` };
    }
    if (d === 1) {
      return { ouvert: false, message: `Fermé — ouvre demain à ${enHeure(c.ouvre)}` };
    }
    if (d > 1) {
      return {
        ouvert: false,
        message: `Fermé — ouvre ${NOMS_JOURS[jour].toLowerCase()} à ${enHeure(c.ouvre)}`,
      };
    }
  }

  // Sept jours declares fermes : la boutique est en conge, ou le marchand s'est
  // trompe. On ne devine pas a sa place.
  return { ouvert: false, message: 'Fermé actuellement' };
}
