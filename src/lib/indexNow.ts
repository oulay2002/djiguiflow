import { rafaleDepassee } from '@/lib/limiteur';
import { SITE_URL } from '@/lib/site';

/**
 * IndexNow — prevenir les moteurs qu'une page vient de changer.
 *
 * ── A QUOI IL SERT ─────────────────────────────────────────────────────────
 *
 * Un moteur decouvre un changement a son prochain passage — dans quelques
 * heures, ou quelques jours. IndexNow inverse le sens : c'est le site qui
 * previent. Bing le lit, et avec lui les assistants qui cherchent par Bing ;
 * Google ne le lit pas, et s'en remet au plan du site.
 *
 * Pour un marchand, la difference est concrete : il ajoute un plat a midi, et
 * ce plat peut etre trouve le jour meme.
 *
 * ── LA CLE N'EST PAS UN SECRET ─────────────────────────────────────────────
 *
 * Le protocole demande de PUBLIER la cle a une adresse du site : c'est ce qui
 * prouve que l'appel vient bien de son proprietaire. Elle est donc en clair
 * ici, et dans `public/<cle>.txt`. Un test tient les deux accordes — si le
 * fichier disparait ou change, les moteurs refusent tous les appels, en
 * silence.
 *
 * ── CE QUI NE DOIT JAMAIS ARRIVER ──────────────────────────────────────────
 *
 *  - LEVER. C'est une politesse faite aux moteurs, pas une etape de
 *    l'enregistrement : un article est sauvegarde meme si le moteur est sourd.
 *  - PARTIR D'AILLEURS QUE LA PRODUCTION. Un apercu ou un poste de
 *    developpement annoncerait des pages qui n'existent pas sur le vrai site.
 *  - MARTELER. Un marchand qui saisit vingt plats d'affilee ne declenche pas
 *    vingt appels : un par page et par dix minutes suffit, le moteur relit
 *    la page entiere de toute facon.
 */

export const CLE_INDEXNOW = 'eda29d3541a86e444099cc2ddfdf8edf';

const POINT_D_ENTREE = 'https://api.indexnow.org/indexnow';
const FENETRE_MS = 10 * 60_000;
const DELAI_MS = 4_000;

/** L'appel ne part que du vrai site. */
function enProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/**
 * Annonce des adresses aux moteurs. Ne leve jamais, ne rend rien d'utile a
 * l'appelant : le resultat est journalise, et c'est tout ce qu'il vaut.
 */
export async function prevenirMoteurs(chemins: string[]): Promise<'envoye' | 'ignore' | 'echec'> {
  try {
    if (!enProduction()) return 'ignore';

    const hote = new URL(SITE_URL).host;
    const adresses = [...new Set(chemins)]
      .map((c) => (c.startsWith('http') ? c : `${SITE_URL}${c.startsWith('/') ? c : `/${c}`}`))
      // Rien que nos propres pages : le protocole refuse le reste, et on ne
      // veut pas servir a annoncer le site d'un autre.
      .filter((u) => {
        try {
          return new URL(u).host === hote;
        } catch {
          return false;
        }
      })
      .filter((u) => !rafaleDepassee(`indexnow:${u}`, 1, FENETRE_MS).depassee);

    if (!adresses.length) return 'ignore';

    const reponse = await fetch(POINT_D_ENTREE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: hote,
        key: CLE_INDEXNOW,
        keyLocation: `${SITE_URL}/${CLE_INDEXNOW}.txt`,
        urlList: adresses,
      }),
      signal: AbortSignal.timeout(DELAI_MS),
    });

    // 200 et 202 sont deux facons de dire oui. Le reste se journalise : un 403
    // veut dire que le fichier de cle n'est plus lisible.
    if (reponse.status === 200 || reponse.status === 202) return 'envoye';
    console.error(`IndexNow — refus ${reponse.status} pour ${adresses.join(', ')}`);
    return 'echec';
  } catch (e) {
    console.error('IndexNow — appel impossible :', e instanceof Error ? e.message : e);
    return 'echec';
  }
}
