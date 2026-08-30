/**
 * Combien coute REELLEMENT une video hebdomadaire ?
 *
 * La spec fixe un budget de 60 secondes et 1 Go par video. Tant que ce chiffre
 * n'existe pas, la resolution cible est une opinion — et si 1080x1920 ne tient
 * pas dans une fonction Vercel, toute la conception du rendu change. Mieux vaut
 * l'apprendre ici qu'un lundi matin, sur dix marchands a la fois.
 *
 * ON MESURE SUR UNE VRAIE PHOTO. Un aplat de couleur se compresse en presque
 * rien et donnerait un chiffre flatteur qui ne veut rien dire : le cout de
 * `sharp` comme celui de `ffmpeg` depend du detail de l'image. On prend donc
 * une photo du catalogue, exactement celle qui finira dans la video.
 *
 * Usage : node scripts/mesurer-rendu-video.mjs [url-de-photo]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const PHOTO_PAR_DEFAUT =
  'https://auth.djiguiflow.com/storage/v1/object/public/images/'
  + '11111111-1111-1111-1111-111111111111/produits/1787068649594.webp';

const RESOLUTIONS = [
  { nom: '1080x1920', largeur: 1080, hauteur: 1920 },
  { nom: '720x1280', largeur: 720, hauteur: 1280 },
];

const IMAGES_PAR_SECONDE = 24;
const SECONDES = 15;
const BUDGET_MS = 60_000;
const BUDGET_MO = 1024;

/** Amplitude du zoom, en fraction du cadre. Au-dela, le mouvement se voit trop. */
const AMPLEUR = 0.14;

const url = process.argv[2] || PHOTO_PAR_DEFAUT;

/**
 * La photo source, portee au double du format cible.
 *
 * Le mouvement consiste a recadrer DANS une image plus grande que la sortie :
 * sans cette marge, un zoom avant devrait agrandir des pixels et l'image
 * perdrait en nettete au fil du plan.
 */
async function chargerSource(largeur, hauteur) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const octets = Buffer.from(await r.arrayBuffer());
    console.log(`photo source : ${(octets.length / 1024).toFixed(0)} Ko — ${url}`);
    return sharp(octets).resize(largeur * 2, hauteur * 2, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  } catch (e) {
    // On ne se rabat PAS sur un aplat : il mentirait. Un bruit aleatoire est
    // plus couteux qu'une photo, donc la mesure reste conservatrice.
    console.log(`photo injoignable (${e.message}) — repli sur du bruit, mesure conservatrice`);
    const pixels = Buffer.allocUnsafe(largeur * 2 * hauteur * 2 * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
    return sharp(pixels, { raw: { width: largeur * 2, height: hauteur * 2, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();
  }
}

/** Le recadrage de l'image `i` sur `total` : un zoom avant lent. */
function cadrage(i, total, l, h) {
  const t = total <= 1 ? 0 : i / (total - 1);
  const f = 1 - t * AMPLEUR;
  const width = Math.round(l * f);
  const height = Math.round(h * f);
  return { width, height, left: Math.round((l - width) / 2), top: Math.round((h - height) / 2) };
}

let horsBudget = 0;

for (const r of RESOLUTIONS) {
  const dossier = await mkdtemp(join(tmpdir(), 'djigui-video-'));

  try {
    const source = await chargerSource(r.largeur, r.hauteur);
    const total = IMAGES_PAR_SECONDE * SECONDES;
    const depart = Date.now();
    let crete = 0;

    for (let i = 0; i < total; i++) {
      const image = await sharp(source)
        .extract(cadrage(i, total, r.largeur * 2, r.hauteur * 2))
        .resize(r.largeur, r.hauteur)
        .jpeg({ quality: 85 })
        .toBuffer();
      await writeFile(join(dossier, `img${String(i).padStart(4, '0')}.jpg`), image);
      crete = Math.max(crete, process.memoryUsage().rss);
    }

    const apresImages = Date.now();

    await new Promise((resoudre, rejeter) => {
      const p = spawn(ffmpeg, [
        '-y', '-framerate', String(IMAGES_PAR_SECONDE),
        '-i', join(dossier, 'img%04d.jpg'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '24',
        join(dossier, 'sortie.mp4'),
      ]);
      let erreur = '';
      p.stderr.on('data', (d) => { erreur = String(d).slice(-200); });
      p.on('error', rejeter);
      p.on('close', (code) => (code === 0 ? resoudre() : rejeter(new Error(`ffmpeg ${code} ${erreur}`))));
    });

    const fin = Date.now();
    const poids = (await stat(join(dossier, 'sortie.mp4'))).size;
    const memoireMo = Math.max(crete, process.memoryUsage().rss) / 1024 / 1024;
    const totalMs = fin - depart;
    const tient = totalMs <= BUDGET_MS && memoireMo <= BUDGET_MO;
    if (!tient) horsBudget++;

    console.log(
      `${r.nom.padEnd(10)}`
      + ` images ${String(apresImages - depart).padStart(6)} ms`
      + ` | encodage ${String(fin - apresImages).padStart(6)} ms`
      + ` | TOTAL ${String(totalMs).padStart(6)} ms`
      + ` | poids ${(poids / 1024 / 1024).toFixed(2).padStart(5)} Mo`
      + ` | rss ${memoireMo.toFixed(0).padStart(4)} Mo`
      + ` | ${tient ? 'DANS LE BUDGET' : 'HORS BUDGET'}`,
    );
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

console.log(`\nbudget : ${BUDGET_MS / 1000} s et ${BUDGET_MO} Mo par video.`);
console.log(
  horsBudget === 0
    ? 'Les deux resolutions tiennent : retenir 1080x1920.'
    : 'Retenir la resolution la plus haute marquee DANS LE BUDGET.',
);
