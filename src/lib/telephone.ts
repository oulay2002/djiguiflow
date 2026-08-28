// Normalisation et controle des numeros ivoiriens.
// Module pur (aucune dependance Node) : utilisable cote client ET cote serveur.
//
// Depuis 2021 un numero ivoirien national compte 10 chiffres et commence par 0
// (ex. 0102030405). Le format international ajoute l'indicatif 225.
//
// Les donnees existantes montraient des saisies acceptees a tort : 7 chiffres,
// 9 chiffres (zero initial perdu), ou un indicatif etranger (228 = Togo).

export type TelephoneResultat =
  | { ok: true; national: string; international: string }
  | { ok: false; erreur: string };

const LONGUEUR_NATIONALE = 10;
const INDICATIF = '225';

/**
 * Accepte 0102030405, 225 0102030405, +225 0102030405, 00225 0102030405,
 * avec espaces, points ou tirets. Retourne les deux formes normalisees.
 */
export function normaliserTelephone(saisie: unknown): TelephoneResultat {
  let d = String(saisie ?? '').replace(/\D/g, '');

  if (!d) return { ok: false, erreur: 'Numéro de téléphone requis.' };

  // Retrait de l'indicatif pays, seulement s'il reste bien 10 chiffres derriere.
  if (d.startsWith('00' + INDICATIF) && d.length === 5 + LONGUEUR_NATIONALE) {
    d = d.slice(5);
  } else if (d.startsWith(INDICATIF) && d.length === 3 + LONGUEUR_NATIONALE) {
    d = d.slice(3);
  }

  if (d.length !== LONGUEUR_NATIONALE) {
    return {
      ok: false,
      erreur: `Le numéro doit contenir ${LONGUEUR_NATIONALE} chiffres (ex. 0102030405). Vous en avez saisi ${d.length}.`,
    };
  }

  // Un numero national commence toujours par 0 : sans ce controle, un
  // indicatif etranger colle (ex. 2289012338) passerait la regle de longueur.
  if (!d.startsWith('0')) {
    return { ok: false, erreur: 'Le numéro doit commencer par 0 (ex. 0102030405).' };
  }

  return { ok: true, national: d, international: INDICATIF + d };
}

/**
 * La cle d'appariement d'un `chat_id` — les HUIT derniers chiffres.
 *
 * POURQUOI ELLE EXISTE. Mesure du 24 aout 2026 : le meme client portait
 * TROIS `chat_id` differents chez la meme boutique — `2250102918886`
 * (11 commandes), `22502918886` (10) et `0102918886` (6). Les routes
 * appariaient par egalite stricte : la note qu'il envoyait apres livraison ne
 * retrouvait aucune commande, partait a l'assistante, et lui revenait sous la
 * forme d'un nouveau menu. Sa note etait perdue sans le moindre signal.
 *
 * POURQUOI ON N'UNIFORMISE PAS LA COLONNE. `chat_id` est une ADRESSE D'ENVOI,
 * pas un numero : sur Telegram, c'est par lui qu'on ecrit au client
 * (`canaux.ts` le dit — « pas de normalisation telephonique ici, c'est un
 * chat_id »). Le reecrire casserait les envois. On tolere donc a la LECTURE,
 * ce qui est de toute facon obligatoire : WhatsApp continuera d'annoncer le
 * numero sous la forme ou il a ete enregistre, et rien ici ne peut l'en
 * empecher.
 *
 * POURQUOI HUIT. Avant 2021 un numero ivoirien en comptait huit ; la reforme
 * a prefixe un couple d'operateur (01, 05, 07). Les huit derniers chiffres
 * sont donc la part STABLE de part et d'autre de la reforme, et les trois
 * formes ci-dessus s'y rejoignent toutes sur `02918886`.
 *
 * ⚠ CE QU'ELLE COUTE, ET IL FAUT LE SAVOIR. Deux numeros qui ne different que
 * par le prefixe d'operateur — `0102918886` et `0702918886` — partagent cette
 * cle. Dans une meme boutique, ils seraient confondus. C'est le prix assume
 * de l'option retenue ; le filtre par boutique le borne, et le desordre vient
 * d'une source qu'on ne controle pas.
 *
 * ELLE NE REND RIEN pour ce qui n'a pas la FORME d'un telephone ivoirien —
 * un identifiant Telegram, par exemple, qui est un entier arbitraire et
 * parfaitement stable. Ceux-la restent apparies a l'identique, et ne peuvent
 * donc pas etre elargis par erreur.
 */
export function cleAppariement(saisie: unknown): string {
  const d = String(saisie ?? '').replace(/\D/g, '');
  if (d.length < 8) return '';
  if (!d.startsWith('0') && !d.startsWith(INDICATIF)) return '';
  return d.slice(-8);
}

/**
 * Deux valeurs désignent-elles LA MÊME PERSONNE ?
 *
 * ── POURQUOI `cleAppariement` NE SUFFIT PAS ICI ────────────────────────────
 *
 * Les huit derniers chiffres réunissent bien les trois formes du même numéro
 * (`2250102918886`, `22502918886`, `0102918886`), et c'est ce qu'on veut. Mais
 * ils réunissent AUSSI `0102918886` et `0702918886`, qui sont deux abonnés
 * différents. Ailleurs ce risque est borné par le filtre boutique ; l'écran
 * des droits, lui, rassemble les données de TOUTES les boutiques et montre une
 * adresse de domicile. La confusion n'y serait plus une gêne, ce serait une
 * fuite.
 *
 * ── LA RÈGLE ───────────────────────────────────────────────────────────────
 *
 * Les huit chiffres stables doivent concorder — c'est nécessaire. Et quand les
 * DEUX valeurs se laissent normaliser en un numéro national à dix chiffres,
 * ces dix chiffres doivent concorder aussi : c'est ce second contrôle qui
 * sépare `01…` de `07…`.
 *
 * Quand l'une des deux ne se normalise pas — une forme d'avant 2021, à laquelle
 * il manque le préfixe d'opérateur — on s'en tient aux huit chiffres. Il n'y a
 * alors aucune preuve du contraire, et refuser reviendrait à priver de ses
 * droits le client dont le numéro a été enregistré sous une vieille forme.
 */
export function memeNumero(a: unknown, b: unknown): boolean {
  const cleA = cleAppariement(a);
  const cleB = cleAppariement(b);
  if (!cleA || cleA !== cleB) return false;

  const natA = normaliserTelephone(a);
  const natB = normaliserTelephone(b);
  if (natA.ok && natB.ok) return natA.national === natB.national;

  return true;
}

/** Formatage lisible pendant la saisie : 01 02 03 04 05. */
export function formaterTelephone(saisie: string): string {
  const d = String(saisie ?? '').replace(/\D/g, '').slice(0, LONGUEUR_NATIONALE);
  return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
