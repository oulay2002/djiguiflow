import { normaliserTelephone } from '@/lib/telephone';

/**
 * CE QU'UN MARCHAND NOUS DIT AVANT D'AVOIR UNE BOUTIQUE.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * `/register` collecte le nom du commerce, le type et le telephone… **quand on
 * s'inscrit par e-mail**. Le bouton Google, lui, ne demande RIEN : il ne reste
 * que le nom de la personne, son adresse et sa photo.
 *
 * Les deux marchands perdus les 24 et 25 aout 2026 sont passes par Google.
 * L'ecran d'accueil leur demandait de nous ecrire « le nom de votre commerce et
 * la zone que vous livrez » — par message, alors que ce sont deux champs. Et
 * meme s'ils avaient ecrit, on n'avait AUCUN numero pour les rappeler.
 *
 * ── OU CES REPONSES VIVENT, ET POURQUOI C'EST ACCEPTABLE ───────────────────
 *
 * Dans `user_metadata`, par `supabase.auth.updateUser` : le meme endroit et le
 * meme mecanisme que l'inscription par e-mail. Ces donnees sont donc ecrites
 * PAR LE CLIENT, par construction.
 *
 * Ce qui le rend sans danger : **rien, cote serveur, ne s'en sert pour decider
 * quoi que ce soit**. `estAdmin` passe par `ADMIN_USER_IDS` — la regle a
 * justement ete changee le 26 aout parce qu'une adresse « se reclame » — et la
 * route de provisioning prend son nom et son slug dans son corps de requete.
 * Ces trois champs ne servent qu'a PARLER a l'exploitant.
 *
 * ── D'OU LES BORNES ────────────────────────────────────────────────────────
 *
 * Ils partent dans une alerte Telegram. Une inscription hostile pourrait donc y
 * glisser des retours a la ligne pour maquiller l'alerte en plusieurs, ou une
 * chaine longue pour noyer ce qui suit. On assainit ici, une fois, plutot qu'a
 * chaque endroit qui les affiche.
 */

/** Au-dela, on coupe : une alerte doit se lire d'un coup d'oeil sur un telephone. */
export const LONGUEUR_MAX = 80;

/**
 * Une valeur libre, rendue sûre a afficher.
 *
 * Les caracteres de controle partent AVANT que les espaces soient replies :
 * sinon un `\n` deviendrait une ligne vide au lieu d'un espace, et l'alerte
 * gagnerait une ligne que personne n'a ecrite.
 */
export function assainir(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LONGUEUR_MAX);
}

export type DemandeBoutique = {
  /** Le nom du commerce, tel que le marchand l'ecrit. */
  nom: string;
  /** Le numero, en forme nationale quand il est lisible ; brut sinon. */
  telephone: string;
  /** Les quartiers livres, en texte libre. */
  zone: string;
};

/** Ce que le compte porte aujourd'hui, assaini. */
export function lireDemande(meta: unknown): DemandeBoutique {
  const m = (meta ?? {}) as Record<string, unknown>;
  return {
    nom: assainir(m.business_name),
    telephone: assainir(m.phone),
    zone: assainir(m.zone_livree),
  };
}

/**
 * LE NUMERO PASSE PAR LA MEME PORTE QUE PARTOUT AILLEURS.
 *
 * `normaliserTelephone` connait les formes ivoiriennes et refuse les saisies
 * qui n'en sont pas. On garde la forme nationale quand elle est lisible, et la
 * saisie brute sinon : un numero mal forme reste plus utile qu'un vide, tant
 * qu'il n'est pas presente comme valide.
 */
export function normaliserDemande(saisie: {
  nom: unknown;
  telephone: unknown;
  zone: unknown;
}): DemandeBoutique {
  const tel = normaliserTelephone(saisie.telephone);
  return {
    nom: assainir(saisie.nom),
    telephone: tel.ok ? tel.national : assainir(saisie.telephone),
    zone: assainir(saisie.zone),
  };
}

/**
 * PEUT-ON AGIR ? Il faut un nom pour ouvrir la boutique, et un numero pour
 * rappeler. La zone est precieuse et ne bloque rien : on n'exige pas d'un
 * marchand qu'il sache deja ou il livrera.
 */
export function demandeExploitable(d: DemandeBoutique): boolean {
  return d.nom.length > 0 && d.telephone.length > 0;
}

/**
 * UNE SEULE LIGNE, POUR L'ALERTE.
 *
 * Vide quand le marchand n'a rien dit : l'alerte doit alors se contenter de son
 * adresse, et surtout ne pas afficher des guillemets vides qui se liraient
 * comme une panne d'affichage.
 */
export function resumeDemande(d: DemandeBoutique): string {
  const morceaux: string[] = [];
  if (d.nom) morceaux.push(`« ${d.nom} »`);
  if (d.telephone) morceaux.push(d.telephone);
  if (d.zone) morceaux.push(`livre à ${d.zone}`);
  return morceaux.join(', ');
}
