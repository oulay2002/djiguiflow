/**
 * PAR OÙ NOUS JOINDRE — une seule fois, pour tout le produit.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME ─────────────────────────────────────────
 *
 * Deux écrans invitent à nous écrire, et chacun composait son lien de son côté.
 *
 * `AssistantChat`, sur la page d'accueil publique, a un repli : sans
 * `NEXT_PUBLIC_SUPPORT_WHATSAPP`, il bascule sur un `mailto:`. Il y a donc
 * toujours une porte.
 *
 * `SansBoutique` — l'écran d'un marchand qui vient de créer son compte — n'en
 * avait aucun. Tout son bloc de contact était enveloppé dans
 * `{(whatsapp || telephone) && …}` : les deux variables absentes, le bloc
 * DISPARAÎT, et il ne reste que la phrase « Écrivez-nous le nom de votre
 * commerce […] et nous vous rappelons » — sans rien à cliquer.
 *
 * Or c'est le tout premier écran de la relation, et le seul dont l'issue
 * dépende entièrement de nous : le marchand n'a pas de boutique, il ne peut
 * RIEN faire d'autre que nous joindre.
 *
 * ⚠ Vérifié le 2 septembre 2026 : la variable EST posée en production, donc le
 * bouton s'affiche aujourd'hui. Ce n'est pas un défaut vivant, c'est une porte
 * qui ne tient que par une variable d'environnement — et une variable
 * `NEXT_PUBLIC_` est inlinée AU BUILD : elle se perd sans bruit sur un nouvel
 * environnement, une prévisualisation, une faute de frappe. Personne ne le
 * verrait, puisque rien n'échoue.
 *
 * ── UNE SEULE RÈGLE, UN SEUL ENDROIT ───────────────────────────────────────
 *
 * Deux exemplaires d'une même règle, c'est deux règles le jour où l'une change
 * — et c'est exactement ce qui s'était produit ici, l'un ayant gagné un repli
 * que l'autre n'a jamais eu.
 */

/** L'adresse qui répond quoi qu'il arrive. Elle ne dépend d'aucune variable. */
export const COURRIEL_SUPPORT = 'support@djiguiflow.com';

export type PorteSupport = {
  /** Toujours cliquable : `wa.me` quand le numéro existe, `mailto:` sinon. */
  href: string;
  /** Ce que le bouton dit — le canal réel, jamais une promesse générique. */
  libelle: string;
  /** Le lien d'appel, seulement si un numéro est configuré. */
  telephone: { href: string; affichage: string } | null;
};

export function porteSupport(params: {
  whatsapp?: string | null;
  telephone?: string | null;
  /** Le message pré-écrit, qui s'affiche chez la personne et non chez nous. */
  message: string;
  /** Objet du courriel de repli. */
  objet: string;
}): PorteSupport {
  const wa = String(params.whatsapp ?? '').replace(/[^\d]/g, '');
  const tel = String(params.telephone ?? '').trim();
  const telNumerique = tel.replace(/[^\d+]/g, '');

  return {
    href: wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(params.message)}`
      : `mailto:${COURRIEL_SUPPORT}?subject=${encodeURIComponent(params.objet)}`,
    // LE LIBELLE DIT LE CANAL REEL. Annoncer « Nous écrire sur WhatsApp »
    // au-dessus d'un `mailto:` ferait chercher une conversation qui n'existe
    // pas — et le marchand conclurait que le bouton est cassé.
    libelle: wa ? 'Nous écrire sur WhatsApp' : 'Nous écrire par e-mail',
    telephone: telNumerique ? { href: `tel:${telNumerique}`, affichage: tel } : null,
  };
}
