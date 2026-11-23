import type { ModeCommande } from '@/lib/retrait';

/**
 * Le recu d'une commande : ce qui reste a l'ecran une fois qu'elle est partie.
 *
 * ── CE QU'IL REMPLACE ──────────────────────────────────────────────────────
 *
 * Un bandeau de petit texte, en haut du menu, ou « Repondez au message
 * WhatsApp » etait une incise en gras au milieu d'une phrase. Or la commande
 * n'est PAS lancee tant que le client n'a pas repondu : l'etape qui decide de
 * tout tenait dans une incise, et il refermait l'onglet en croyant avoir fini.
 * Releve deux fois par la critique de la vitrine, le 23 novembre 2026.
 *
 * ── IL EST FIGE AU MOMENT DE L'ENVOI ───────────────────────────────────────
 *
 * Le panier se vide, le formulaire redevient modifiable, le marchand peut
 * changer un prix dans la minute. Le recu, lui, dit ce qui A ETE commande :
 * il ne relit ni le panier, ni le catalogue, ni le selecteur de mode. Relire
 * en direct ferait changer le recu d'une commande deja partie.
 *
 * ── IL SURVIT A L'ALLER-RETOUR VERS WHATSAPP ───────────────────────────────
 *
 * Le recu envoie le client sur WhatsApp confirmer. Sur son telephone, c'est
 * exactement le geste qui fait decharger l'onglet : il revenait sur une page
 * neuve, sans sa reference ni son lien de suivi. Le recu est donc garde le
 * temps de l'onglet, comme le brouillon — voir `./brouillon.ts` pour le choix
 * de `sessionStorage`.
 *
 * ── CE QU'IL NE PORTE PAS ──────────────────────────────────────────────────
 *
 * Ni le nom, ni le numero, ni l'adresse du client. Ils ne servent plus a rien
 * une fois la commande partie, et rien de personnel ne doit rester dans un
 * navigateur plus longtemps que necessaire. L'adresse qu'il porte est celle
 * du COMMERCE, en retrait — une information publique.
 */

export type LigneRecu = {
  quantite: number;
  nom: string;
  variante: string;
  montant: number;
};

export type Recu = {
  reference: string;
  /** Le jeton du lien de suivi. Vide = le lien demandera les quatre chiffres. */
  jeton: string;
  lignes: LigneRecu[];
  total: number;
  mode: ModeCommande;
  /** « HH:MM », ou vide pour « des que pret ». */
  heure: string;
  /** Ou venir chercher, en retrait. Vide = le commerce ne l'a pas dit. */
  adresseRetrait: string;
  /** Les moyens de paiement que le commerce annonce. Vide = rien d'annonce. */
  paiements: string[];
  /** La phrase des frais, telle qu'elle etait affichee sous le total. */
  frais: string;
  /**
   * Le numero WhatsApp du COMMERCE, pour le recours « rien recu ? ». Public :
   * c'est celui que la boutique affiche deja. Vide = pas de recours a offrir.
   */
  telephoneBoutique: string;
  /**
   * Le numero auquel le message va arriver, tel que le client l'a saisi.
   *
   * EN MEMOIRE SEULEMENT — `ecrireRecu` ne l'ecrit jamais. Il sert une fois,
   * a l'instant ou le recu s'affiche : c'est la que le client peut voir qu'il
   * s'est trompe d'un chiffre, avant d'attendre un message qui n'arrivera
   * pas. Apres un rechargement il a disparu, et la phrase redevient generale :
   * rien de personnel ne reste dans le navigateur.
   */
  numero?: string;
};

const VERSION = 1;
const LIGNES_MAX = 50;

export function clefRecu(slug: string): string {
  return `djiguiflow:recu:${slug}`;
}

export function ecrireRecu(r: Recu): string {
  // Le numero du client est retire ICI, par construction : aucun appelant ne
  // peut l'ecrire par megarde, puisque c'est la seule porte vers le stockage.
  const aGarder: Recu = { ...r };
  delete aGarder.numero;
  return JSON.stringify({ v: VERSION, ...aGarder });
}

const texte = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v.slice(0, max) : '');

const montant = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * Relit un recu. Rend `null` au moindre doute sur sa forme.
 *
 * UN RECU FAUX EST PIRE QU'UN RECU ABSENT. Ce stockage est modifiable depuis
 * la console du navigateur ; un recu a moitie lisible afficherait un total ou
 * une reference inventes, sous un tampon « REÇUE ». On exige donc tout ce qui
 * fait un recu — une reference, au moins une ligne, un total — ou rien.
 */
