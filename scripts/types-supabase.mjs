/**
 * Regenere src/lib/database.types.ts depuis le schema Supabase.
 *
 * Le script tenait autrefois en une ligne dans package.json :
 *
 *   supabase gen types typescript --project-id XXX > src/lib/database.types.ts
 *
 * La redirection `>` vide le fichier AVANT de lancer la commande. Le 12 aout
 * 2026, le CLI Supabase n'etait pas installe : il a echoue sans rien ecrire, et
 * les 772 lignes de types sont parties avec. Rien ne l'a signale — la commande
 * rendait 0, et l'erreur n'est apparue qu'au typecheck suivant, sous la forme
 * d'une centaine de « Cannot find name » sans rapport apparent.
 *
 * On ecrit donc le fichier seulement apres avoir verifie que la sortie
 * ressemble vraiment a des types. En cas d'echec, l'ancien fichier reste en
 * place : des types perimes se rattrapent, des types absents bloquent tout.
 *
 * Usage : node scripts/types-supabase.mjs [id-du-projet]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PROJET = process.argv[2] || process.env.SUPABASE_PROJECT_ID || 'xshksvlnrgxijsznmkkj';
const CIBLE = 'src/lib/database.types.ts';

/** Marqueurs que tout fichier de types Supabase valide contient. */
const ATTENDUS = ['export type Database', 'Tables: {', 'export type Json'];

function echec(raison, detail) {
  console.error(`\n✗ Types non regeneres : ${raison}`);
  if (detail) console.error(String(detail).trim().split('\n').slice(0, 12).join('\n'));
  console.error(`\n${CIBLE} n'a pas ete touche.`);
  process.exit(1);
}

// La reference de projet finit dans une ligne de commande passee au shell :
// on la valide plutot que de lui faire confiance, puisqu'elle peut venir de
// l'environnement ou d'un argument.
if (!/^[a-z0-9]{15,32}$/.test(PROJET)) {
  echec(`« ${PROJET} » n est pas une reference de projet Supabase valide.`);
}

// `shell: true` est necessaire : sur Windows le CLI s'appelle supabase.cmd,
// que spawn ne resout pas seul. La commande est passee d'un bloc plutot qu'en
// tableau d'arguments — c'est la forme que Node accepte sans avertir que les
// arguments ne sont pas echappes (DEP0190).
const resultat = spawnSync(
  `supabase gen types typescript --project-id ${PROJET}`,
  { encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 },
);

if (resultat.error) {
  echec('le CLI Supabase n a pas pu demarrer.', resultat.error.message);
}

if (resultat.status !== 0) {
  echec(
    `le CLI Supabase a rendu le code ${resultat.status}.`,
    resultat.stderr || resultat.stdout,
  );
}

const sortie = resultat.stdout ?? '';

// Le CLI peut rendre 0 tout en n'ecrivant rien d'utile : session expiree,
// projet en pause, avertissement seul sur la sortie standard.
const manquants = ATTENDUS.filter((m) => !sortie.includes(m));
if (manquants.length > 0) {
  echec(
    `la sortie ne ressemble pas a des types (manque : ${manquants.join(', ')}).`,
    resultat.stderr || sortie.slice(0, 400),
  );
}

let ancien = '';
try {
  ancien = readFileSync(CIBLE, 'utf8');
} catch {
  // Premiere generation : pas d'ancien fichier, rien a comparer.
}

if (ancien === sortie) {
  console.log(`✓ ${CIBLE} etait deja a jour (${sortie.split('\n').length} lignes).`);
  process.exit(0);
}

writeFileSync(CIBLE, sortie, 'utf8');

const avant = ancien ? ancien.split('\n').length : 0;
const apres = sortie.split('\n').length;
console.log(`✓ ${CIBLE} regenere : ${avant} → ${apres} lignes.`);
