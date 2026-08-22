/**
 * Le depot et la base disent-ils la meme chose ?
 *
 * POURQUOI CE SCRIPT EXISTE. Le dossier `supabase/migrations` a ete reconstitue
 * a la main le 17 aout 2026 — « 38 fichiers, 38 migrations, aucun ecart,
 * verifie ». Le 22 aout, le depot en avait 40 et la base 56 : SEIZE migrations
 * appliquees sans aucun fichier, dont des politiques RLS et des REVOKE sur des
 * fonctions SECURITY DEFINER. La derive est revenue en CINQ JOURS.
 *
 * Ce qu'elle coute : une recette reconstruite depuis le depot est PLUS OUVERTE
 * que la production, et des tests y passent qui devaient echouer. Sur une
 * plateforme multi-marchands, c'est l'ecart qui se paie une fois, tres cher.
 *
 * Un controle manuel ne tient pas — il a echoue deux fois. Celui-ci tourne a
 * chaque push.
 *
 * CE QU'IL COMPARE, ET CE QU'IL NE COMPARE PAS. Le CLI Supabase rapproche les
 * HORODATAGES : il voit une migration appliquee sans fichier, et un fichier
 * jamais applique. Il ne compare pas le NOM apres l'horodatage, ni le contenu.
 * Un fichier mal nomme passerait donc — c'est genant a la lecture, mais ce
 * n'est pas un ecart de schema, et le detecter demanderait un mot de passe de
 * base en plus du jeton. Le dire ici vaut mieux que de laisser croire a une
 * couverture qu'il n'a pas.
 *
 * Usage : node scripts/verifier-migrations.mjs [id-du-projet]
 * En CI : exige SUPABASE_ACCESS_TOKEN. En local : `supabase login` suffit.
 */
import { spawnSync } from 'node:child_process';

const PROJET = process.argv[2] || process.env.SUPABASE_PROJECT_ID || 'xshksvlnrgxijsznmkkj';

function echec(raison, detail) {
  console.error(`\n✗ ${raison}`);
  if (detail) console.error(String(detail).trim().split('\n').slice(0, 15).join('\n'));
  process.exit(1);
}

// La reference finit dans une ligne de commande passee au shell : on la valide
// plutot que de lui faire confiance, puisqu'elle peut venir de l'environnement.
if (!/^[a-z0-9]{15,32}$/.test(PROJET)) {
  echec(`« ${PROJET} » n'est pas une reference de projet Supabase valide.`);
}

// `shell: true` : sur Windows le CLI s'appelle supabase.cmd, que spawn ne
// resout pas seul. Meme raison que dans types-supabase.mjs.
const resultat = spawnSync(
  `supabase migration list --linked --project-ref ${PROJET} --output-format json`,
  { encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 },
);

if (resultat.error) {
  echec(
    'Le CLI Supabase n\'a pas pu demarrer. Installez-le, ou ajoutez l\'action'
      + ' supabase/setup-cli au workflow.',
    resultat.error.message,
  );
}

const sortie = `${resultat.stdout || ''}`;
const journal = `${resultat.stderr || ''}`;

// Le CLI ecrit des lignes d'avancement avant le JSON (« Connecting to remote
// database… ») et saute les fichiers qui ne suivent pas la convention de nom.
// On ne prend donc que la derniere ligne, qui porte l'objet.
const ligneJson = sortie
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('{'))
  .pop();

if (!ligneJson) {
  const auth = /token|login|unauthorized|401/i.test(journal + sortie);
  echec(
    auth
      ? 'Authentification refusee. En CI, posez le secret SUPABASE_ACCESS_TOKEN ;'
          + ' en local, lancez `supabase login`.'
      : `Le CLI n'a rendu aucun JSON (code ${resultat.status}).`,
    journal || sortie,
  );
}

let migrations;
try {
  migrations = JSON.parse(ligneJson).migrations;
} catch (e) {
  echec('Reponse du CLI illisible.', e.message);
}

if (!Array.isArray(migrations)) {
  echec('Le CLI n\'a pas rendu de liste de migrations.', ligneJson.slice(0, 400));
}

// Une valeur vide, nulle ou absente signifie « pas de ce cote-la ».
const presente = (v) => Boolean(v && String(v).trim());

const appliqueesSansFichier = migrations.filter((m) => presente(m.remote) && !presente(m.local));
const fichiersJamaisAppliques = migrations.filter((m) => presente(m.local) && !presente(m.remote));
const alignees = migrations.filter((m) => presente(m.local) && presente(m.remote));

console.log(`Projet ${PROJET} — ${migrations.length} migrations connues.`);
console.log(`  alignees                     : ${alignees.length}`);
console.log(`  appliquees SANS fichier      : ${appliqueesSansFichier.length}`);
console.log(`  fichiers JAMAIS appliques    : ${fichiersJamaisAppliques.length}`);

if (!appliqueesSansFichier.length && !fichiersJamaisAppliques.length) {
  console.log('\n✓ Le depot et la base disent la meme chose.');
  process.exit(0);
}

console.error('\n✗ Le depot et la base ont diverge.');

if (appliqueesSansFichier.length) {
  console.error('\nAppliquees en production, aucun fichier au depot :');
  for (const m of appliqueesSansFichier) console.error(`  ${m.remote}   ${m.time ?? ''}`);
  console.error(
    '\n  Une recette reconstruite depuis le depot serait PLUS OUVERTE que la'
      + ' production.\n  Reconstituer depuis le texte exact conserve en base :'
      + '\n    select version, name, array_to_string(statements, E\'\\n\')'
      + '\n      from supabase_migrations.schema_migrations order by version;',
  );
}

if (fichiersJamaisAppliques.length) {
  console.error('\nAu depot, jamais appliquees — un `supabase db push` les rejouerait :');
  for (const m of fichiersJamaisAppliques) console.error(`  ${m.local}`);
}

console.error('\nVoir supabase/migrations/README.md pour la marche a suivre.');
process.exit(1);
