import { describe, expect, it, vi } from 'vitest';

/**
 * Le lien envoye au client porte-t-il son jeton ?
 *
 * CE QUI SE PERD SANS CE TEST. Le jeton est un parametre d'URL construit par
 * concatenation : le retirer ne casse rien, ne leve rien, et ne fait echouer
 * aucun autre test. Le lien continue de fonctionner — c'est bien le probleme.
 * Il redevient simplement devinable, et deviner une reference permet d'ANNULER
 * la commande d'un inconnu.
 *
 * La base porte des references sequentielles (`ATT-1000000006`) et des formes
 * batie sur le telephone du client (`APP-<telephone>-<horodatage unix>`) : la
 * reference seule n'a jamais ete une preuve.
 */

vi.mock('@/lib/canaux', () => ({ envoyerMessage: async () => ({ ok: true, via: 'marchand' }) }));
vi.mock('@/lib/supabaseAdmin', () => ({ getSupabaseAdmin: () => null }));

const { messageRelance } = await import('@/app/api/internal/commandes/abandons/route');

const ligne = (surcharges: Record<string, unknown> = {}) =>
  ({
    reference: 'ATT-1000000006',
    jeton_suivi: '14c4a9537efc462187eea030ea990e67',
    client_nom: 'Awa Traore',
    chat_id: '2250700000000',
    client_telephone: '2250700000000',
    total: 12500,
    canal: 'whatsapp',
    created_at: '2026-08-22T09:00:00.000Z',
    boutiques: { slug: 'boutique-test', nom: 'Chez Test' },
    ...surcharges,
  }) as Parameters<typeof messageRelance>[0];

describe('le lien de confirmation', () => {
  it('porte le jeton de la commande', () => {
    const texte = messageRelance(ligne());
    expect(texte).toContain('t=14c4a9537efc462187eea030ea990e67');
  });

  it('porte aussi la reference, que le jeton ne remplace pas', () => {
    // Le jeton prouve ; la reference designe. La route a besoin des deux.
    expect(messageRelance(ligne())).toContain('ref=ATT-1000000006');
  });

  it('encode le jeton, pour qu’un caractere ne tronque pas l’URL', () => {
    const texte = messageRelance(ligne({ jeton_suivi: 'a b&c' }));
    expect(texte).toContain('t=a%20b%26c');
    expect(texte).not.toContain('t=a b&c');
  });

  it('reste utilisable quand le jeton manque', () => {
    // Les commandes creees avant la migration n'en ont pas. Le lien doit rester
    // valide : les routes publiques tolerent encore l'absence de jeton, et un
    // client en cours de livraison ne doit pas voir son lien casser.
    const texte = messageRelance(ligne({ jeton_suivi: null }));
    expect(texte).toContain('ref=ATT-1000000006');
    expect(texte).not.toContain('t=');
    expect(texte).not.toContain('undefined');
    expect(texte).not.toContain('null');
  });
});

describe('ce que le message ne promet plus', () => {
  it('n’annonce plus deux liens opposes qui menaient au meme endroit', () => {
    // Le message portait « ✅ Je confirme : <lien> » et « ❌ J'annule : <lien> »
    // avec la MEME URL : le parametre `r` cense les distinguer n'etait plus lu
    // depuis que le GET a cesse d'ecrire. Le client lisait une promesse fausse.
    const texte = messageRelance(ligne());
    const liens = texte.match(/https:\/\/www\.djiguiflow\.com\/api\/confirmation[^\s]*/g) ?? [];
    expect(liens).toHaveLength(1);
    expect(texte).not.toContain('&r=oui');
    expect(texte).not.toContain('&r=non');
  });

  it('dit ce que la page fera vraiment', () => {
    expect(messageRelance(ligne())).toContain('Confirmer ou annuler');
  });
});

describe('ce que le message doit toujours dire', () => {
  it('nomme la boutique, la reference et le montant', () => {
    const texte = messageRelance(ligne());
    expect(texte).toContain('Chez Test');
    expect(texte).toContain('ATT-1000000006');
    // `toLocaleString('fr-FR')` separe les milliers par une espace INSECABLE
    // ETROITE (U+202F), pas par une espace ordinaire. Comparer a « 12 500 »
    // tape au clavier echoue alors que le message est juste.
    expect(texte).toMatch(/12\s500\sF/u);
  });

  it('n’utilise que le prenom du client', () => {
    // « Awa Traore, votre commande… » sonne administratif. Le prenom suffit.
    const texte = messageRelance(ligne());
    expect(texte).toContain('Awa,');
    expect(texte).not.toContain('Awa Traore,');
  });

  it('annonce la suite sans mettre le client sous pression', () => {
    expect(messageRelance(ligne())).toContain('vous pourrez toujours recommander');
  });
});
