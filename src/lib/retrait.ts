/**
 * Le retrait, l'heure demandee, et la livraison offerte.
 *
 * POURQUOI CES REGLES VIVENT ICI, SEULES. Elles servent aux DEUX bouts de la
 * meme commande : la vitrine, qui propose le choix au client et lui annonce ce
 * qu'il paiera, et la route, qui accepte ou refuse et ecrit en base. Une regle
 * recopiee finit par diverger — ce depot l'a paye sur la note client, sur le
 * visuel hebdomadaire, et sur `boutiquePrete` avant qu'elle soit sortie de sa
 * route. Le client verrait « livraison offerte » et paierait le livreur.
 *
 * AUCUN IMPORT VERS SUPABASE NI VERS REACT : ce fichier traverse la frontiere
 * navigateur/serveur sans rien entrainer avec lui, comme `horaires.ts`.
 *
 * L'heure de reference est celle d'Abidjan — UTC+0 toute l'annee, sans heure
 * d'ete. Aucune conversion, donc aucune erreur de conversion. C'est ce qui
 * permet au NAVIGATEUR de n'envoyer qu'un « HH:MM » et au SERVEUR seul de le
 * dater : un client qui commande depuis Paris pour sa famille a Abidjan ne doit
 * pas voir son fuseau decider de l'heure de retrait.
 */

export type ModeBoutique = 'livraison' | 'retrait' | 'les_deux';

/** Ce qu'une commande retient : elle est livree, ou retiree. Jamais « les deux ». */
export type ModeCommande = 'livraison' | 'retrait';

/**
 * Les modes qu'une boutique propose reellement, dans l'ordre ou on les montre.
 *
 * UN SEUL ELEMENT VEUT DIRE « AUCUN CHOIX A POSER » : la vitrine n'affiche
 * alors pas de selecteur, parce qu'un choix a une seule option est un bruit qui
 * fait douter.
 *
 * TOUT MODE INCONNU RETOMBE SUR LA LIVRAISON. C'est le defaut de la colonne et
 * le comportement de toutes les boutiques en service : une valeur imprevue ne
 * doit pas transformer une boutique qui livre en boutique de retrait, ce qui
 * cesserait d'alerter ses livreurs sans que rien ne le dise.
 */
export function modesProposes(mode: unknown): ModeCommande[] {
  const m = String(mode ?? '').trim();
  if (m === 'retrait') return ['retrait'];
  if (m === 'les_deux') return ['livraison', 'retrait'];
  return ['livraison'];
}

/** Le mode retenu quand le client n'a rien choisi. */
export function modeParDefaut(mode: unknown): ModeCommande {
  return modesProposes(mode)[0];
}

/**
 * Le mode demande est-il propose par cette boutique ?
 *
 * LE REFUS SE PRONONCE COTE SERVEUR, comme pour les horaires et le stock. Un
 * selecteur absent dans le navigateur n'empeche rien : un onglet reste ouvert
 * apres que le marchand a change d'avis, un appel se forge. Sans ce controle,
 * une commande « retrait » arriverait chez un marchand qui ne fait que livrer,
 * et un client attendrait devant une porte ou personne ne l'attend.
 */
export function modeAccepte(modeBoutique: unknown, demande: unknown): boolean {
  const d = String(demande ?? '').trim();
  return (modesProposes(modeBoutique) as string[]).includes(d);
}

/**
 * La livraison est-elle offerte pour ce total ?
 *
 *     null / absent  non — le livreur annonce ses frais et les encaisse
 *     0              toujours offerte
 *     N > 0          offerte a partir de N FCFA
 *
 * ZERO EST UN SEUIL, PAS UN TROU : « offerte a partir de 0 F » se lit
 * exactement comme « toujours offerte ». C'est la seule place de ce depot ou
 * zero et `null` cohabitent sans ambiguite.
 */
export function livraisonOfferte(offerteDes: unknown, total: number): boolean {
  if (offerteDes === null || offerteDes === undefined || offerteDes === '') return false;
  const seuil = Number(offerteDes);
  if (!Number.isFinite(seuil) || seuil < 0) return false;
  return Number(total) >= seuil;
}

const fcfa = (n: number) => Math.round(n).toLocaleString('fr-FR');

