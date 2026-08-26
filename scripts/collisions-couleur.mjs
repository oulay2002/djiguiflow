/**
 * Cherche les etats devenus INDISCERNABLES apres la traduction de palette.
 *
 * Le nuancier par defaut offrait dix familles, la maison en compte six : deux
 * etats jusque-la distincts peuvent donc avoir atterri sur la meme couleur.
 * C'est arrive pour « en preparation » et « en livraison ».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GARDE A ETE RESSERRE, le 26 aout 2026.
 *
 * Sa premiere version signalait TOUTE classe de fond repetee a moins de douze
 * lignes d'ecart. Elle rendait vingt signalements — et les vingt etaient des
 * faux positifs :
 *
 *   - deux boutons d'action mutuellement exclusifs, « Accepter » et
 *     « En route », qui ne s'affichent jamais ensemble ;
 *   - les deux bulles d'une conversation, client et assistante, dont la
 *     distinction est justement ce que le code met en place ;
 *   - un bouton de suggestion et le cadre du formulaire en dessous ;
 *   - et « proche » / « critique » du compteur de quota, qui partagent la
 *     mangue A DESSEIN : la mangue dit « a surveiller », le bissap dit
 *     « urgence ». Les nettoyer aurait CASSE une intention.
 *
 * Un garde qui rend vingt faux positifs n'est pas lu. Il apprend a ignorer sa
 * propre sortie, et le jour ou il trouve la vraie collision, personne ne
 * regarde. C'est le meme defaut que l'alerte de paiement qui se repetait
 * toutes les quinze minutes — le bruit ne coute pas du bruit, il coute
 * l'aveuglement.
 *
 * DEUX CONDITIONS DESORMAIS, ET IL FAUT LES DEUX :
 *
 * 1. LA SIGNATURE COMPLETE EST IDENTIQUE. Deux etats ne sont indiscernables
 *    que si TOUTES leurs couleurs coincident. « proche » et « critique »
 *    partagent leur fond mais different par la barre et la bordure : ils
 *    restent distinguables, donc ils ne sont pas signales.
 *
 * 2. LES DEUX LIGNES SONT DES ENTREES DE CONFIGURATION. La collision qu'on
 *    chasse vit dans une table qui associe un ETAT a un style —
 *    `preparation: '…'`, `livraison: '…'`. Deux elements de mise en page qui
 *    partagent un fond ne decrivent aucun etat : ils se ressemblent parce
 *    qu'ils appartiennent au meme ecran.
 *
 * Ce qu'on perd : une collision ecrite directement en JSX plutot qu'en table.
 * Ce qu'on gagne : une sortie qu'on lit encore.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FAMILLES = 'nuit|chaux|bissap|accent|mangue|primary';

/** Toutes les couleurs posees sur une ligne, ordonnees — sa signature visuelle. */
function signature(ligne) {
  const motif = new RegExp(`(?:bg|text|border|ring|from|via|to)-(?:${FAMILLES})-\\d{2,3}`, 'g');
  const trouvees = ligne.match(motif) ?? [];
  return trouvees.length ? [...new Set(trouvees)].sort().join(' ') : '';
}

/**
 * Cette ligne associe-t-elle un NOM a un style ?
 *
 * `preparation: {`, `'en route': '…'`, `critique: { barre: …`. On exclut les
 * attributs JSX (`className=`), qui decrivent un element, pas un etat.
 */
function estEntreeDeTable(ligne) {
  if (/className\s*=/.test(ligne)) return false;
  return /^\s*['"]?[A-Za-z_][\w' -]*['"]?\s*:\s*[[{'"`]/.test(ligne);
}

const fichiers = [];
(function marcher(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) marcher(chemin);
    else if (nom.endsWith('.tsx') || nom.endsWith('.ts')) fichiers.push(chemin);
  }
})('src');

let trouvees = 0;

for (const fichier of fichiers) {
  const lignes = readFileSync(fichier, 'utf8').split('\n');
  const vues = new Map();

  lignes.forEach((ligne, i) => {
    if (!estEntreeDeTable(ligne)) return;

    const sig = signature(ligne);
    if (!sig) return;

    const precedente = vues.get(sig);
    if (precedente !== undefined && i - precedente <= 12) {
      trouvees += 1;
      const propre = fichier.split('\\').join('/');
      console.log(`${propre}  lignes ${precedente + 1} et ${i + 1}`);
      console.log(`    meme signature complete : ${sig}`);
    }
    vues.set(sig, i);
  });
}

console.log();
console.log(
  trouvees === 0
    ? 'Aucun etat indiscernable : toute table associant un nom a un style'
      + ' distingue ses entrees par au moins une couleur.'
    : `${trouvees} etat(s) indiscernable(s) — deux entrees d'une meme table`
      + ' portent exactement les memes couleurs.',
);

process.exit(trouvees === 0 ? 0 : 1);
