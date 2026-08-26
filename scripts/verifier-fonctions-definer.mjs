/**
 * Aucune fonction SECURITY DEFINER ne doit etre executable par PUBLIC.
 *
 * POURQUOI CE SCRIPT EXISTE. Le 24 aout 2026, sur les 24 fonctions
 * SECURITY DEFINER du schema public, UNE SEULE repondait vrai a
 * has_function_privilege('public', ..., 'EXECUTE') : vitrine_boutiques.
 * Personne ne l'avait decide. La migration 20260823200135 avait fait :
 *
 *     drop function if exists public.vitrine_boutiques();
 *     create function public.vitrine_boutiques() ...
 *     grant execute ... to anon, authenticated, service_role;
 *
 * Le `drop` etait necessaire — la signature de retour changeait — mais il
 * remet les droits a la valeur PAR DEFAUT de Postgres, qui est EXECUTE a
 * PUBLIC. Le `grant` pose par-dessus n'en retire rien. Un `create or replace`
 * aurait conserve l'ACL ; un `drop` la reinitialise EN SILENCE.
 *
 * Ce cas-la n'ouvrait rien : c'est l'annuaire public, deja ouvert a `anon`.
 * Mais la meme migration ecrite pour `prolonger_acces`, `definir_jeton_canal`
 * ou `secret_webhook_n8n` aurait ouvert a tout visiteur de la vitrine une
 * fonction qui contourne RLS par construction — et rien ne l'aurait dit.
 *
 * SECURITY DEFINER ne restreint RIEN : il fait tourner la fonction avec les
 * droits de son proprietaire. Le seul verrou est l'ACL.
 *
 * ── CE QU'IL LIT, ET LA LIMITE QUI VA AVEC ─────────────────────────────────
 *
 * Passage 1 lit `supabase/reference/schema.sql`, l'instantane ecrit chaque
 * nuit depuis la PRODUCTION par sauvegarde-schema.yml. C'est lui qui porte la
 * verite des droits, et c'est dans son diff que le defaut s'est vu.
 *
 * Sa limite, dite franchement plutot que laissee a croire : il a jusqu'a
 * VINGT-QUATRE HEURES de retard. Une derive introduite a midi n'est vue que
 * le lendemain matin. C'est le delai qu'a eu ce defaut-la, et c'est ainsi
 * qu'il a ete trouve.
 *
 * Le controle en direct serait plus prompt. Il demanderait un acces base en
 * CI — donc une raison de plus de tomber pour un motif etranger a ce qu'il
 * verifie. Un garde qui tombe au hasard apprend a relancer sans lire ; voir
 * le commentaire de la version epinglee du CLI dans verification.yml. Ce
 * choix est deliberement l'inverse : plus lent, jamais capricieux.
 *
 * Passage 2 rattrape ce retard par l'autre bout — il lit les migrations et
 * attrape la CAUSE, un `drop function` suivi d'un `create` sans `revoke`,
 * au moment ou le fichier arrive. Les deux passages se completent : le
 * premier constate, le second previent.
 *
 * Usage : node scripts/verifier-fonctions-definer.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Les deux chemins s'annulent par l'environnement, et uniquement pour que les
// tests puissent lancer ce garde sur des fixtures. Un garde qu'on ne peut pas
// faire CRIER a volonte est un garde qu'on ne sait pas verifier : celui-ci a
// commence sa vie avec cinq faux positifs, et c'est une mutation qui les a
// montres, pas une relecture.
const REFERENCE = process.env.REFERENCE_SCHEMA || 'supabase/reference/schema.sql';
const MIGRATIONS = process.env.DOSSIER_MIGRATIONS || 'supabase/migrations';

// Passage 2 ne juge pas l'histoire. Les migrations anterieures a ce garde ont
// ete ecrites sans lui, et leur etat REEL est deja couvert par le passage 1 :
// si l'une d'elles avait laisse une fonction ouverte, la reference le dirait.
// Les rouvrir ici ne corrigerait rien et rendrait le garde rouge en
// permanence — c'est exactement ce qui apprend a ne plus le lire.
const DEPUIS = '20260824113657';

const problemes = [];
const espaces = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Ramene une signature a la forme que les DEUX cotes du dump partagent.
 *
 * pg_dump ne rend pas la meme chose selon l'endroit — et c'est ce qui a fait
 * crier ce garde sur cinq fonctions parfaitement fermees, la premiere fois
 * qu'il a tourne :
 *
 *   CREATE ... "rapport_activite"("p_periode" "text" DEFAULT 'jour'::"text")
 *   REVOKE  ... "rapport_activite"("p_periode" "text")
 *
 * Le CREATE porte les valeurs par defaut, le REVOKE les omet. Comparer les
 * deux tels quels, c'est comparer deux ecritures de la meme fonction et
 * conclure qu'elle manque.
 *
 * On retire donc `DEFAULT <expression>` de chaque argument. L'expression peut
 * contenir des virgules et des parentheses (`DEFAULT coalesce(a, b)`) : on
 * scanne en comptant la profondeur et en ignorant ce qui est entre quotes,
 * plutot que de couper sur la premiere virgule venue.
 */
