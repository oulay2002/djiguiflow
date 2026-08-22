import { afterEach, describe, expect, it } from 'vitest';
import { bacASableAccepte } from '@/lib/billing/encaissement';

/**
 * Un paiement de bac a sable ne doit JAMAIS ouvrir un acces en production.
 *
 * Le 22 aout 2026, `GENIUSPAY_ACCEPTE_SANDBOX` valait « 1 » sur le deploiement
 * de production, ou la cle GeniusPay est justement une cle de bac a sable. La
 * chaine etait complete : s'inscrire — l'inscription est libre — demander un
 * paiement, le « regler » dans le bac a sable, et repartir avec un abonnement
 * Pro reel. Le controle du montant ne protege rien : l'argent du bac a sable
 * n'existe pas.
 *
 * La regle est donc dans le CODE et non dans une variable : une variable posee
 * pour eprouver la chaine survit au test qui l'a justifiee.
 */
// IMPORTEE, jamais recopiee : un test qui redit la regle dans ses propres mots
// passe au vert meme quand le code fait le contraire.
function decider(vercelEnv: string | undefined, drapeau: string | undefined): boolean {
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  if (drapeau === undefined) delete process.env.GENIUSPAY_ACCEPTE_SANDBOX;
  else process.env.GENIUSPAY_ACCEPTE_SANDBOX = drapeau;
  return bacASableAccepte();
}

const initial = { env: process.env.VERCEL_ENV, flag: process.env.GENIUSPAY_ACCEPTE_SANDBOX };
afterEach(() => {
  process.env.VERCEL_ENV = initial.env;
  process.env.GENIUSPAY_ACCEPTE_SANDBOX = initial.flag;
});

describe('le bac a sable et la production', () => {
  // LE TEST QUI COMPTE. Meme drapeau, meme valeur, resultat oppose.
  it('refuse en production, MEME avec le drapeau pose', () => {
    expect(decider('production', '1')).toBe(false);
  });

  it('accepte en preproduction avec le drapeau', () => {
    expect(decider('preview', '1')).toBe(true);
  });

  it('refuse partout sans le drapeau', () => {
    expect(decider('preview', undefined)).toBe(false);
    expect(decider('production', undefined)).toBe(false);
  });

  // Une valeur approchante n'est pas la valeur. « true », « oui », « 1 » avec
  // une espace : rien de tout cela n'ouvre la porte.
  it('exige exactement « 1 »', () => {
    for (const valeur of ['true', 'oui', ' 1', 'yes', '0']) {
      expect(decider('preview', valeur)).toBe(false);
    }
  });
});
