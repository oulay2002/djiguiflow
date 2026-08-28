import {
  PLAFOND_PREUVES_PAR_COMMANDE,
  verdictJeton,
  verdictTelephone,
} from '@/lib/jetonSuivi';
import { adresseAppelante, plafondJournalierDepasse, rafaleDepassee } from '@/lib/limiteur';
import { motifExact, referenceRecevable } from '@/lib/reference';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * « Prouvez-moi que c'est bien vous », en un seul endroit.
 *
 * ── LE PIÈGE QUE CE FICHIER EXISTE POUR ÉVITER ─────────────────────────────
 *
 * L'écran des droits demande naturellement : « entrez votre numéro et voyez ce
 * qu'on détient sur vous ». C'EST UNE FUITE, pas une protection. Un numéro de
 * téléphone n'est pas un secret : n'importe qui peut taper celui d'un voisin et
 * obtenir son nom, son adresse de domicile et l'historique de ses commandes.
 * Un écran de protection des données qui fonctionne ainsi est le pire endroit
 * de toute la plateforme.
 *
 * ── CE QU'ON EXIGE À LA PLACE ──────────────────────────────────────────────
 *
 * Exactement la preuve que `/api/suivi` exige déjà, ni plus faible, ni
 * différente :
 *
 *   - le JETON du lien reçu dans son message — 128 bits, indevinable ; ou
 *   - la RÉFÉRENCE d'une commande plus les QUATRE DERNIERS CHIFFRES de son
 *     numéro, bornés à dix essais par jour et par commande.
 *
 * Prouver qu'on maîtrise une commande, c'est prouver qu'on est ce client. Le
 * numéro n'est alors plus une saisie — il est LU sur la commande prouvée. On ne
 * cherche jamais par ce que l'appelant a tapé.
 *
 * ── L'AMPLIFICATION, DITE FRANCHEMENT ──────────────────────────────────────
 *
 * `/suivi` révèle UNE commande ; cet écran les rassemble toutes. La même preuve
 * ouvre donc davantage. On l'assume : la borne de dix essais par jour et par
 * commande demande mille jours pour balayer quatre chiffres, et exiger
 * davantage rendrait le droit inexerçable par celui qui a perdu son message —
 * ce qui est le vrai défaut qu'un régulateur reproche.
 *
 * En contrepartie, toute demande est inscrite dans `demandes_droits` avec la
 * référence et le moyen employés : un effacement obtenu par devinette laisse
 * une trace nominative.
 */

/** Ce que vaut la preuve fournie. */
export type Preuve =
  | {
      ok: true;
      /** Le numéro LU SUR LA COMMANDE, jamais celui saisi par l'appelant. */
      telephone: string;
      reference: string;
      boutiqueId: string;
      moyen: 'jeton' | 'telephone';
    }
  | { ok: false; statut: number; message: string; entetes?: Record<string, string> };

/** Dix minutes, la même fenêtre que la confirmation. */
const FENETRE_MS = 10 * 60_000;

/**
 * Une saisie brute ramenée à du texte, ou `null`.
 *
 * `String(undefined)` rend la chaîne « undefined », qui n'est pas vide et
 * passerait donc pour une preuve fournie. Le contrôle du nullish doit venir
 * AVANT la conversion, jamais après.
 */