function normaliser(signature) {
  const s = espaces(signature);
  const ouvre = s.indexOf('(');
  const ferme = s.lastIndexOf(')');
  if (ouvre === -1 || ferme < ouvre) return s;

  const nom = s.slice(0, ouvre);
  const args = s.slice(ouvre + 1, ferme);

  const segments = [];
  let courant = '';
  let profondeur = 0;
  let quote = null;

  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];
    if (quote) {
      courant += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; courant += c; continue; }
    if (c === '(') profondeur += 1;
    if (c === ')') profondeur -= 1;
    if (c === ',' && profondeur === 0) { segments.push(courant); courant = ''; continue; }
    courant += c;
  }
  segments.push(courant);

  const nets = segments
    .map((seg) => seg.replace(/\s+DEFAULT\s+[\s\S]*$/i, ''))
    .map((seg) => espaces(seg))
    .filter((seg) => seg.length > 0);

  return `${espaces(nom)}(${nets.join(', ')})`;
}

// ─────────────────────────────────────────────── passage 1 : la reference

let reference;
try {
  reference = readFileSync(REFERENCE, 'utf8');
} catch (erreur) {
  console.error(`\n✗ ${REFERENCE} est illisible : ${erreur.message}`);
  console.error('  Ce fichier est ecrit chaque nuit par sauvegarde-schema.yml.');
  console.error("  Son absence n'est pas un detail : c'est le garde qui devient aveugle.");
  process.exit(1);
}

// pg_dump ecrit une fonction par bloc, toujours dans le meme ordre :
//   CREATE OR REPLACE FUNCTION "public"."nom"(args) RETURNS ...
//   ... corps, qui porte SECURITY DEFINER le cas echeant ...
//   ALTER FUNCTION "public"."nom"(args) OWNER TO "postgres";
const blocs = reference.split(/^CREATE (?:OR REPLACE )?FUNCTION /m).slice(1);

const definer = [];
for (const bloc of blocs) {
  const finDuBloc = bloc.search(/^ALTER FUNCTION /m);
  const corps = finDuBloc === -1 ? bloc : bloc.slice(0, finDuBloc);

  const finSignature = corps.search(/\sRETURNS\s/);
  if (finSignature === -1) continue;
  const signature = normaliser(corps.slice(0, finSignature));

  // Les autres schemas ne nous regardent pas : `auth`, `storage` et
  // `extensions` sont tenus par Supabase, pas par ce depot.
  if (!signature.startsWith('"public".')) continue;
  if (!/\bSECURITY DEFINER\b/.test(corps)) continue;

  definer.push(signature);
}

if (definer.length === 0) {
  console.error(`\n✗ Aucune fonction SECURITY DEFINER trouvee dans ${REFERENCE}.`);
  console.error("  La production en porte plus de vingt : c'est la LECTURE qui a");
  console.error('  cesse de fonctionner, pas le schema qui a change. Un garde qui');
  console.error('  ne trouve rien et se tait est pire que pas de garde.');
  process.exit(1);
}

const revoques = new Set(
  [...reference.matchAll(/^REVOKE ALL ON FUNCTION (.+) FROM PUBLIC;\s*$/gm)]
    .map((m) => normaliser(m[1])),
);

for (const signature of definer) {
  if (!revoques.has(signature)) {
    problemes.push({
      ou: REFERENCE,
      quoi: `${signature} est SECURITY DEFINER et executable par PUBLIC`,
      geste: `revoke all on function ${signature.replace(/"/g, '')} from public;`,
    });
  }
}

