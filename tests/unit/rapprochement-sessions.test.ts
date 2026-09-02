import { describe, expect, it } from 'vitest';
import { rapprocherSessions, valeursTexte, verdictWebhook } from '@/lib/rapprochementSessions';

/** La forme reelle : n8n n'enregistre QUE celle qui porte l'uuid du noeud. */
const ATTENDUE = 'https://n8n.djiguiflow.com/webhook/1b96720c/whatsapp/rose-monde';
/** La forme courte. Elle repond 404, et un 404 ressemble a un refus poli. */
const COURTE = 'https://n8n.djiguiflow.com/webhook/whatsapp/rose-monde';

/**
 * Ce qu'on paie face a ce que la base reclame.
 *
 * CE QUE CE BANC PROTEGE AVANT TOUT : qu'une ligne VIVANTE ne soit jamais
 * declaree orpheline. L'erreur dans ce sens-la ne coute pas une fausse alerte,
 * elle conduit a supprimer le canal WhatsApp d'un marchand qui vend. L'erreur
 * inverse — manquer une place perdue — coute quelques milliers de francs par
 * mois. Les deux ne se valent pas, et les cas ci-dessous le refletent.
 */

const ZAHARA = {
  slug: 'zahara',
  nom: 'Zahara',
  telephone: '0102918886',
  // BRANCHEE A LA MAIN, avant le libre-service : jeton au coffre, aucun
  // identifiant de session en base. C'est le cas reel au 2 septembre 2026.
  wasender_session_id: null,
};

const ROSE = {
  slug: 'rose-monde',
  nom: 'Rose Monde',
  telephone: '0700112233',
  wasender_session_id: 'sess-rose-42',
};

describe('valeursTexte — on ne parie sur aucun nom de champ', () => {
  it('ramasse les chaines a tous les niveaux', () => {
    const v = valeursTexte({ a: 'un', b: { c: 'deux', d: [{ e: 'trois' }] } });
    expect(v).toEqual(expect.arrayContaining(['un', 'deux', 'trois']));
  });

  it('convertit les nombres — un numero arrive parfois en entier', () => {
    // Le manquer ferait paraitre orpheline une ligne parfaitement rattachee.
    expect(valeursTexte({ phone: 2250102918886 })).toEqual(['2250102918886']);
  });

  it('ignore le vide et les blancs', () => {
    expect(valeursTexte({ a: '', b: '   ', c: null, d: undefined })).toEqual([]);
  });

  it('ne se perd pas dans une charge utile profonde', () => {
    let profond: Record<string, unknown> = { v: 'fond' };
    for (let i = 0; i < 40; i++) profond = { n: profond };
    expect(() => valeursTexte(profond)).not.toThrow();
  });
});

describe('rapprochement — une ligne vivante n est jamais orpheline', () => {
  it('LE CAS ZAHARA : rattachee par son NUMERO, sans aucun identifiant en base', () => {
    // Un rapprochement par identifiant seul la declarerait orpheline et
    // proposerait de couper le canal d'une boutique qui vend.
    const r = rapprocherSessions(
      [{ id: 'sess-inconnue-du-depot', phone_number: '2250102918886', status: 'connected' }],
      [ZAHARA],
    );
    expect(r.orphelines).toEqual([]);
    expect(r.rattachees).toBe(1);
  });

  it('rattachee par son identifiant quand la base le porte', () => {
    const r = rapprocherSessions([{ id: 'sess-rose-42', status: 'connected' }], [ROSE]);
    expect(r.orphelines).toEqual([]);
    expect(r.fantomes).toEqual([]);
    expect(r.rattachees).toBe(1);
  });

  it('le numero est compare STRICTEMENT : 01… et 07… ne sont pas la meme personne', () => {
    // Les huit derniers chiffres concordent, les abonnes non. Un appariement
    // laxiste masquerait une place perdue en la creditant a un innocent.
    const r = rapprocherSessions(
      [{ phone_number: '2250702918886', status: 'connected' }],
      [ZAHARA],
    );
    expect(r.orphelines).toEqual(['2250702918886']);
    expect(r.rattachees).toBe(0);
  });

  it('une enseigne retiree de la vitrine RECLAME quand meme sa ligne', () => {
    // Elle est passee avec `surveillee: false` : elle se tait pour l'alerte,
    // elle compte pour le rattachement. Ne pas la passer du tout ferait
    // declarer sa session orpheline.
    const r = rapprocherSessions(
      [{ id: 'sess-rose-42', status: 'connected' }],
      [{ ...ROSE, surveillee: false }],
    );
    expect(r.orphelines).toEqual([]);
    expect(r.rattachees).toBe(1);
  });
});

