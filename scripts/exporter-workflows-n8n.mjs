/**
 * Exporte les workflows n8n dans le depot, pour qu'ils aient une histoire.
 *
 *   node scripts/exporter-workflows-n8n.mjs
 *
 * POURQUOI, PUISQUE N8N VERSIONNE DEJA. n8n garde un historique interne
 * (`versionId`, `activeVersionId`, restauration) : le retour arriere existe
 * sans nous. Ce que n8n ne fait pas, c'est survivre a la perte du VPS, rendre
 * un changement d'automatisation RELISIBLE a cote du code applicatif dont il
 * depend, et dire qui a change quoi et pourquoi. Le 21 aout, un noeud a ete
 * ajoute au chemin des commandes reelles et la seule trace etait un fichier de
 * sauvegarde dans un dossier personnel.
 *
 * IL EST A SENS UNIQUE, ET C'EST DELIBERE. Il lit n8n et ecrit le depot,
 * jamais l'inverse. Reimporter le depot vers une instance vivante est une
 * bonne facon de casser la production un dimanche : le retour arriere se fait
 * dans n8n, qui sait le faire proprement.
 *
 * CE QU'IL NORMALISE, ET POURQUOI C'EST LE COEUR DU SUJET. Sans normalisation,
 * chaque export produirait un diff meme sans changement reel — `updatedAt`
 * bouge a chaque sauvegarde, `versionId` a chaque publication, `staticData`
 * porte de la memoire d'execution qui change toute seule. Un diff qui ment a
 * chaque fois n'est plus lu, et l'export perd sa seule raison d'etre. On
 * retire donc le volatil et on trie les cles, pour qu'un diff non vide
 * signifie exactement : quelqu'un a change quelque chose.
 *
 * LE PIEGE QU'IL NE PEUT PAS RESOUDRE SEUL. Lance a la main, il pourrit : le
 * depot ment des la premiere modification faite dans l'interface. C'est
 * .github/workflows/exporter-n8n.yml qui lui donne sa valeur, en l'executant
 * tous les jours et en ouvrant une PR quand quelque chose a bouge.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.N8N_API_URL || 'https://n8n.djiguiflow.com').replace(/\/$/, '');
const CLE = process.env.N8N_API_KEY || process.env.N8N_VPS_KEY;
const DOSSIER = 'n8n';

if (!CLE) {
  console.error('N8N_API_KEY manquante (ou N8N_VPS_KEY en local).');
  process.exit(1);
}

/**
 * Ce qui change tout seul et ne doit donc jamais atteindre un diff.
 *
 * `staticData` en particulier : c'est la memoire d'execution des workflows —
 * les garde-fous anti-doublon y rangent leur etat, qui bouge a chaque passage.
 */
const VOLATILE = new Set([
  'createdAt',
  'updatedAt',
  'versionId',
  'activeVersionId',
  'triggerCount',
  'staticData',
  'pinData',
  'shared',
  'meta',
  'homeProject',
  'sharedWithProjects',
]);

/** Trie les cles a tous les niveaux : un objet reordonne n'est pas un changement. */
function stable(valeur) {
  if (Array.isArray(valeur)) return valeur.map(stable);
  if (valeur && typeof valeur === 'object') {
    const sortie = {};
    for (const cle of Object.keys(valeur).sort()) {
      if (VOLATILE.has(cle)) continue;
      sortie[cle] = stable(valeur[cle]);
    }
    return sortie;
  }
  return valeur;
}

/** Un nom de fichier lisible, stable, et sur sous tous les systemes. */
const enNomDeFichier = (nom) =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 70);

async function api(chemin) {
  const r = await fetch(`${BASE}/api/v1${chemin}`, { headers: { 'X-N8N-API-KEY': CLE } });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin} -> ${r.status} ${texte.slice(0, 200)}`);
  return JSON.parse(texte);
}

const tous = [];
let curseur = null;
do {
  const page = await api(`/workflows?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
  tous.push(...page.data);
  curseur = page.nextCursor;
} while (curseur);

fs.mkdirSync(DOSSIER, { recursive: true });

/**
 * L'inventaire porte TOUS les workflows, pas seulement les exportes.
 *
 * L'instance en heberge plus de cent, dont une bibliotheque de modeles
 * communautaires importes qui n'ont rien a faire dans le depot. Mais si l'on
 * n'exportait que les actifs sans rien dire des autres, desactiver un workflow
 * le ferait disparaitre du depot sans qu'on sache s'il a ete supprime ou
 * simplement eteint. L'inventaire repond a cette question.
 */
const inventaire = tous
  .map((w) => ({ id: w.id, nom: w.name, actif: Boolean(w.active) }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

fs.writeFileSync(
  path.join(DOSSIER, '_inventaire.json'),
  JSON.stringify(inventaire, null, 2) + '\n',
  'utf8',
);

// Seuls les actifs sont exportes en entier : ce sont eux qui tournent, et donc
// eux dont un changement merite d'etre relu.
const actifs = tous.filter((w) => w.active);
const attendus = new Set(['_inventaire.json']);

for (const resume of actifs) {
  const w = await api(`/workflows/${resume.id}`);
  const fichier = `${enNomDeFichier(w.name)}.json`;
  attendus.add(fichier);
  fs.writeFileSync(
    path.join(DOSSIER, fichier),
    JSON.stringify(stable(w), null, 2) + '\n',
    'utf8',
  );
}

// Un workflow desactive ou supprime doit disparaitre du depot, sinon celui-ci
// decrit une instance qui n'existe plus. L'inventaire garde la trace du nom.
let retires = 0;
for (const present of fs.readdirSync(DOSSIER)) {
  if (present.endsWith('.json') && !attendus.has(present)) {
    fs.unlinkSync(path.join(DOSSIER, present));
    retires++;
  }
}

console.log(`inventaire : ${inventaire.length} workflows`);
console.log(`exportes   : ${actifs.length} actifs`);
if (retires) console.log(`retires    : ${retires} fichier(s) devenus obsoletes`);