function texte(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/**
 * Combien de fois une même adresse peut demander une preuve, en dix minutes.
 *
 * ── CE CHIFFRE A ÉTÉ CORRIGÉ APRÈS MESURE ──────────────────────────────────
 *
 * Il valait 8, « puisqu'on ne consulte pas ses droits huit fois de suite ».
 * Le banc l'a heurté à sa première relance — et surtout, le raisonnement
 * oubliait le pays : les opérateurs mobiles ivoiriens partagent massivement
 * leurs adresses, et un cybercafé en présente une seule. Huit appels, c'est un
 * quartier entier qui se bloque lui-même sur l'écran de ses droits.
 *
 * ── POURQUOI L'ÉLARGIR NE COÛTE RIEN EN SÉCURITÉ ───────────────────────────
 *
 * Ce n'est pas ce plafond-ci qui protège du balayage. Deux autres le font, et
 * ils ne dépendent pas de l'adresse :
 *
 *   - une demande SANS preuve rend toujours 404, avec le MÊME texte qu'une
 *     référence inexistante : la balayer n'apprend rien, jamais ;
 *   - une demande AVEC quatre chiffres consomme le plafond PAR COMMANDE — dix
 *     par jour, soit mille jours pour balayer dix mille possibilités — et ce
 *     compteur-là porte la commande, donc une attaque répartie sur cent
 *     adresses n'y gagne rien.
 *
 * Ce plafond ne borne donc que le coût : il empêche un client de marteler la
 * route, pas un attaquant d'apprendre quelque chose.
 */
const DEMANDES_PAR_APPELANT = 20;

/**
 * Vérifie la preuve et rend le numéro du client.
 *
 * TOUT REFUS REND 404 AVEC LE MÊME TEXTE. Distinguer « référence inconnue » de
 * « preuve fausse » dirait à celui qui devine qu'il a trouvé une vraie
 * commande, et transformerait cet écran en détecteur de clients.
 */
export async function prouverClient(
  req: Request,
  saisie: { ref: unknown; jeton?: unknown; tel4?: unknown },
): Promise<Preuve> {
  const introuvable = {
    ok: false as const,
    statut: 404,
    message:
      'Aucune commande sous cette référence. Vérifiez-la, ainsi que les quatre '
      + 'derniers chiffres de votre numéro.',
  };

  const appelant = adresseAppelante(req);
  const rafale = rafaleDepassee(`droits:${appelant}`, DEMANDES_PAR_APPELANT, FENETRE_MS);
  if (rafale.depassee) {
    console.error(`Droits — rafale refusée depuis ${appelant} : énumération probable.`);
    return {
      ok: false,
      statut: 429,
      message: 'Trop de demandes. Patientez quelques minutes avant de réessayer.',
      entetes: { 'Retry-After': String(rafale.attendreSecondes) },
    };
  }

  const ref = String(saisie.ref ?? '').trim();
  if (!referenceRecevable(ref)) return introuvable;

  const sb = getSupabaseAdmin();
  if (!sb) {
    return { ok: false, statut: 503, message: 'Service temporairement indisponible.' };
  }

  const { data, error } = await sb
    .from('commandes')
    .select('reference, jeton_suivi, client_telephone, boutique_id')
    .ilike('reference', motifExact(ref))
    .maybeSingle();

  if (error) {
    console.error(`Droits — lecture impossible (${ref}) :`, error.message);
    return { ok: false, statut: 503, message: 'Service temporairement indisponible.' };
  }
  if (!data) return introuvable;

  const verdictDuJeton = verdictJeton(texte(saisie.jeton), data.jeton_suivi);
  if (verdictDuJeton === 'ok') {
    return {
      ok: true,
      telephone: String(data.client_telephone ?? ''),
      reference: String(data.reference ?? ''),
      boutiqueId: String(data.boutique_id ?? ''),
      moyen: 'jeton',
    };
  }

  // Un jeton FAUX n'est pas un oubli, c'est une tentative : on refuse sans même
  // proposer la seconde preuve, sinon le jeton ne servirait à rien.
  if (verdictDuJeton === 'invalide') {
    console.error(`Droits — jeton refusé depuis ${appelant}.`);
    return introuvable;
  }

  // ---- La seconde preuve, pour qui a perdu son message.
  const verdictDuTelephone = verdictTelephone(texte(saisie.tel4), data.client_telephone);

  // NI JETON, NI CHIFFRES : REFUS, TOUJOURS.
  //
  // `/api/suivi` tolère l'absence de preuve quand `JETON_EXIGE` est faux — une
  // tolérance héritée de la transition, pour ne pas casser les liens que des
  // clients avaient déjà en main. Cet écran ne l'hérite pas : il vient de
  // naître, personne n'en détient de vieux lien, et il montre bien plus qu'une
  // commande. La référence seule ne suffit donc jamais ici.
  if (verdictDuTelephone === 'absent') return introuvable;

  // Le compteur est consommé même quand la preuve est JUSTE : sinon un
  // attaquant essaierait sans fin tant qu'il se trompe, et la borne ne
  // bornerait rien.
  const plafond = await plafondJournalierDepasse(
    `preuve:${data.reference}`,
    PLAFOND_PREUVES_PAR_COMMANDE,
  );
  if (plafond.depasse) {
    console.error(`Droits — plafond de preuves atteint sur une commande, depuis ${appelant}.`);
    return introuvable;
  }

  if (verdictDuTelephone !== 'ok') {
    console.error(`Droits — seconde preuve refusée depuis ${appelant}.`);
    return introuvable;
  }

  return {
    ok: true,
    telephone: String(data.client_telephone ?? ''),
    reference: String(data.reference ?? ''),
    boutiqueId: String(data.boutique_id ?? ''),
    moyen: 'telephone',
  };
}

/**
 * Le numéro montré à l'écran, amputé de son milieu : 01 •• •• •• 05.
 *
 * La personne se reconnaît, et une capture d'écran ne livre pas le numéro
 * entier. Ce n'est pas une mesure de sécurité — la preuve a déjà été donnée —
 * c'est de la retenue : on n'affiche pas plus que nécessaire pour être compris.
 */
export function numeroMasque(telephone: string): string {
  const d = String(telephone ?? '').replace(/\D/g, '');
  if (d.length < 4) return '••';
  return `${d.slice(0, 2)} •• •• •• ${d.slice(-2)}`;
}