describe('rapprochement — ce qu on paie pour rien', () => {
  it('nomme la ligne qu aucune boutique ne reclame', () => {
    const r = rapprocherSessions(
      [
        { id: 'sess-rose-42', status: 'connected' },
        { id: 'sess-fantome', phone_number: '2250500000099', status: 'connected' },
      ],
      [ROSE],
    );
    expect(r.orphelines).toEqual(['2250500000099']);
    expect(r.rattachees).toBe(1);
  });

  it('une ligne sans numero lisible n est PAS orpheline — elle est comptee a part', () => {
    // « Je ne sais pas a qui elle est » et « elle n'est a personne » sont deux
    // choses differentes. Les confondre ferait supprimer une ligne au hasard
    // le jour ou le fournisseur renomme un champ.
    const r = rapprocherSessions([{ statut: 'connected', libelle: 'ligne' }], [ROSE]);
    expect(r.orphelines).toEqual([]);
    expect(r.illisibles).toBe(1);
    expect(r.rattachees).toBe(0);
  });
});

describe('rapprochement — la boutique qui se croit branchee', () => {
  it('signale celle dont la ligne a disparu du compte', () => {
    // Le plus grave des deux sens : son tableau de bord dit « connectee », ses
    // messages ne partiront pas, et aucune autre sonde ne le voit.
    const r = rapprocherSessions([], [ROSE]);
    expect(r.fantomes).toEqual(['Rose Monde']);
  });

  it('se tait pour une enseigne retiree de la vitrine', () => {
    expect(rapprocherSessions([], [{ ...ROSE, surveillee: false }]).fantomes).toEqual([]);
  });

  it('ne signale pas celle qui n a jamais eu d identifiant', () => {
    // Zahara n'en a pas : elle n'est pas fantome, elle est branchee autrement.
    expect(rapprocherSessions([], [ZAHARA]).fantomes).toEqual([]);
  });

  it('l identifiant peut vivre sous n importe quel nom de champ', () => {
    const r = rapprocherSessions([{ session: { reference: 'sess-rose-42' } }], [ROSE]);
    expect(r.fantomes).toEqual([]);
  });
});

describe('le temoin de l instrument', () => {
  it('compte ce qu il a su relier, pour qu un silence ne se confonde pas avec une cecite', () => {
    const r = rapprocherSessions(
      [
        { id: 'sess-rose-42', status: 'connected' },
        { phone_number: '2250102918886', status: 'connected' },
        { libelle: 'sans identite' },
        { phone_number: '2250500000099' },
      ],
      [ZAHARA, ROSE],
    );
    expect(r.rattachees).toBe(2);
    expect(r.illisibles).toBe(1);
    expect(r.orphelines).toHaveLength(1);
    // Le total se recompose : rien n'est perdu en route.
    expect(r.rattachees + r.illisibles + r.orphelines.length).toBe(4);
  });
});

/**
 * « Connectee » dit que WhatsApp a lie l'appareil du marchand. Cela ne dit rien
 * de la question qui compte : les messages de ses clients nous parviennent-ils ?
 */
describe('le chemin entrant — connectee ne veut pas dire joignable', () => {
  it('conforme quand le webhook vise bien le routeur', () => {
    expect(verdictWebhook({ webhook_url: ATTENDUE }, ATTENDUE).verdict).toBe('conforme');
  });

  it('une barre finale de plus ne change pas la destination', () => {
    expect(verdictWebhook({ webhook_url: `${ATTENDUE}/` }, ATTENDUE).verdict).toBe('conforme');
  });

  it('LE PIEGE DE n8n : la forme courte est DIVERGENTE, pas conforme', () => {
    // Elle ressemble a la bonne adresse et repond 404. Une ligne declaree a la
    // main peut donc etre parfaitement connectee et parfaitement sourde.
    const v = verdictWebhook({ webhook_url: COURTE }, ATTENDUE);
    expect(v.verdict).toBe('divergent');
    expect(v.vue).toBe(COURTE);
  });

  it('une adresse qui ne nous designe pas n est PAS une divergence', () => {
    // Une session porte parfois un avatar ou une documentation. Les compter
    // ferait une alerte a chaque ligne saine.
    expect(verdictWebhook({ avatar: 'https://exemple.test/photo.png' }, ATTENDUE).verdict)
      .toBe('illisible');
  });

  it('aucune adresse lisible : illisible, jamais divergent', () => {
    // Rien ne garantit que le fournisseur rende le webhook quand on relit une
    // session. Ne pas le trouver n'est pas la preuve qu'il n'y en a pas.
    expect(verdictWebhook({ status: 'connected' }, ATTENDUE).verdict).toBe('illisible');
  });

  it('l adresse peut vivre sous n importe quel nom de champ', () => {
    expect(verdictWebhook({ hooks: { entrant: { cible: ATTENDUE } } }, ATTENDUE).verdict)
      .toBe('conforme');
  });
});

