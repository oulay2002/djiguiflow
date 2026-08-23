import { adresseAppelante, plafondJournalierDepasse, rafaleDepassee } from '@/lib/limiteur';

export const dynamic = 'force-dynamic';

/**
 * Par quelle porte entre un visiteur — acheter, ou vendre.
 *
 * POURQUOI CETTE ROUTE EXISTE. La page d'accueil sert deux publics qui ne
 * veulent pas la meme chose : celui qui vient acheter, et le commercant qui
 * vient vendre. On ne sait pas lequel arrive vraiment, et on a decide de ne pas
 * le deviner : les deux portes sont offertes, et on COMPTE.
 *
 * Sans ce comptage, l'aiguillage ne serait qu'un ecran de plus. C'est la mesure
 * qui en fait une decision differee : dans quelques semaines, les chiffres
 * diront s'il faut basculer l'accueil vers le catalogue, le garder tourne vers
 * les marchands, ou laisser les deux portes.
 *
 * ELLE N'EMPECHE JAMAIS D'ENTRER. Le comptage rate, la base tombe, la rafale
 * est depassee : le visiteur passe quand meme. Un compteur qui bloquerait une
 * visite couterait infiniment plus cher que la statistique qu'il protege —
 * c'est l'inverse exact de la regle qui vaut pour la facturation.
 */

/** Assez haut pour ne jamais brider un vrai trafic ; le plafond n'est ici qu'une borne. */
const PLAFOND = 1_000_000;

/** Une meme adresse ne fait pas trente choix par minute : c'est un robot. */
const RAFALE = 10;
const FENETRE_MS = 60_000;

const PORTES = new Set(['acheter', 'vendre']);

export async function POST(req: Request) {
  let porte = '';
  try {
    const corps = await req.json();
    porte = String(corps?.porte ?? '').trim().toLowerCase();
  } catch {
    porte = '';
  }

  // Une porte inconnue n'est pas comptee : sans cela, n'importe qui pourrait
  // creer autant de compteurs qu'il veut en postant des noms au hasard.
  if (!PORTES.has(porte)) {
    return Response.json({ ok: false, raison: 'porte inconnue' }, { status: 400 });
  }

  // Le limiteur ne REFUSE rien ici, il evite seulement qu'une boucle gonfle le
  // chiffre au point de le rendre inutilisable.
  const appelant = adresseAppelante(req);
  const rafale = rafaleDepassee(`porte:${appelant}`, RAFALE, FENETRE_MS);
  if (rafale.depassee) {
    return Response.json({ ok: true, compte: false });
  }

  const { valeur, indisponible } = await plafondJournalierDepasse(`porte:${porte}`, PLAFOND);

  if (indisponible) {
    console.error(`Porte ${porte} — comptage impossible, le visiteur passe quand meme.`);
    return Response.json({ ok: true, compte: false });
  }

  return Response.json({ ok: true, compte: true, valeur });
}
