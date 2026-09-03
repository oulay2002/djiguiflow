import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assainirPourTelegram, LONGUEUR_MAX_ALERTE } from '@/lib/alerteTelegram';

/**
 * L'ALERTE QUI TOMBE PARCE QU'ELLE PARLE DE CE QU'ELLE DOIT SIGNALER.
 *
 * ── CE QUE C'EST DÉJÀ ARRIVÉ ───────────────────────────────────────────────
 *
 * 10 août 2026, exécutions 4135 et 4136 : le nœud Telegram interprète son texte
 * comme du Markdown. Le nom `Commandes_Zahara` ouvrait une italique jamais
 * fermée, et Telegram répondait `can't parse entities` à l'octet 120.
 * **L'alerte de la panne du Routeur WhatsApp n'est jamais partie.**
 *
 * `alerte-erreurs-plateforme` a été corrigé le 12 août. La consigne écrite
 * alors — « toute nouvelle alerte partant vers Telegram doit passer par le même
 * traitement » — n'a jamais été appliquée à la **veille des chaînes**.
 *
 * ── CE QUE ÇA COÛTERAIT AUJOURD'HUI ────────────────────────────────────────
 *
 * La veille injecte, dans `compte-sans-boutique`, **l'adresse e-mail de
 * l'inscrit** et le texte libre qu'il a saisi. Une adresse contenant un `_` —
 * il y en a partout — ferait échouer l'alerte qui existe précisément pour ne
 * pas rater un inscrit.
 *
 * Et le dossier est perdu pour de bon : l'anomalie est écrite dans
 * `anomalies_signalees` par la route AVANT que n8n compose son message. Au
 * passage suivant, `nouvelles` vaut 0 — elle ne sera **plus jamais** annoncée.
 *
 * ── POURQUOI CE JEU DE CARACTÈRES, ET PAS CELUI DU WORKFLOW CORRIGÉ ────────
 *
 * `alerte-erreurs-plateforme` efface un jeu bien plus large, points et tirets
 * compris. C'était de la prudence, et elle avait un coût qu'on ne mesurait pas
 * alors : elle **mutile les adresses**. `jean_dupont@gmail.com` y deviendrait
 * `jean dupont@gmail com`, que l'exploitant ne peut plus recopier — sur
 * l'alerte dont le seul but est de rappeler quelqu'un.
 *
 * Ne sont donc retirés que les caractères qui cassent réellement le parseur
 * Markdown historique, celui-là même qui a produit l'incident.
 */

describe('les caracteres qui font tomber l alerte', () => {
  it('le cas temoin du 10 aout : un _ dans un nom', () => {
    expect(assainirPourTelegram('Commandes_Zahara')).toBe('Commandes Zahara');
  });

  it('une etoile, un accent grave, des crochets', () => {
    expect(assainirPourTelegram('Mode*Star')).toBe('Mode Star');
    expect(assainirPourTelegram('un `code`')).toBe('un code');
    expect(assainirPourTelegram('voir [ici]')).toBe('voir ici');
  });
});

/**
 * CE QU'IL FAUT ABSOLUMENT PRÉSERVER.
 *
 * L'alerte existe pour qu'un humain AGISSE : rappeler une personne, ouvrir une
 * page. Une adresse ou un chemin mutilé rend l'alerte présente et inutile —
 * exactement le genre de demi-succès que ce dépôt traque.
 */
describe('ce qui doit survivre, parce que l exploitant s en sert', () => {
  it('une adresse e-mail reste recopiable', () => {
    expect(assainirPourTelegram('jean_dupont@gmail.com')).toBe('jean dupont@gmail.com');
  });

  it('les points, tirets, parentheses et chemins sont intacts', () => {
    const texte = 'Elle repond a 1 question(s) sur 5. Remplir depuis /dashboard/ma-boutique.';
    expect(assainirPourTelegram(texte)).toBe(texte);
  });

  it('un numero de telephone garde sa forme', () => {
    expect(assainirPourTelegram('+225 01 02 91 88 86')).toBe('+225 01 02 91 88 86');
  });
});

describe('la forme du texte rendu', () => {
  it('ecrase les espaces multiples nes du remplacement', () => {
    expect(assainirPourTelegram('a __ b')).toBe('a b');
  });

  it('rend une chaine vide sur une absence, jamais « undefined »', () => {
    expect(assainirPourTelegram(null)).toBe('');
    expect(assainirPourTelegram(undefined)).toBe('');
  });

  /**
   * Telegram refuse au-delà de 4 096 caractères, et l'alerte empile plusieurs
   * anomalies. Une seule qui déborde ferait tomber le message ENTIER, donc
   * toutes les autres avec elle.
   */
  it('borne un detail trop long, et le dit', () => {
    const rendu = assainirPourTelegram('x'.repeat(LONGUEUR_MAX_ALERTE + 500));
    expect(rendu.length).toBeLessThanOrEqual(LONGUEUR_MAX_ALERTE);
    expect(rendu.endsWith('…')).toBe(true);
  });

  it('ne touche pas a un texte deja court et propre', () => {
    expect(assainirPourTelegram('Rose Monde')).toBe('Rose Monde');
  });
});

/**
 * LE GARDE QUI RELIT LA VEILLE.
 *
 * La fonction peut être parfaite : si la route ne l'appelle pas, rien ne
 * change. C'est le défaut du 2 septembre, où `porteSupport` était éprouvée et
 * mal appelée.
 */
describe('la veille assainit ce qu elle rend', () => {
  const VEILLE = readFileSync('src/app/api/internal/veille/chaines/route.ts', 'utf8');

  it('elle importe la fonction', () => {
    expect(VEILLE).toContain("from '@/lib/alerteTelegram'");
  });

  /**
   * LES TROIS CHAMPS, PAS DEUX.
   *
   * La première version de ce contrôle se contentait de trouver
   * `assainirPourTelegram(` quelque part dans le fichier. Retirer
   * l'assainissement de la SEULE `reference` le laissait vert — les deux autres
   * appels suffisaient à le satisfaire. Trouvé en le mutant, pas en le
   * relisant.
   */
  it('les trois champs qui partent vers Telegram sont assainis', () => {
    for (const champ of ['a.reference', 'a.boutique', 'a.detail']) {
      expect(VEILLE).toContain(`assainirPourTelegram(${champ})`);
    }
  });

  /**
   * ⚠ L'ORDRE EST TOUT — et c'est le piège de ce correctif.
   *
   * `reference` est la CLÉ PRIMAIRE de `anomalies_signalees`. L'assainir avant
   * l'insertion changerait la clé : le « une fois puis silence » ne
   * reconnaîtrait plus le dossier déjà annoncé et redirait la même anomalie à
   * chaque passage. L'assainissement doit donc venir APRÈS l'écriture.
   */
  it('rien n est assaini DANS l ecriture en base', () => {
    const debut = VEILLE.indexOf("from('anomalies_signalees')");
    const fin = VEILLE.indexOf(".select('reference, type')", debut);
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);

    // Comparer deux `indexOf` ne suffisait pas : glisser l'appel DANS le
    // `upsert` — donc après le premier index — laissait le contrôle vert alors
    // que la clé primaire changeait. C'est le corps de l'écriture qu'il faut
    // lire, pas sa position.
    expect(VEILLE.slice(debut, fin)).not.toContain('assainirPourTelegram');
  });
});