describe('le chemin entrant, vu du rapprochement', () => {
  const attendue = (b: { slug: string }) =>
    `https://n8n.djiguiflow.com/webhook/1b96720c/whatsapp/${b.slug}`;

  it('nomme la boutique ET l adresse vue, pour que l alerte soit actionnable', () => {
    const r = rapprocherSessions(
      [{ id: 'sess-rose-42', status: 'connected', webhook_url: COURTE }],
      [ROSE],
      attendue,
    );
    expect(r.rattachees).toBe(1);
    expect(r.webhooks?.divergents).toEqual([`Rose Monde → ${COURTE}`]);
    expect(r.webhooks?.conformes).toBe(0);
  });

  it('juge aussi la ligne rattachee par son NUMERO — le cas Zahara', () => {
    // C'est justement celle qui a ete declaree a la main, donc la plus
    // susceptible de viser la mauvaise porte.
    const r = rapprocherSessions(
      [{ phone_number: '2250102918886', status: 'connected', webhook_url: attendue(ZAHARA) }],
      [ZAHARA],
      attendue,
    );
    expect(r.webhooks?.divergents).toEqual([]);
    expect(r.webhooks?.conformes).toBe(1);
  });

  it('L ADRESSE EST PROPRE A CHAQUE BOUTIQUE — le slug en fait partie', () => {
    // Une ligne dont le webhook porte le slug du VOISIN est connectee, et ses
    // messages atterrissent chez lui. C'est la fuite entre marchands, par le
    // chemin entrant cette fois.
    const r = rapprocherSessions(
      [{ phone_number: '2250102918886', status: 'connected', webhook_url: attendue(ROSE) }],
      [ZAHARA],
      attendue,
    );
    expect(r.webhooks?.divergents).toEqual([`Zahara → ${attendue(ROSE)}`]);
  });

  it('sans adresse attendue, le chemin entrant n est PAS juge', () => {
    // La regle vit chez l'appelant. Un `webhooks` invente a zero se lirait
    // « tout va bien » alors que rien n'a ete regarde.
    const r = rapprocherSessions([{ id: 'sess-rose-42' }], [ROSE]);
    expect(r.webhooks).toBeUndefined();
  });

  it('une ligne orpheline n est pas jugee sur son webhook', () => {
    // Elle n'appartient a aucune boutique : il n'y a pas d'adresse attendue.
    const r = rapprocherSessions([{ phone_number: '2250500000099' }], [ROSE], attendue);
    expect(r.orphelines).toHaveLength(1);
    expect(r.webhooks?.conformes).toBe(0);
    expect(r.webhooks?.divergents).toEqual([]);
  });
});

/**
 * DEUX BOUTIQUES SOUS LE MEME NUMERO — le cas qui a fait crier l'instrument a
 * tort le 2 septembre 2026, en production, des sa premiere mesure.
 *
 * Un compte a le droit de posseder plusieurs enseignes, et le gerant en
 * exploite deux sous le sien. « La premiere trouvee » attribuait la ligne au
 * hasard, et l'adresse attendue differait forcement.
 */
describe('quand deux boutiques partagent un numero', () => {
  const attendue = (b: { slug: string }) =>
    `https://n8n.djiguiflow.com/webhook/1b96720c/whatsapp/${b.slug}`;

  const JUMELLES = [
    { slug: 'rose-monde', nom: 'Rose Monde', telephone: '0102918886', wasender_session_id: null },
    { slug: 'zahara', nom: 'Zahara', telephone: '0102918886', wasender_session_id: null },
  ];

  it('le webhook TRANCHE l ambiguite que le numero laisse', () => {
    // La ligne est celle de Zahara ; Rose Monde apparait d'abord dans la
    // liste. Sans cette regle, l'instrument accusait Rose Monde.
    const r = rapprocherSessions(
      [{ phone_number: '2250102918886', status: 'connected', webhook_url: attendue({ slug: 'zahara' }) }],
      JUMELLES,
      attendue,
    );
    expect(r.webhooks?.divergents).toEqual([]);
    expect(r.webhooks?.conformes).toBe(1);
  });

  it('aucun pretendant conforme : on se TAIT plutot que d accuser au hasard', () => {
    const r = rapprocherSessions(
      [{ phone_number: '2250102918886', status: 'connected', webhook_url: COURTE }],
      JUMELLES,
      attendue,
    );
    expect(r.webhooks?.divergents).toEqual([]);
    expect(r.webhooks?.illisibles).toBe(1);
  });

  it('temoin : avec UN SEUL pretendant, la divergence est bien nommee', () => {
    // Sans lui, « ne crie pas » serait vrai d'un instrument devenu muet.
    const r = rapprocherSessions(
      [{ phone_number: '2250102918886', status: 'connected', webhook_url: COURTE }],
      [JUMELLES[1]],
      attendue,
    );
    expect(r.webhooks?.divergents).toEqual([`Zahara → ${COURTE}`]);
  });
});
