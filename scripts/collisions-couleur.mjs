/**
 * Cherche les etats devenus indiscernables apres la traduction de palette.
 *
 * Le nuancier par defaut offrait dix familles, la maison en compte cinq : deux
 * etats jusque-la distincts peuvent donc avoir atterri sur la meme couleur.
 * C'est arrive pour « en preparation » et « en livraison ». On signale toute
 * classe de fond qui se repete a moins de douze lignes d'ecart — la distance
 * typique entre deux entrees d'un bloc de configuration d'etats.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fichiers = [];
(function marcher(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) marcher(chemin);
    else if (nom.endsWith('.tsx')) fichiers.push(chemin);
  }
})('src');

let trouvees = 0;
for (const fichier of fichiers) {
  const lignes = readFileSync(fichier, 'utf8').split('\n');
  const vues = new Map();
  lignes.forEach((ligne, i) => {
    for (const classe of ligne.match(/bg-(?:nuit|chaux|bissap|accent|mangue)-\d{2,3}/g) ?? []) {
      const precedente = vues.get(classe);
      if (precedente !== undefined && i - precedente <= 12) {
        trouvees += 1;
        const propre = fichier.split('\\').join('/');
        console.log(`${propre}  ${classe}  lignes ${precedente + 1} et ${i + 1}`);
      }
      vues.set(classe, i);
    }
  });
}

console.log(trouvees === 0 ? 'aucune repetition rapprochee' : `${trouvees} repetitions a examiner`);
