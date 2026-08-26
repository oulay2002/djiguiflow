import { describe, expect, it } from 'vitest';

/**
 * Les rapports de violation CSP : les lire, sans lire ce qu'on n'a pas demandé.
 *
 * POURQUOI CETTE ROUTE EXISTE. La politique était posée en `Report-Only` avec
 * l'intention écrite dans `next.config.ts` de « collecter les violations
 * réelles avant de basculer en mode bloquant ». Mais aucune directive
 * `report-uri` ni `report-to` ne l'accompagnait.
 *
 * Une politique en mode rapport SANS destinataire ne rapporte à personne. Les
 * violations partaient dans la console de chaque visiteur — que personne ne
 * lit, et surtout pas un client sur son téléphone. La politique ne bloquait
 * rien ET n'apprenait rien : elle ne pouvait donc jamais être basculée sur
 * preuve.
 *
 * DEUX EXIGENCES, ET LA SECONDE COMPTE AUTANT QUE LA PREMIÈRE :
 *
 * 1. Lire les deux formats. Les navigateurs n'envoient pas tous la même chose,
 *    et n'en comprendre qu'un revient à perdre les rapports d'un parc entier.
 * 2. NE JAMAIS JOURNALISER L'URL ENTIÈRE. Un `document-uri` porte la chaîne de
 *    requête, donc potentiellement un jeton de suivi ou de confirmation. Un
 *    journal de sécurité qui recopie des jetons est lui-même une fuite.
 */

/** Le format d'un rapport, tel que la route le lit. */
type Violation = Record<string, unknown>;

function extraire(charge: unknown): Violation[] {
  if (!charge || typeof charge !== 'object') return [];

  const ancien = (charge as { 'csp-report'?: unknown })['csp-report'];
  if (ancien && typeof ancien === 'object') return [ancien as Violation];

  if (Array.isArray(charge)) {
    return charge
      .map((r) => (r && typeof r === 'object' ? (r as { body?: unknown }).body : null))
      .filter((b): b is Violation => Boolean(b) && typeof b === 'object');
  }

  return [];
}

/** Ce que la route écrit réellement dans le journal. */
function ligneJournal(v: Violation): string {
  const directive = String(v['effective-directive'] ?? v['violated-directive'] ?? '?');
  const bloque = String(v['blocked-uri'] ?? '?');
  const page = String(v['document-uri'] ?? '?');

  let chemin = page;
  try {
    chemin = new URL(page).pathname;
  } catch {
    chemin = page.slice(0, 120);
  }

  return `CSP — violation sur ${chemin} : ${directive} a bloqué ${bloque.slice(0, 120)}`;
}

describe('rapports CSP — lire les deux formats', () => {
  it('lit l ancien format « csp-report »', () => {
    const v = extraire({
      'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'https://x.example/a.js' },
    });
    expect(v).toHaveLength(1);
    expect(v[0]['violated-directive']).toBe('script-src');
  });

  it('lit le nouveau format « reports+json »', () => {
    const v = extraire([
      { type: 'csp-violation', body: { 'effective-directive': 'img-src' } },
      { type: 'csp-violation', body: { 'effective-directive': 'font-src' } },
    ]);
    expect(v).toHaveLength(2);
    expect(v[1]['effective-directive']).toBe('font-src');
  });

  it.each([null, undefined, 'du texte', 42, {}, []])(
    'une charge inexploitable (%s) ne rend rien, sans lever',
    (charge) => {
      expect(extraire(charge)).toEqual([]);
    },
  );
});

describe('rapports CSP — ne pas journaliser ce qu on n a pas demande', () => {
  // LE CAS QUI COÛTE LE PLUS CHER. Un lien de suivi porte son jeton dans la
  // chaîne de requête ; le recopier dans un journal reviendrait à publier
  // l'accès à la commande d'un client dans les traces du serveur.
  it.each([
    ['un jeton de suivi', 'https://www.djiguiflow.com/suivi?jeton=abc123SECRET'],
    ['un jeton de confirmation', 'https://www.djiguiflow.com/confirmation?t=zzzSECRET'],
    ['un numero de telephone', 'https://www.djiguiflow.com/dashboard?tel=0102030405'],
  ])('%s ne survit pas au journal', (_nom, url) => {
    const ligne = ligneJournal({ 'document-uri': url, 'violated-directive': 'script-src' });
    expect(ligne).not.toMatch(/SECRET/);
    expect(ligne).not.toMatch(/0102030405/);
    // On vise les NOMS DE PARAMETRES, pas le point d'interrogation : celui-ci
    // apparait legitimement comme valeur de repli d'un `blocked-uri` absent.
    // Une premiere version de ce test interdisait « ? » tout court et echouait
    // sur un comportement correct — l'assertion trop large accuse le code a
    // tort, et on finit par relacher la regle au lieu du test.
    expect(ligne).not.toMatch(/jeton=|[?&]t=|tel=/);
  });

  it('le chemin, lui, est conserve — c est ce qui sert', () => {
    const ligne = ligneJournal({
      'document-uri': 'https://www.djiguiflow.com/boutiques/zahara?x=1',
      'effective-directive': 'img-src',
    });
    expect(ligne).toContain('/boutiques/zahara');
    expect(ligne).toContain('img-src');
  });

  it('une URL non analysable est tronquee, jamais rendue entiere', () => {
    const ligne = ligneJournal({ 'document-uri': 'a'.repeat(500) });
    expect(ligne.length).toBeLessThan(300);
  });

  it('une ressource bloquee tres longue est bornee', () => {
    const ligne = ligneJournal({
      'document-uri': 'https://www.djiguiflow.com/x',
      'blocked-uri': 'https://mechant.example/' + 'b'.repeat(400),
    });
    expect(ligne.length).toBeLessThan(300);
  });
});
