import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Plafonnement des points d'entree publics et couteux.
 *
 * Deux etages, parce qu'un seul ne suffit pas :
 *
 * 1. LA RAFALE, en memoire du processus. Elle arrete le cas reel — une boucle
 *    depuis un poste — sans aller-retour vers la base a chaque appel. Elle ne
 *    voit qu'une instance : c'est un plancher, pas un plafond.
 * 2. LE PLAFOND JOURNALIER, en base. C'est lui qui protege la depense, parce
 *    qu'il est PARTAGE : Vercel reutilise ses instances mais en cree d'autres
 *    sous charge, et un compteur en memoire repartirait de zero dans chacune.
 *    Un abus reparti sur plusieurs sources ne passe que celui-la.
 */

export type Verdict =
  | { autorise: true }
  | { autorise: false; motif: 'rafale' | 'plafond' | 'indisponible'; attendreSecondes: number };

/**
 * Qui appelle, du point de vue du plafonnement.
 *
 * `x-forwarded-for` est fourni par le CLIENT quand rien ne le reecrit : son
 * premier element est donc falsifiable, et plafonner dessus se contourne en
 * changeant un en-tete. Vercel, lui, pose `x-real-ip` et
 * `x-vercel-forwarded-for` qu'il maitrise. On les prefere, et `x-forwarded-for`
 * ne sert que de dernier recours — mieux qu'aucune cle, moins bon que les deux
 * autres.
 */
export function adresseAppelante(req: Request): string {
  const direct = req.headers.get('x-real-ip')?.trim();
  if (direct) return direct;

  const vercel = req.headers.get('x-vercel-forwarded-for')?.trim();
  if (vercel) return vercel.split(',')[0].trim();

  const chaine = req.headers.get('x-forwarded-for')?.trim();
  if (chaine) return chaine.split(',')[0].trim();

  // Sans adresse, tout le monde partage la meme cle : le plafond de rafale
  // devient global. C'est volontaire — se replier sur « pas de limite » serait
  // le contraire de ce que cette fonction existe pour faire.
  return 'inconnue';
}

/** Fenetre glissante par cle, en memoire du processus. */
const fenetres = new Map<string, number[]>();

/**
 * Purge les cles inactives. Sans elle, la Map grossit a chaque adresse vue et
 * l'instance finit par manquer de memoire — une fuite lente, donc invisible
 * jusqu'a l'incident.
 */
function purger(maintenant: number, fenetreMs: number): void {
  if (fenetres.size < 2000) return;
  for (const [cle, horodatages] of fenetres) {
    if (horodatages.every((t) => maintenant - t > fenetreMs)) fenetres.delete(cle);
  }
}

export function rafaleDepassee(
  cle: string,
  limite: number,
  fenetreMs: number,
): { depassee: boolean; attendreSecondes: number } {
  const maintenant = Date.now();
  purger(maintenant, fenetreMs);

  const recents = (fenetres.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);

  if (recents.length >= limite) {
    // On n'ajoute PAS l'appel refuse : sinon une boucle repousserait sa propre
    // fenetre indefiniment et ne serait jamais reautorisee.
    fenetres.set(cle, recents);
    const plusAncien = Math.min(...recents);
    return {
      depassee: true,
      attendreSecondes: Math.max(1, Math.ceil((fenetreMs - (maintenant - plusAncien)) / 1000)),
    };
  }

  recents.push(maintenant);
  fenetres.set(cle, recents);
  return { depassee: false, attendreSecondes: 0 };
}

/**
 * Plafond partage, via `incrementer_compteur` — un seul aller-retour, atomique.
 *
 * FERME EN CAS DE DOUTE, et c'est un choix. Si la base ne repond pas, on ne
 * peut plus compter, donc plus proteger la depense. Le fichier `mode.ts` pose
 * deja la regle pour la facturation — « le repli doit toujours pencher du cote
 * qui n'offre rien » — et elle vaut ici : refuser une conversation le temps
 * d'une panne de base coute une gene, laisser passer coute de l'argent sans
 * limite. Le refus est explicite et journalise, jamais silencieux.
 */
export async function plafondJournalierDepasse(
  cle: string,
  plafond: number,
): Promise<{ depasse: boolean; valeur: number | null; indisponible: boolean }> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error(`Limiteur ${cle} — base indisponible : appel refusé faute de pouvoir compter.`);
    return { depasse: true, valeur: null, indisponible: true };
  }

  // `supabase.rpc()` n'est pas une promesse au sens habituel : il n'a pas de
  // `.catch`. On l'attend et on lit `error`, sinon un echec passerait inapercu.
  const { data, error } = await sb.rpc('incrementer_compteur', {
    p_cle: cle,
    p_plafond: plafond,
  });

  if (error) {
    console.error(`Limiteur ${cle} — comptage impossible : ${error.message}`);
    return { depasse: true, valeur: null, indisponible: true };
  }

  const ligne = Array.isArray(data) ? data[0] : data;
  const valeur = typeof ligne?.valeur === 'number' ? ligne.valeur : null;
  const autorise = ligne?.autorise === true;

  if (!autorise) {
    console.error(`Limiteur ${cle} — plafond journalier atteint (${valeur ?? '?'} / ${plafond}).`);
  }

  return { depasse: !autorise, valeur, indisponible: false };
}

/** Secondes jusqu'a minuit a Abidjan — le moment ou le plafond se remet a zero. */
export function secondesAvantMinuitAbidjan(maintenant = new Date()): number {
  // Abidjan est a UTC+0 toute l'annee, sans heure d'ete : la journee locale est
  // la journee UTC. Le dire explicitement evite une conversion de fuseau qui
  // deviendrait fausse si on la recopiait ailleurs.
  const finDeJournee = Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(1, Math.ceil((finDeJournee - maintenant.getTime()) / 1000));
}
