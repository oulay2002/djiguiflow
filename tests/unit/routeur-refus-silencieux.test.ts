import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * UN REFUS DE CANAL FINIT PROPREMENT ; UNE PANNE CRIE ENCORE.
 *
 * ── CE QUI A ÉTÉ MESURÉ LE 3 SEPTEMBRE 2026 ────────────────────────────────
 *
 * `Charger fiche` appelle `/api/internal/fiche`, qui vérifie le secret propre
 * au marchand. Un secret faux rend 401 — la bonne réponse. Un nœud HTTP, lui,
 * traite tout non-2xx comme une panne : l'exécution passait en rouge, et les
 * deux routeurs portent un `errorWorkflow`, donc une alerte partait.
 *
 * N'importe qui connaissant l'URL publique du webhook d'un marchand pouvait
 * ainsi faire sonner le salon de veille avec un en-tête bidon. Le banc de
 * l'assistante laissait la même trace rouge à chaque passage.
 *
 * ── CE QUE CE GARDE TIENT ──────────────────────────────────────────────────
 *
 * Deux propriétés, et la seconde est la plus fragile parce qu'elle est
 * INVISIBLE quand elle se perd :
 *
 *   1. le 401 finit sans trace rouge ;
 *   2. TOUT LE RESTE — 5xx, 404, réseau, et toute forme d'erreur qu'on n'a pas
 *      su lire — lève encore.
 *
 * Si (2) se perdait, la plateforme deviendrait muette sur de vraies pannes et
 * rien ne le dirait : c'est exactement le motif qu'on passe notre temps à
 * fermer. Vérifié en production sur les deux routeurs : refus → exécution
 * verte, slug inconnu → exécution rouge.
 */

const ROUTEURS = ['n8n/routeur-whatsapp.json', 'n8n/routeur-telegram.json'];

type Noeud = { name: string; type: string; onError?: string; parameters?: { jsCode?: string } };
type Flux = {
  nodes: Noeud[];
  connections: Record<string, { main?: ({ node: string }[] | null)[] }>;
};

describe.each(ROUTEURS)('%s — le refus de canal ne casse plus l execution', (chemin) => {
  const flux = JSON.parse(readFileSync(chemin, 'utf8')) as Flux;
  const fiche = flux.nodes.find((n) => n.name === 'Charger fiche');

  it('porte bien un noeud « Charger fiche »', () => {
    // Renomme, ce noeud rendrait tout le reste de ce fichier muet — et un
    // garde muet passe au vert sans rien tenir.
    expect(fiche).toBeDefined();
  });

  it('le refus sort par une branche au lieu d interrompre', () => {
    expect(fiche?.onError).toBe('continueErrorOutput');
  });

  const branche = flux.connections['Charger fiche']?.main?.[1]?.[0]?.node;

  it('cette branche mene quelque part', () => {
    // Une sortie d erreur cablee sur rien, c est un refus AVALE : l execution
    // finirait verte sur une vraie panne. Pire que le defaut d origine.
    expect(branche).toBeTruthy();
  });

  const decideur = flux.nodes.find((n) => n.name === branche);
  const code = decideur?.parameters?.jsCode ?? '';

  it('ce qui decide est du code lisible, pas une devinette', () => {
    expect(decideur?.type).toBe('n8n-nodes-base.code');
    expect(code.length).toBeGreaterThan(200);
  });

  it('le 401 finit proprement, sans item et sans trace rouge', () => {
    expect(code).toContain("code === '401'");
    expect(code).toContain('return []');
  });

  /**
   * LE CONTRÔLE QUI COMPTE VRAIMENT.
   *
   * Si ce `throw` disparaissait, une panne de `/api/internal/fiche` — 503 de
   * base, 404, réseau — finirait en exécution verte. La plateforme se tairait
   * sur ses propres ruptures, et personne ne le saurait avant qu'un marchand
   * appelle.
   */
  it('tout le reste leve encore', () => {
    expect(code).toContain('throw new Error');
  });

  /**
   * LE PIÈGE PAYÉ SUR L'EXÉCUTION 8074.
   *
   * n8n coupe un message levé depuis un nœud Code au premier deux-points et
   * range la tête dans `description` — champ que « Alerte erreurs plateforme »
   * ne lit pas. Le détail vient d'un corps JSON, qui en contient toujours un :
   * l'exploitant recevait la QUEUE du message seule, privée de ce qui la
   * nommait. Même famille que le retour à la ligne, qui ne laisse que
   * « Unknown error ».
   */
  it('le message reste lisible : ni retour a la ligne, ni deux-points', () => {
    expect(code).toMatch(/replace\(\/\[\\r\\n:\]\+\/g/);
  });
});
