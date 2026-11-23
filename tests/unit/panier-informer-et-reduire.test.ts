import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JOURS_PANIER_ABANDONNE } from '@/lib/conservation';
import { traitementsDuClient } from '@/lib/donneesPersonnelles';

/**
 * Le panier mesure avant l'envoi : informer, et reduire.
 *
 * CE QUI SE PASSE. Des qu'un numero valide est saisi, il part avec le panier
 * pour mesurer les commandes interrompues — avant que le client ait appuye sur
 * « Envoyer ». Releve par la critique de la vitrine du 23 novembre 2026.
 *
 * DEUX REGLES. Le client le lit LA OU IL SAISIT, pas dans un document qu'il
 * n'ouvrira pas. Et il ne part que ce qui sert a la mesure : le numero, pour
 * ne pas compter deux fois le meme client — pas le nom.
 */

const lire = (chemin: string) => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');
const route = lire('src/app/api/boutiques/[id]/panier/route.ts');

/** Le corps de l'appel a `/panier`, tel que la vitrine le compose. */
function corpsEnvoyeAuPanier(): string {
  const debut = vitrine.indexOf('fetch(`/api/boutiques/${slug}/panier`');
  expect(debut).toBeGreaterThan(-1);
  return vitrine.slice(debut, vitrine.indexOf('}).catch(', debut));
}

describe('il ne part que ce qui sert a la mesure', () => {
  it('la vitrine n’envoie pas le nom du client avant la commande', () => {
    const corps = corpsEnvoyeAuPanier();
    expect(corps).toContain('tel,');
    // `nom:` y reste legitime — c'est le nom de l'ARTICLE, dans chaque ligne.
    // Ce qui ne doit plus s'y trouver, c'est le nom du client, pose seul.
    expect(corps).not.toMatch(/^\s*nom,\s*$/m);
    expect(corps).not.toMatch(/\badresse\b|\binstructions\b/);
  });

  it('et un nom saisi apres coup ne relance pas l’envoi', () => {
    const fin = vitrine.indexOf('JSON.stringify(panier)]);');
    const dependances = vitrine.slice(vitrine.lastIndexOf('}, [', fin), fin);
    expect(dependances).toContain('telOk, tel, slug');
    expect(dependances).not.toMatch(/\bnom\b/);
  });

  it('LA ROUTE NE L’ENREGISTRE PAS, MEME S’IL ARRIVE', () => {
    // Une page gardee en cache par un navigateur l'envoie encore : c'est le
    // serveur qui tient la regle, pas la vitrine seule.
    expect(route).toMatch(/^\s*nom: null,\s*$/m);
    expect(route).not.toContain('corps.nom');
  });

  it('l’ecran des droits ne promet plus un nom qu’on ne garde pas', () => {
    const paniers = traitementsDuClient().find((t) => t.cle === 'paniers');
    expect(paniers).toBeDefined();
    expect(paniers!.donnees.join(' ')).not.toMatch(/nom/i);
    expect(paniers!.donnees.join(' ')).toMatch(/numéro/);
  });
});

describe('le client le lit la ou il saisit', () => {
  it('la mention dit ce qui est enregistre, pourquoi, et pour combien de temps', () => {
    expect(vitrine).toContain('Votre numéro et votre panier sont enregistrés dès la saisie');
    expect(vitrine).toContain('les commandes interrompues');
    expect(vitrine).toContain('{JOURS_PANIER_ABANDONNE} jours si vous ne commandez pas');
  });

  it('LA DUREE AFFICHEE EST CELLE QUE LA PURGE APPLIQUE', () => {
    // Un nombre recopie dans le texte finirait par diverger de la constante :
    // la page promettrait une duree que la tache nocturne ne tient pas.
    expect(vitrine).toContain("import { JOURS_PANIER_ABANDONNE } from '@/lib/conservation';");
    expect(vitrine).not.toMatch(/supprimés au bout de\s*\{' '\}\s*\d+ jours/);
    expect(JOURS_PANIER_ABANDONNE).toBe(30);
    const purge = lire('src/app/api/internal/conservation/route.ts');
    expect(purge).toContain('JOURS_PANIER_ABANDONNE');
  });

  it('elle mene a la politique de confidentialite', () => {
    const debut = vitrine.indexOf('Votre numéro et votre panier sont enregistrés');
    expect(vitrine.slice(debut, debut + 700)).toContain('href="/legal/confidentialite"');
  });

  it('elle n’apparait que la ou la mesure existe', () => {
    // Meme condition que l'envoi : annoncer un enregistrement qui n'a pas lieu
    // serait aussi faux que de le taire.
    const debut = vitrine.indexOf('Votre numéro et votre panier sont enregistrés');
    const avant = vitrine.slice(debut - 400, debut);
    expect(avant).toContain('{estMarchandSheets && (');
    expect(vitrine).toMatch(/if \(!estMarchandSheets \|\| !telOk \|\| lignes\.length === 0\) return;/);
  });
});

describe('un panier abouti ne survit pas a sa commande', () => {
  // L'ANGLE MORT. La purge ne visait que `converti_le IS NULL` : un panier qui
  // a abouti n'etait supprime par rien, et gardait le numero sans limite —
  // alors que la commande qu'il a produite finit par etre anonymisee.
  const purge = lire('src/app/api/internal/conservation/route.ts');
  const politique = lire('docs/legal/politique-confidentialite.md');

  it('la purge vise aussi les paniers aboutis, au meme delai', () => {
    expect(purge).toContain(".not('converti_le', 'is', null)");
    expect(purge).toContain(".lt('converti_le', seuilPanier)");
  });

  it('le delai court depuis la commande, pas depuis la creation du panier', () => {
    // Compte depuis `cree_le`, un panier ouvert il y a deux mois et converti
    // hier partirait le lendemain de la commande.
    const bloc = purge.slice(purge.indexOf('1 bis.'), purge.indexOf('── 2.'));
    expect(bloc).toContain(".lt('converti_le', seuilPanier)");
    expect(bloc).not.toContain("'cree_le'");
  });

  it('ils sont comptes a part des ventes perdues', () => {
    expect(purge).toContain('fait.paniersAboutis = data.length;');
    expect(purge).toMatch(/const fait = \{ paniers: 0, paniersAboutis: 0,/);
  });

  it('un essai a blanc ne supprime rien', () => {
    const bloc = purge.slice(purge.indexOf('1 bis.'), purge.indexOf('── 2.'));
    expect(bloc.indexOf('if (!essai) {')).toBeGreaterThan(-1);
    expect(bloc.indexOf('if (!essai) {')).toBeLessThan(bloc.indexOf('.delete()'));
  });

  it('LA POLITIQUE ANNONCE LA MEME REGLE QUE LE CODE', () => {
    // « Un document qui decrit une duree que le code n'applique pas est pire
    // que pas de document » — et l'inverse vaut autant.
    expect(politique).toContain('| Panier ayant abouti à une commande | 30 jours après la commande |');
    expect(JOURS_PANIER_ABANDONNE).toBe(30);
  });
});
