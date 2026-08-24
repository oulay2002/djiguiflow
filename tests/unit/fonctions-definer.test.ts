import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Le garde des fonctions SECURITY DEFINER doit CRIER a volonte.
 *
 * CE QU'IL PROTEGE. Le 24 aout 2026, une seule des 24 fonctions
 * SECURITY DEFINER de la production etait executable par PUBLIC, sans que
 * personne l'ait decide : la migration 20260823200135 avait fait `drop
 * function` puis `create function`, et un drop remet les droits a la valeur
 * par defaut de Postgres — EXECUTE a PUBLIC. Le `grant` pose ensuite n'en
 * retire rien.
 *
 * POURQUOI CES TESTS PLUTOT QU'UNE RELECTURE. La premiere version du garde
 * etait verte sur le vrai schema et FAUSSE : elle criait sur cinq fonctions
 * parfaitement fermees, parce que pg_dump ecrit les valeurs par defaut dans le
 * CREATE et les omet dans le REVOKE. Elle comparait donc deux ecritures de la
 * meme signature. Une relecture ne l'aurait pas vu ; une mutation l'a vu tout
 * de suite.
 *
 * Le cas 3 verrouille precisement ce faux positif. Le cas 7 verrouille l'autre
 * facon d'echouer, la pire : un garde qui ne lit plus rien et se tait.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'verifier-fonctions-definer.mjs');

// Le garde ne juge pas les migrations anterieures a sa propre pose. Les
// fixtures doivent donc porter un horodatage au moins egal a celui-ci.
const APRES_LA_POSE = '20260824120000';

let dossier: string;
let reference: string;
let migrations: string;

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'definer-'));
  reference = join(dossier, 'schema.sql');
  migrations = join(dossier, 'migrations');
  mkdirSync(migrations);
  writeFileSync(reference, schemaAvec([FERMEE]));
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

function lancer() {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      REFERENCE_SCHEMA: reference,
      DOSSIER_MIGRATIONS: migrations,
    },
  });
  return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Une fonction telle que pg_dump l'ecrit : creation, proprietaire, droits. */
function fonction(nom: string, args: string, options: { definer?: boolean; revoke?: boolean }) {
  // pg_dump OMET les valeurs par defaut dans REVOKE/GRANT alors qu'il les
  // ecrit dans CREATE. C'est le piege que le cas 3 verrouille : la fixture
  // doit donc reproduire cette asymetrie, pas la lisser.
  const argsSansDefauts = args.replace(/\s+DEFAULT\s+[^,)]+/g, '');
  return [
    `CREATE OR REPLACE FUNCTION "public"."${nom}"(${args}) RETURNS integer`,
    `    LANGUAGE "sql"${options.definer === false ? '' : ' SECURITY DEFINER'}`,
    '    AS $$ select 1; $$;',
    '',
    `ALTER FUNCTION "public"."${nom}"(${argsSansDefauts}) OWNER TO "postgres";`,
    '',
    options.revoke === false
      ? ''
      : `REVOKE ALL ON FUNCTION "public"."${nom}"(${argsSansDefauts}) FROM PUBLIC;`,
    `GRANT ALL ON FUNCTION "public"."${nom}"(${argsSansDefauts}) TO "service_role";`,
    '',
  ].join('\n');
}

const FERMEE = fonction('secret_webhook_n8n', '"p_slug" "text"', {});
const schemaAvec = (blocs: string[]) => blocs.join('\n');

describe('le passage 1 — la reference du schema', () => {
  it('1. accepte une reference dont toutes les fonctions definer sont fermees', () => {
    const { code, sortie } = lancer();
    expect(code).toBe(0);
    expect(sortie).toContain('toutes fermees a PUBLIC');
  });

  it('2. refuse une fonction SECURITY DEFINER sans revoke, et la nomme', () => {
    writeFileSync(
      reference,
      schemaAvec([FERMEE, fonction('prolonger_acces', '"p_boutique" "uuid"', { revoke: false })]),
    );
    const { code, sortie } = lancer();
    expect(code).toBe(1);
    expect(sortie).toContain('prolonger_acces');
    // Nommer la coupable ne suffit pas : le message doit porter le geste.
    expect(sortie).toContain('from public;');
    // Et surtout, il ne doit pas emporter les innocentes avec lui.
    expect(sortie).not.toContain('secret_webhook_n8n');
  });

  it("3. ne crie pas sur une signature a valeurs par defaut — le faux positif d'origine", () => {
    writeFileSync(
      reference,
      schemaAvec([
        fonction('rapport_activite', `"p_periode" "text" DEFAULT 'jour'::"text"`, {}),
        fonction('reserver_fenetre', '"p_cle" "text", "p_secondes" integer DEFAULT 600', {}),
      ]),
    );
    expect(lancer().code).toBe(0);
  });

  it('4. laisse tranquille une fonction qui n\'est PAS security definer', () => {
    writeFileSync(
      reference,
      schemaAvec([FERMEE, fonction('borne_periode', '"p_periode" "text"', {
        definer: false,
        revoke: false,
      })]),
    );
    expect(lancer().code).toBe(0);
  });
});

describe('le passage 2 — la cause, dans les migrations', () => {
  const migration = (nom: string, sql: string) =>
    writeFileSync(join(migrations, `${APRES_LA_POSE}_${nom}.sql`), sql);

  it('5. refuse un drop suivi d\'un create sans revoke', () => {
    migration('recreer', [
      'drop function if exists public.prolonger_acces(uuid);',
      'create function public.prolonger_acces(p_boutique uuid)',
      " returns void language sql security definer as $$ select 1; $$;",
      'grant execute on function public.prolonger_acces(uuid) to service_role;',
    ].join('\n'));
    const { code, sortie } = lancer();
    expect(code).toBe(1);
    expect(sortie).toContain('prolonger_acces');
  });

  it('6. accepte le meme fichier quand le revoke y est', () => {
    migration('recreer', [
      'drop function if exists public.prolonger_acces(uuid);',
      'create function public.prolonger_acces(p_boutique uuid)',
      " returns void language sql security definer as $$ select 1; $$;",
      'revoke all on function public.prolonger_acces(uuid) from public;',
      'grant execute on function public.prolonger_acces(uuid) to service_role;',
    ].join('\n'));
    expect(lancer().code).toBe(0);
  });

  it('7. accepte une suppression pour de bon — rien a reposer', () => {
    migration('supprimer', 'drop function if exists public.vieille_fonction(text);');
    expect(lancer().code).toBe(0);
  });

  it('8. ne lit pas le SQL CITE dans les commentaires', () => {
    // La migration du revoke cite le drop fautif pour l'expliquer. Un garde
    // qui lirait ses commentaires comme du code crierait sur le fichier meme
    // qui enonce la regle.
    migration('commentaire', [
      '-- drop function if exists public.prolonger_acces(uuid);',
      '-- create function public.prolonger_acces(p_boutique uuid) ...',
      'select 1;',
    ].join('\n'));
    expect(lancer().code).toBe(0);
  });
});

describe('le garde lui-meme', () => {
  it("9. echoue s'il ne trouve AUCUNE fonction definer — l'aveuglement est un defaut", () => {
    // Le pire etat possible n'est pas le cri : c'est le silence. Si le format
    // du dump change et que la lecture rend zero, un garde naif annonce
    // « tout va bien » pour toujours.
    writeFileSync(reference, '-- une reference vide, ou illisible\n');
    const { code, sortie } = lancer();
    expect(code).toBe(1);
    expect(sortie).toContain('Aucune fonction SECURITY DEFINER');
  });

  it('10. echoue si la reference est absente', () => {
    rmSync(reference);
    const { code, sortie } = lancer();
    expect(code).toBe(1);
    expect(sortie).toContain('illisible');
  });
});
