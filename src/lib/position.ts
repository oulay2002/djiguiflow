/**
 * Reconnaitre un point de livraison dans ce que le client envoie.
 *
 * POURQUOI PAS SEULEMENT L'EPINGLE NATIVE. Telegram livre proprement un
 * `message.location`. Cote WhatsApp, une position partagee le 17 aout 2026
 * n'a **jamais atteint le webhook** : aucune execution n8n, pas meme une
 * rejetee. Que ce soit un evenement non souscrit chez wasender ou une
 * limitation de leur passerelle, la lecon est la meme — une fonction dont
 * dependent les livraisons ne doit pas reposer sur ce qu'un tiers veut bien
 * transmettre.
 *
 * Un lien Google Maps colle dans la conversation, lui, arrive toujours : c'est
 * du texte. C'est donc le chemin robuste, et il fonctionne sur les deux canaux.
 */

export type Coordonnees = { latitude: number; longitude: number };

/**
 * Seuls ces hotes sont interrogeables pour deplier un lien court.
 *
 * La liste n'est pas une precaution de style : l'URL vient d'un message
 * WhatsApp, donc d'un inconnu. Sans liste blanche, on offrirait a n'importe qui
 * le droit de faire emettre a notre serveur une requete vers l'adresse de son
 * choix — y compris des adresses internes que lui ne peut pas joindre.
 */
const HOTES_COURTS = new Set(['maps.app.goo.gl', 'goo.gl']);

const MAX_REDIRECTIONS = 3;
const DELAI_MS = 4000;

/** Un point plausible : dans les bornes, et pas le (0, 0) au large du golfe de Guinee. */
export function pointValide(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0)
  );
}

/**
 * Coordonnees contenues dans un texte, sans aucun appel reseau.
 *
 * Couvre les formes que produisent reellement Google Maps et le partage
 * WhatsApp. L'ordre compte : `!3d…!4d…` porte le point exact d'un lieu, tandis
 * que `@…` porte le centre de la carte, qui peut en etre eloigne — on prefere
 * donc le premier quand les deux sont presents.
 */
export function coordonneesDansTexte(texte: unknown): Coordonnees | null {
  const t = String(texte ?? '');
  if (!t) return null;

  const N = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const MOTIFS = [
    // .../place/...!3d5.35!4d-4.00 — le point exact du lieu
    new RegExp(`!3d${N}!4d${N}`),
    // ?q=5.35,-4.00 / ?query=5.35,-4.00 / ?ll=5.35,-4.00
    new RegExp(`[?&](?:q|query|ll|daddr|destination)=${N}%2C\\s*${N}`, 'i'),
    new RegExp(`[?&](?:q|query|ll|daddr|destination)=${N},\\s*${N}`, 'i'),
    // /maps/search/5.35,-4.00
    new RegExp(`/maps/search/${N}%2C\\s*${N}`),
    new RegExp(`/maps/search/${N},\\s*${N}`),
    // /maps/@5.35,-4.00,17z — le centre de la carte, en dernier recours
    new RegExp(`/maps/@${N},${N}`),
  ];

  for (const motif of MOTIFS) {
    const m = t.match(motif);
    if (!m) continue;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (pointValide(latitude, longitude)) return { latitude, longitude };
  }

  return null;
}

/** Premier lien court Google Maps trouve dans le texte. */
export function lienCourtDansTexte(texte: unknown): string | null {
  const m = String(texte ?? '').match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl)\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

/**
 * Deplie un lien court en suivant ses redirections A LA MAIN.
 *
 * `redirect: 'follow'` irait n'importe ou : c'est precisement ce qu'il ne faut
 * pas laisser decider a un inconnu. On lit l'en-tete `Location`, on verifie
 * l'hote a chaque saut, et on s'arrete court.
 */
export async function deplierLienCourt(lien: string): Promise<string | null> {
  let courant = lien;

  for (let saut = 0; saut < MAX_REDIRECTIONS; saut++) {
    let hote: string;
    try {
      const u = new URL(courant);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      hote = u.hostname.toLowerCase();
    } catch {
      return null;
    }

    // Arrive sur un vrai lien Maps : on a ce qu'on cherchait.
    if (!HOTES_COURTS.has(hote)) {
      return /(?:^|\.)google\.[a-z.]+$/.test(hote) ? courant : null;
    }

    let reponse: Response;
    try {
      reponse = await fetch(courant, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(DELAI_MS),
        headers: { 'User-Agent': 'DjiguiFlow/1.0' },
      });
    } catch (e) {
      console.error('Position — lien court injoignable :', e instanceof Error ? e.message : e);
      return null;
    }

    const suivant = reponse.headers.get('location');
    if (!suivant) return null;

    try {
      courant = new URL(suivant, courant).toString();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Le point de livraison contenu dans un message, lien court compris.
 *
 * Rend `null` sans bruit quand le message ne parle pas de position : c'est le
 * cas de l'immense majorite des messages, et ce n'est pas une anomalie.
 */
export async function positionDansMessage(texte: unknown): Promise<Coordonnees | null> {
  const direct = coordonneesDansTexte(texte);
  if (direct) return direct;

  const court = lienCourtDansTexte(texte);
  if (!court) return null;

  const deplie = await deplierLienCourt(court);
  return deplie ? coordonneesDansTexte(deplie) : null;
}