/**
 * CE QUE LE TOTAL NE DIT PAS, en une phrase.
 *
 * La vitrine annoncait « les frais sont annonces par le livreur » a tout le
 * monde. Chez un marchand qui offre la livraison, c'etait FAUX : le client
 * s'attendait a payer un supplement qui n'existe pas, et le doute coute une
 * vente. En retrait, la phrase n'avait carrement aucun sens.
 *
 * ON NE PROMET JAMAIS UN MONTANT qu'on ne connait pas : quand le livreur
 * annonce ses frais, on dit qu'il y en aura, pas combien.
 */
export function mentionFrais(a: {
  mode: ModeCommande;
  offerteDes: unknown;
  total: number;
}): string {
  if (a.mode === 'retrait') {
    return 'Vous récupérez votre commande sur place : aucun frais de livraison.';
  }

  if (livraisonOfferte(a.offerteDes, a.total)) {
    return 'Livraison offerte : vous ne réglez rien de plus au livreur.';
  }

  const seuil = Number(a.offerteDes);
  if (a.offerteDes !== null && a.offerteDes !== undefined && Number.isFinite(seuil) && seuil > 0) {
    return `Livraison offerte à partir de ${fcfa(seuil)} FCFA. En dessous, les frais`
      + ' sont annoncés par le livreur et se règlent à la réception.';
  }

  return 'Les frais de livraison sont annoncés par le livreur et se règlent'
    + ' en plus, à la réception.';
}

/** « HH:MM » a Abidjan. UTC+0 toute l'annee : l'heure UTC EST l'heure locale. */
export function heureAbidjan(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Minutes de preparation exploitables, ou 0. NULL veut dire « non renseigne ». */
function preparation(min: unknown): number {
  const n = Number(min);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * La premiere heure de retrait tenable : maintenant, plus le temps de
 * preparation annonce par le marchand.
 *
 * Sans temps de preparation, c'est maintenant — on n'invente pas un delai a la
 * place du marchand, on se contente de refuser le passe.
 */
export function heureRetraitMinimale(maintenant: Date, preparationMin: unknown): string {
  return heureAbidjan(new Date(maintenant.getTime() + preparation(preparationMin) * 60_000));
}

export type VerdictHeure =
  | { ok: true; iso: string | null }
  | { ok: false; message: string };

/**
 * « HH:MM » → l'instant correspondant, dans la journee d'Abidjan en cours.
 *
 * VIDE VEUT DIRE « DES QUE PRET », ET S'ECRIT `null`. Jamais une heure devinee :
 * la colonne dit exactement cela, et une heure inventee ferait attendre un
 * client devant une porte a un moment que personne ne lui a promis.
 *
 * UNE HEURE DEJA PASSEE SE REFUSE, ELLE NE BASCULE PAS AU LENDEMAIN. Reporter
 * en silence « 8 h » saisi a 23 h 50 donnerait au client et au marchand deux
 * lectures differentes de la meme commande — et c'est le client qui se
 * deplacerait pour rien. Un refus explicite se corrige en un geste.
 */
export function horodaterRetrait(
  hhmm: unknown,
  maintenant: Date,
  preparationMin: unknown,
): VerdictHeure {
  const brut = String(hhmm ?? '').trim();
  if (!brut) return { ok: true, iso: null };

  const m = brut.match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Number(m[1]) : NaN;
  const min = m ? Number(m[2]) : NaN;
  if (!m || h > 23 || min > 59) {
    return { ok: false, message: 'Heure de retrait illisible : indiquez-la sous la forme 12:30.' };
  }

  const vise = new Date(Date.UTC(
    maintenant.getUTCFullYear(),
    maintenant.getUTCMonth(),
    maintenant.getUTCDate(),
    h,
    min,
    0,
    0,
  ));

  const attente = preparation(preparationMin);
  const plancher = maintenant.getTime() + attente * 60_000;

  if (vise.getTime() < plancher) {
    const mini = heureRetraitMinimale(maintenant, preparationMin);
    return {
      ok: false,
      message: attente
        ? `Comptez environ ${attente} minutes de préparation : choisissez une heure à partir de ${mini}.`
        : `Cette heure est déjà passée : choisissez une heure à partir de ${mini}.`,
    };
  }

  return { ok: true, iso: vise.toISOString() };
}