export function lireRecu(brut: string | null | undefined): Recu | null {
  if (!brut) return null;

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return null;
  const o = lu as Record<string, unknown>;
  if (o.v !== VERSION) return null;

  const reference = texte(o.reference, 64).trim();
  const total = montant(o.total);
  if (!reference || total === null) return null;
  if (o.mode !== 'livraison' && o.mode !== 'retrait') return null;
  if (!Array.isArray(o.lignes) || o.lignes.length === 0 || o.lignes.length > LIGNES_MAX) return null;

  const lignes: LigneRecu[] = [];
  for (const brute of o.lignes) {
    if (!brute || typeof brute !== 'object') return null;
    const l = brute as Record<string, unknown>;
    const nom = texte(l.nom, 120).trim();
    const m = montant(l.montant);
    if (!nom || m === null) return null;
    if (typeof l.quantite !== 'number' || !Number.isInteger(l.quantite) || l.quantite < 1) return null;
    lignes.push({ quantite: l.quantite, nom, variante: texte(l.variante, 60), montant: m });
  }

  const heure = texte(o.heure, 5);

  return {
    reference,
    jeton: texte(o.jeton, 256),
    lignes,
    total,
    mode: o.mode,
    heure: /^\d{2}:\d{2}$/.test(heure) ? heure : '',
    adresseRetrait: texte(o.adresseRetrait, 200).trim(),
    paiements: Array.isArray(o.paiements)
      ? o.paiements.filter((p): p is string => typeof p === 'string').map((p) => p.slice(0, 60)).slice(0, 8)
      : [],
    frais: texte(o.frais, 240),
    // Absent d'un recu ecrit avant ce champ : il se lit vide, et le recours
    // ne s'affiche pas — le recu, lui, reste valable.
    telephoneBoutique: texte(o.telephoneBoutique, 20).replace(/\D/g, ''),
  };
}

/**
 * Ce qu'il reste a faire, dans l'ordre. C'est le coeur du recu.
 *
 * La premiere etape est TOUJOURS la confirmation sur WhatsApp : c'est elle qui
 * lance la preparation. La suite depend du mode — attendre chez soi, ou se
 * deplacer — et c'est precisement ce que le client doit savoir avant de fermer
 * l'onglet.
 *
 * Phrases entieres, pas de gabarit a trous : l'heure et l'adresse ne sont
 * mentionnees que lorsqu'elles existent.
 */
export function etapesDuRecu(
  r: Pick<Recu, 'mode' | 'heure' | 'adresseRetrait'> & { numero?: string },
): string[] {
  // Le numero se dit quand on le connait : c'est lui qui permet au client de
  // reperer une erreur de saisie avant d'attendre pour rien.
  const ou = r.numero?.trim() ? ` au ${r.numero.trim()}` : '';
  const etapes = [
    `Répondez au message WhatsApp qui va vous être envoyé${ou}. La préparation ne commence qu’après votre réponse.`,
  ];

  if (r.mode === 'retrait') {
    etapes.push('Le commerçant vous prévient dès que votre commande est prête.');
    const quand = r.heure ? ` vers ${r.heure}` : '';
    etapes.push(
      r.adresseRetrait
        ? `Vous venez la chercher${quand} : ${r.adresseRetrait}.`
        : `Vous venez la chercher sur place${quand}.`,
    );
  } else {
    etapes.push('Le livreur vous l’apporte.');
  }

  return etapes;
}

/**
 * Le lien pour ecrire a la boutique quand le message n'arrive pas, ou vide.
 *
 * LE RECOURS QUI MANQUAIT. Le recu demande de repondre a un message. Si le
 * numero saisi etait faux, ou sans WhatsApp, ce message n'arrive jamais : le
 * client attendait devant un tampon « REÇUE », et le commerce perdait la vente
 * sans le savoir. Ce lien ouvre la conversation avec la boutique, depuis le
 * VRAI WhatsApp du client, avec la reference deja ecrite.
 *
 * CE N'EST PAS UNE CONFIRMATION. Il ne remplace pas la reponse au message :
 * confirmer depuis cette page reviendrait a valider une commande sans avoir
 * jamais verifie que le numero donne existe — exactement ce que la
 * confirmation par WhatsApp sert a empecher.
 *
 * Vide quand le commerce n'a pas de numero lisible : mieux vaut ne rien
 * proposer qu'ouvrir WhatsApp sur un numero invalide.
 */
export function lienVersLaBoutique(telephoneBoutique: string, reference: string): string {
  const chiffres = String(telephoneBoutique ?? '').replace(/\D/g, '');
  if (chiffres.length < 10) return '';
  const numero = chiffres.startsWith('225') ? chiffres : `225${chiffres}`;
  const message = `Bonjour, je n’ai pas reçu le message de confirmation de ma commande ${reference}.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}

/**
 * La phrase du recours : que faire si le message n'arrive pas. Vide quand il
 * n'y a rien d'honnete a proposer.
 *
 * Elle suit ce que le recu SAIT. Avec le numero sous les yeux, la premiere
 * chose a faire est de le relire — c'est la cause la plus frequente. Avec un
 * moyen de joindre le commerce, on le propose. Sans l'un ni l'autre, on se
 * tait : « contactez la boutique » sans dire comment renvoie le client a une
 * recherche qu'il ne fera pas.
 */
export function recoursDuRecu(r: Pick<Recu, 'numero' | 'telephoneBoutique' | 'reference'>): string {
  const aLeNumero = Boolean(r.numero?.trim());
  const joignable = lienVersLaBoutique(r.telephoneBoutique, r.reference) !== '';

  if (aLeNumero && joignable) {
    return 'Rien reçu ? Vérifiez que ce numéro est le bon. Sinon, écrivez à la boutique : '
      + 'elle retrouvera votre commande avec la référence.';
  }
  if (aLeNumero) {
    return 'Rien reçu ? Vérifiez que ce numéro est le bon. S’il est faux, repassez votre commande.';
  }
  if (joignable) {
    return 'Rien reçu ? Écrivez à la boutique : elle retrouvera votre commande avec la référence.';
  }
  return '';
}
