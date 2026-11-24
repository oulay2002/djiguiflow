import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rejouerLaReprise, transformer } from '../../scripts/reprendre-message-apres-stop.mjs';

/**
 * Le routeur WhatsApp perdait le message apres le controle « stop ».
 *
 * Constate le 24 novembre 2026 : un client ecrit une phrase banale contenant
 * « ne plus », le routeur verifie si c'est une demande d'arret, l'API repond
 * non — et le message repart vers l'assistante en ayant perdu sa boutique et
 * son texte. Le client recevait « l'assistante est en panne ».
 *
 * Ces tests tiennent la TRANSFORMATION : elle n'ecrit que ce qu'elle annonce,
 * et refuse d'agir sur un routeur qui n'a plus la forme attendue.
 */

type Fil = { node: string; type: string; index: number };
type Workflow = {
  nodes: { name: string; type: string; typeVersion: number; position: number[]; parameters: Record<string, unknown> }[];
  connections: Record<string, { main: (Fil[] | null)[] }>;
};

const noeud = (name: string, position: number[]) =>
  ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: {} });

/** Le routeur AVANT correctif, reduit a ce qui compte. */
function routeurAncien(): Workflow {
  return {
    nodes: [
      noeud('Normalisateur WA', [0, 0]),
      noeud('Enregistrer le stop', [200, 200]),
      noeud('Stop reconnu ?', [320, 200]),
      noeud('Position ?', [16, -16]),
    ],
    connections: {
      'Enregistrer le stop': { main: [[{ node: 'Stop reconnu ?', type: 'main', index: 0 }]] },
      'Stop reconnu ?': { main: [null, [{ node: 'Position ?', type: 'main', index: 0 }]] },
    },
  };
}

describe('le message est remis en circulation apres le controle « stop »', () => {
  it('un noeud s’intercale sur la sortie « non », et nulle part ailleurs', () => {
    const wf = routeurAncien();
    const avant = JSON.stringify(wf.connections['Enregistrer le stop']);
    expect(transformer(wf)).toHaveLength(3);
    expect(wf.nodes).toHaveLength(5);
    expect(wf.connections['Stop reconnu ?'].main[1]).toEqual([{ node: 'Reprendre le message', type: 'main', index: 0 }]);
    expect(wf.connections['Reprendre le message'].main[0]).toEqual([{ node: 'Position ?', type: 'main', index: 0 }]);
    // La sortie « oui » — le stop EST reconnu — ne bouge pas.
    expect(wf.connections['Stop reconnu ?'].main[0]).toBeNull();
    expect(JSON.stringify(wf.connections['Enregistrer le stop'])).toBe(avant);
  });

  it('il rend le message du normalisateur, et plus la reponse de l’appel', () => {
    const wf = routeurAncien();
    transformer(wf);
    const message = { slug: 'boutique-essai', texte: 'je ne veux plus de piment', destinataire: '2250700000000' };
    expect(rejouerLaReprise(wf, message)).toEqual([{ json: message }]);
  });

  it('rejouee, elle ne change plus rien', () => {
    const wf = routeurAncien();
    transformer(wf);
    const apres = JSON.stringify(wf);
    expect(transformer(wf)).toEqual([]);
    expect(JSON.stringify(wf)).toBe(apres);
  });
});

describe('elle refuse d’agir sur un routeur qu’elle ne reconnait pas', () => {
  it('un noeud attendu manque', () => {
    const wf = routeurAncien();
    wf.nodes = wf.nodes.filter((n) => n.name !== 'Position ?');
    expect(() => transformer(wf)).toThrow(/ce n'est pas celui qu'on croit/);
  });

  it('la sortie « non » mene ailleurs que prevu : on n’ecrase pas un fil inconnu', () => {
    const wf = routeurAncien();
    wf.nodes.push(noeud('Autre chose', [0, 0]));
    wf.connections['Stop reconnu ?'].main[1] = [{ node: 'Autre chose', type: 'main', index: 0 }];
    expect(() => transformer(wf)).toThrow(/ne mene plus a « Position \? » seul/);
  });
});

describe('sur la copie du routeur gardee dans le depot', () => {
  it('elle s’applique, ou elle y est deja — et la forme finale est la meme', () => {
    // La copie est reexportee chaque nuit : avant l'export elle porte
    // l'ancienne forme, apres la nouvelle. Les deux doivent passer.
    const wf = JSON.parse(readFileSync('n8n/routeur-whatsapp.json', 'utf8')) as Workflow;
    transformer(wf);
    expect(wf.connections['Stop reconnu ?'].main[1]).toEqual([{ node: 'Reprendre le message', type: 'main', index: 0 }]);
    expect(wf.connections['Reprendre le message'].main[0]?.[0].node).toBe('Position ?');
    expect(transformer(wf)).toEqual([]);
  });
});
