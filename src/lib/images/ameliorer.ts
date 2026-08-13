import sharp from 'sharp';

/**
 * Remise en etat d'une photo produit prise au telephone.
 *
 * Le marchand photographie son plat sur un coin de table, en interieur, sans
 * lumiere. La photo brute part telle quelle sur la vitrine : trois a huit
 * megaoctets, de travers, sous-exposee, dans un format quelconque. Deux couts,
 * et le second est le pire — une vitrine de cinq megaoctets par photo ne se
 * charge jamais sur les donnees mobiles d'Abidjan, donc personne ne la voit.
 *
 * CE N'EST PAS DE L'INTELLIGENCE ARTIFICIELLE, et il faut le dire : c'est du
 * traitement d'image deterministe. Aucun modele n'intervient, rien n'est
 * invente, le resultat est le meme a chaque passage. La grille tarifaire
 * annonce « photos ameliorees IA » ; ce qui suit ameliore reellement les
 * photos, mais le mot « IA » y serait usurpe tant qu'aucun detourage par
 * modele n'est branche.
 */

/** Cote de l'image finale. Carre : la vitrine aligne des tuiles. */
const COTE = 1080;

export type PhotoAmelioree = {
  donnees: Buffer;
  largeur: number;
  hauteur: number;
  octets: number;
  octetsAvant: number;
};

export async function ameliorerPhoto(entree: Buffer): Promise<PhotoAmelioree> {
  const metadonnees = await sharp(entree).metadata();

  // Le carre ne depasse jamais le petit cote de la source. `withoutEnlargement`
  // ne suffisait pas : sur une photo 1280x720 il rendait 1080x720, donc pas
  // carre du tout, et agrandir a 1080 inventait des pixels tout en alourdissant
  // le fichier — 171 Ko a l'entree, 226 Ko a la sortie, mesure sur les photos
  // reelles de la plateforme. Une source 720p donne desormais un carre de 720.
  const cote = Math.min(
    COTE,
    Math.min(metadonnees.width ?? COTE, metadonnees.height ?? COTE),
  );

  const traitee = await sharp(entree)
    // `rotate()` sans argument applique l'orientation EXIF. Sans lui, une
    // photo prise en tenant le telephone de travers s'affiche couchee — le
    // cas le plus frequent, et le plus visible.
    .rotate()
    .resize(cote, cote, {
      fit: 'cover',
      // `attention` recadre vers la zone la plus chargee de l'image plutot
      // que vers son centre geometrique. Sur une photo de plat pose de biais,
      // c'est la difference entre garder l'assiette et garder la nappe.
      position: sharp.strategy.attention,
    })
    // Etale l'histogramme : rattrape les interieurs sombres, qui sont la
    // regle quand on photographie dans une boutique sans vitrine.
    .normalise()
    // Legere reprise de saturation. Discrete a dessein : au-dela, un plat
    // devient fluorescent et le client se sent trompe en le recevant.
    .modulate({ saturation: 1.06 })
    // PAS de `sharpen`. Mesure faite sur une photo telephone : 151 Ko avec,
    // 120 Ko sans, soit vingt-six pour cent de poids en plus pour accentuer
    // surtout les artefacts de compression d'un JPEG deja compresse. Les deux
    // etapes precedentes, elles, ne coutent que six pour cent et corrigent un
    // vrai defaut.
    // WebP : deux a trois fois plus leger que le JPEG a qualite egale, et
    // compris par tous les navigateurs qu'on rencontre ici.
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    donnees: traitee.data,
    largeur: traitee.info.width,
    hauteur: traitee.info.height,
    octets: traitee.data.length,
    octetsAvant: entree.length,
  };
}
