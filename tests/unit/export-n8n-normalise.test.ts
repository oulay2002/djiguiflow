import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { etatPublication, normaliserWorkflow } from '../../scripts/normaliser-workflow.mjs';

/**
 * LES DEUX INSTRUMENTS DE DERIVE, ET CE QU'ILS DOIVENT SAVOIR TAIRE.
 *
 * L'export n8n et la sauvegarde du schema ont le meme travail : ouvrir une PR
 * quand la production a bouge, et se taire sinon. Leur valeur tient entierement
 * a la seconde moitie. Une PR par nuit apprend a ne plus lire les PR, et le
 * jour ou l'une d'elles dit quelque chose de vrai, elle arrive au milieu des
 * autres.
 *
 * Aucun des deux n'etait eprouve, et les deux avaient derive :
 *
 *   n8n     trois champs apportes par la migration vers le VPS passaient dans
 *           le diff, et chaque changement reel y figurait DEUX fois
 *   schema  l'etape « y a-t-il un vrai changement ? » comparait un fichier
 *           dans lequel elle venait d'ecrire l'heure courante
 *
 * Ce test n'eprouve pas ce qu'ils exportent — il eprouve leur SILENCE.
 */

const noeud = (code: string) => ({ id: 'n1', name: 'Calculs', parameters: { jsCode: code } });

/** Un workflow tel que l'API du VPS le rend : la definition en double. */
function workflowVps(code: string, extra: Record<string, unknown> = {}) {
  const def = { nodes: [noeud(code)], connections: { Calculs: {} } };
  return {
    active: true,
    id: 'abc',
    name: 'Resume quotidien',
    versionCounter: 7,
    ...def,
    activeVersion: {
      authors: 'JEAN PAUL OULAI',
      name: null,
      workflowId: 'abc',
      workflowPublishHistory: [{ event: 'activated', id: 333, workflowId: 'abc' }],
      ...def,
    },
    ...extra,
  };
}

describe("l'export n8n ne parle que des vrais changements", () => {
  it('ignore les compteurs que le serveur tient tout seul', () => {
    const avant = normaliserWorkflow(workflowVps('return []'));

    const republie = workflowVps('return []');
    republie.versionCounter = 41;
    republie.activeVersion.authors = 'JEAN PAUL OULAI (via MCP)';
    republie.activeVersion.workflowPublishHistory = [
      { event: 'deactivated', id: 900, workflowId: 'abc' },
      { event: 'activated', id: 901, workflowId: 'abc' },
    ];

    // Republier a l'identique depuis un autre outil : rien n'a change.
    expect(JSON.stringify(normaliserWorkflow(republie))).toBe(JSON.stringify(avant));
  });

  it("n'ecrit aucun de ces champs dans le depot", () => {
    const texte = JSON.stringify(normaliserWorkflow(workflowVps('return []')));
    for (const champ of ['versionCounter', 'workflowPublishHistory', 'authors', 'activeVersion']) {
      expect(texte).not.toContain(champ);
    }
  });

  /**
   * CE CAS N'EXISTE PAS AUJOURD'HUI, ET C'EST POURQUOI IL EST ECRIT.
   *
   * Le n8n du VPS niche `workflowPublishHistory` dans `activeVersion`, qu'on
   * retire en entier : la ligne correspondante de VOLATILE ne sert donc a rien
   * pour l'instant. Constate en la supprimant — les onze tests sont restes
   * verts, ce qui est la definition d'un garde decoratif.
   *
   * On la garde pour la raison meme qui a cree la panne : ce serveur AJOUTE des
   * champs, et il a deja deplace celui-la une fois. Mais une ligne qu'aucun
   * test ne regarde n'est pas une precaution, c'est une croyance.
   */
  it('tairait ce journal meme si n8n le remontait a la racine', () => {
    const w = workflowVps('return []') as Record<string, unknown>;
    w.workflowPublishHistory = [{ event: 'activated', id: 1, workflowId: 'abc' }];
    expect(JSON.stringify(normaliserWorkflow(w))).not.toContain('workflowPublishHistory');
  });

  it('laisse passer un vrai changement de comportement', () => {
    const avant = JSON.stringify(normaliserWorkflow(workflowVps('return []')));
    const apres = JSON.stringify(normaliserWorkflow(workflowVps('return vides')));
    expect(apres).not.toBe(avant);
  });

  it("n'ecrit la definition qu'une fois", () => {
    const texte = JSON.stringify(normaliserWorkflow(workflowVps('marqueur-unique')));
    expect(texte.split('marqueur-unique')).toHaveLength(2);
  });
});

