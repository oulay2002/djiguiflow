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

/** Formatage lisible pendant la saisie : 01 02 03 04 05. */
export function formaterTelephone(saisie: string): string {
  const d = String(saisie ?? '').replace(/\D/g, '').slice(0, LONGUEUR_NATIONALE);
  return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