/**
 * ── PASSAGE 1 bis : LE ROLE QUE CE GARDE NE REGARDAIT PAS ─────────────────
 *
 * Tout ce qui precede cherche `REVOKE ... FROM PUBLIC`. C'etait le bon reflexe
 * Postgres, et c'est le mauvais role sur Supabase.
 *
 * SUPABASE N'ACCORDE JAMAIS A PUBLIC. Il accorde nommement a `anon` et
 * `authenticated`, par des droits par defaut poses sur le schema `public` :
 * toute fonction qui y nait porte donc `anon=X` dans son ACL, et PUBLIC n'y
 * figure pas. Un `pg_dump` rend alors, pour la meme fonction, un
 * `REVOKE ALL ... FROM PUBLIC` **et** un `GRANT ALL ... TO "anon"`. Le passage
 * ci-dessus voyait le revoke, se declarait satisfait, et laissait la fonction
 * ouverte a tout visiteur.
 *
 * Constate le 26 aout 2026 : `limiter_boutiques_par_plan` est nee ouverte a
 * `anon` et a `authenticated`, ce garde est reste vert. Elle ne rendait rien —
 * c'est une fonction de declencheur, elle echoue hors declencheur — mais la
 * meme migration ecrite pour `prolonger_acces` ou `jeton_canal` aurait ouvert a
 * tout visiteur une fonction qui contourne RLS par construction.
 *
 * D'OU UNE LISTE BLANCHE, ET NON UNE DETECTION. On ne peut pas deduire du SQL
 * si une ouverture est voulue : seul un humain le sait. Les trois fonctions de
 * vitrine sont publiques par dessein — c'est ce que la vitrine appelle sans
 * compte. Toute autre doit etre justifiee ici, a la main, en toute conscience.
 */
const OUVERTES_A_DESSEIN = new Set([
  '"public"."vitrine_boutique"("p_ref" "text")',
  '"public"."vitrine_boutiques"()',
  '"public"."vitrine_produits"("p_ref" "text")',
].map(normaliser));

const accordeesAnon = new Set(
  [...reference.matchAll(/^GRANT ALL ON FUNCTION (.+) TO "(?:anon|authenticated)";\s*$/gm)]
    .map((m) => normaliser(m[1])),
);

for (const signature of definer) {
  if (accordeesAnon.has(signature) && !OUVERTES_A_DESSEIN.has(signature)) {
    problemes.push({
      ou: REFERENCE,
      quoi: `${signature} est SECURITY DEFINER et executable par anon ou authenticated`,
      geste:
        `revoke all on function ${signature.replace(/"/g, '')} from anon, authenticated;\n`
        + "      (ou, si l'ouverture est voulue, l'inscrire dans OUVERTES_A_DESSEIN de ce script)",
    });
  }
}

// ────────────────────────────────────── passage 2 : la cause, dans les migrations

const fichiers = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => f.slice(0, 14) >= DEPUIS)
  .sort();

for (const fichier of fichiers) {
  const brut = readFileSync(join(MIGRATIONS, fichier), 'utf8');
  // Les commentaires de ce depot CITENT du SQL — celui de la migration du
  // revoke montre le drop fautif. Les lire comme du code ferait crier le
  // garde sur un fichier qui explique justement la regle.
  const sql = brut.replace(/^[ \t]*--.*$/gm, '');

  const droppees = new Set(
    [...sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi)]
      .map((m) => m[1].toLowerCase()),
  );

  for (const nom of droppees) {
    const recreee = new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?"?${nom}"?\\s*\\(`,
      'i',
    ).test(sql);
    // Une fonction supprimee pour de bon n'a pas de droits a reposer.
    if (!recreee) continue;

    const revoquee = new RegExp(
      `revoke\\s+[^;]*?\\bon\\s+function\\s+(?:public\\.)?"?${nom}"?[^;]*?from\\s+public`,
      'i',
    ).test(sql);
    if (revoquee) continue;

    problemes.push({
      ou: `${MIGRATIONS}/${fichier}`,
      quoi: `public.${nom} est supprimee puis recreee sans reposer son revoke`,
      geste: `revoke all on function public.${nom}(...) from public;`,
    });
  }
}

// ───────────────────────────────────────────────────────────── le verdict

if (problemes.length > 0) {
  console.error(`\n✗ ${problemes.length} fonction(s) sans verrou :\n`);
  for (const p of problemes) {
    console.error(`  ${p.ou}`);
    console.error(`    ${p.quoi}`);
    console.error(`    → ${p.geste}\n`);
  }
  console.error('SECURITY DEFINER ne restreint rien — il fait tourner la fonction avec');
  console.error("les droits de son proprietaire. Le seul verrou est l'ACL, et un");
  console.error('`drop function` la remet a EXECUTE pour PUBLIC.\n');
  console.error('La regle : APRES TOUT `drop function`, reposer le revoke, pas');
  console.error('seulement les grants.\n');
  process.exit(1);
}

console.log(
  `✓ ${definer.length} fonctions SECURITY DEFINER, toutes fermees a PUBLIC `
    + `(${REFERENCE}, ${fichiers.length} migration(s) relue(s)).`,
);