describe('un brouillon non publie ne doit pas passer pour la production', () => {
  it('dit « publie » quand les deux coincident', () => {
    expect(etatPublication(workflowVps('return []'))).toBe('publie');
  });

  it('dit « brouillon non publie » quand ils divergent', () => {
    const w = workflowVps('CE QUI TOURNE');
    w.nodes = [noeud('CE QUI EST OUVERT DANS L EDITEUR')];
    expect(etatPublication(w)).toBe('brouillon non publie');
  });

  it('dit « jamais publie » quand rien ne tourne', () => {
    const w = workflowVps('return []') as Record<string, unknown>;
    delete w.activeVersion;
    expect(etatPublication(w)).toBe('jamais publie');
  });

  /**
   * LE POINT QUI COMPTE : le depot est ce depuis quoi on repartirait apres la
   * perte du VPS. S'il enregistrait le brouillon, il ferait dire a la
   * restauration que la production fait ce que personne n'execute.
   */
  it('enregistre ce qui tourne, pas ce qui est ouvert dans l editeur', () => {
    const w = workflowVps('CE QUI TOURNE');
    w.nodes = [noeud('CE QUI EST OUVERT DANS L EDITEUR')];

    const texte = JSON.stringify(normaliserWorkflow(w));
    expect(texte).toContain('CE QUI TOURNE');
    expect(texte).not.toContain('CE QUI EST OUVERT');
    expect(texte).toContain('brouillon non publie');
  });
});

/**
 * ── LA SAUVEGARDE DU SCHEMA, EPROUVEE PAR SON PROPRE TEXTE ─────────────────
 *
 * On extrait le script de l'etape depuis le YAML et on l'EXECUTE, plutot que
 * de verifier qu'il contient telle chaine. Un garde qu'on lit n'est pas un
 * garde qu'on a vu fonctionner : c'est precisement en le lisant qu'on avait
 * cru, pendant trois jours, que « y a-t-il un vrai changement ? » repondait a
 * la question qu'il pose.
 */
function scriptDeLEtape(): string {
  const yml = readFileSync('.github/workflows/sauvegarde-schema.yml', 'utf8');
  const depart = yml.indexOf('- name: Y a-t-il un vrai changement ?');
  expect(depart, "l'etape a ete renommee : ce test ne garde plus rien").toBeGreaterThan(-1);

  const lignes = yml.slice(depart).split(/\r?\n/);
  const debut = lignes.findIndex((l) => l.trim() === 'run: |');
  const marge = ' '.repeat(lignes[debut].indexOf('run:') + 2);

  const corps: string[] = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (ligne.trim() !== '' && !ligne.startsWith(marge)) break;
    corps.push(ligne.slice(marge.length));
  }
  return corps.join('\n');
}

/** Rejoue l'etape sur un depot jetable, et rend ce qu'elle a ecrit dans GITHUB_OUTPUT. */
function rejouer(committe: string, produit: string): { verdict: string; fichier: string } {
  const bac = mkdtempSync(join(tmpdir(), 'schema-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: bac, stdio: 'pipe' });
  try {
    git('init', '-q');
    git('config', 'user.email', 'banc@local');
    git('config', 'user.name', 'banc');
    mkdirSync(join(bac, 'supabase/reference'), { recursive: true });
    writeFileSync(join(bac, 'supabase/reference/schema.sql'), committe);
    git('add', '-A');
    git('commit', '-qm', 'reference');

    // Ce que l'etape precedente vient d'ecrire sur le disque.
    writeFileSync(join(bac, 'supabase/reference/schema.sql'), produit);

    const sortie = join(bac, 'sortie.txt');
    writeFileSync(sortie, '');
    execFileSync('bash', ['-c', scriptDeLEtape()], {
      cwd: bac,
      env: { ...process.env, GITHUB_OUTPUT: sortie },
      stdio: 'pipe',
    });

    return {
      verdict: (readFileSync(sortie, 'utf8').match(/change=(\w+)/) ?? [])[1] ?? '',
      fichier: readFileSync(join(bac, 'supabase/reference/schema.sql'), 'utf8'),
    };
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
}

const reference = (date: string, corps: string) =>
  `-- INSTANTANE DU ${date} UTC\n-- DERNIERE MIGRATION APPLIQUEE : 20260829155309\n\n${corps}`;

describe('la reference du schema ne parle que si le schema a bouge', () => {
  it('se tait quand seul l horodatage a change', () => {
    const r = rejouer(
      reference('2026-08-30 10:34', 'create table commandes (id uuid);\n'),
      reference('2026-09-02 05:30', 'create table commandes (id uuid);\n'),
    );
    expect(r.verdict).toBe('non');
    // Et il remet le fichier tel quel, sinon la PR repart par la porte d'a cote.
    expect(r.fichier).toContain('2026-08-30 10:34');
  });

  it('parle quand le schema a vraiment bouge', () => {
    const r = rejouer(
      reference('2026-08-30 10:34', 'create table commandes (id uuid);\n'),
      reference('2026-09-02 05:30', 'create table commandes (id uuid, boutique_id uuid);\n'),
    );
    expect(r.verdict).toBe('oui');
  });

  /** Le filigrane borne le rattrapage apres restauration : le voir bouger est un evenement. */
  it('parle quand le filigrane de migration a bouge', () => {
    const r = rejouer(
      reference('2026-08-30 10:34', 'create table commandes (id uuid);\n'),
      `-- INSTANTANE DU 2026-09-02 05:30 UTC\n-- DERNIERE MIGRATION APPLIQUEE : 20260902151138\n\ncreate table commandes (id uuid);\n`,
    );
    expect(r.verdict).toBe('oui');
  });
});
