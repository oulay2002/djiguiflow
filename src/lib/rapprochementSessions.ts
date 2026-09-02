import { memeNumero } from '@/lib/telephone';

/**
 * CE QU'ON PAIE, FACE A CE QUE LA BASE RECLAME.
 *
 * ── LE TROU QUE CE FICHIER FERME ───────────────────────────────────────────
 *
 * `inventaireSessions` compte les lignes du compte wasender et nomme celles
 * qui sont deconnectees. Son propre en-tete dit le reste : « une session
 * abandonnee, rattachee a aucune boutique, est invisible et se facture tous
 * les mois ». Elle le NOMMAIT sans le voir — compter n'est pas rapprocher.
 *
 * Le forfait est plafonne. Une place qui dort n'est donc pas seulement de
 * l'argent : c'est un marchand qu'on ne pourra pas brancher, et l'exploitant
 * ne l'apprend que le jour ou il manque une place — c'est-a-dire au pire
 * moment, devant un marchand qui attend.
 *
 * ── DEUX DIRECTIONS, ET LA SECONDE EST LA PLUS GRAVE ───────────────────────
 *
 * - ORPHELINE : le compte facture une ligne qu'aucune boutique ne reclame.
 *   Cela coute de l'argent et une place. Personne n'en souffre aujourd'hui.
 * - FANTOME : une boutique porte un identifiant de session que le compte ne
 *   connait plus. Le marchand se croit branche ; ses messages ne partiront
 *   pas, et rien d'autre ne le dit — `santeSessionWhatsApp` interroge le
 *   jeton du coffre, pas l'existence de la ligne.
 *
 * ── ON NE DEVINE AUCUN NOM DE CHAMP ────────────────────────────────────────
 *
 * Le jeton de compte est « Sensitive » chez Vercel : la forme exacte des
 * sessions rendues par wasender n'est pas observable depuis un poste de
 * developpement. Parier sur `phone_number` ou sur `id`, c'est risquer que
 * TOUTES les sessions paraissent orphelines le jour ou le fournisseur renomme
 * un champ — et proposer de supprimer la ligne d'un marchand qui vend.
 *
 * On balaie donc TOUTES les valeurs texte de la session et l'on cherche une
 * connaissance : un identifiant que la base porte, ou un numero qu'elle
 * connait. Cela ne depend d'aucun nom de champ, et survit a un renommage.
 *
 * ── UN DOUTE N'EST JAMAIS UNE CERTITUDE ────────────────────────────────────
 *
 * Une session dont on n'a su lire AUCUN numero n'est pas declaree orpheline :
 * elle est comptee a part. « Je ne sais pas a qui elle est » et « elle n'est a
 * personne » sont deux choses differentes, et les confondre ferait supprimer
 * une ligne vivante. Meme discipline que `santeSessionWhatsApp`, qui distingue
 * `deconnectee` d'`indetermine`.
 */

export type BoutiqueBranchee = {
  slug: string;
  nom?: string | null;
  telephone?: string | null;
  wasender_session_id?: string | null;
  /**
   * `false` pour une boutique dont on ne veut pas entendre parler — une
   * enseigne retiree de la vitrine, par exemple.
   *
   * ELLE RECLAME QUAND MEME SA LIGNE. C'est toute la subtilite : ne pas la
   * passer du tout ferait declarer sa session ORPHELINE, et proposer de
   * supprimer le canal d'un marchand qui n'est que temporairement retire. Elle
   * compte donc pour le rattachement, et se tait pour l'alerte.
   */
  surveillee?: boolean;
};

/**
 * LE CHEMIN ENTRANT, QUE PERSONNE NE VERIFIAIT.
 *
 * « Connectee » dit que WhatsApp a lie l'appareil du marchand. Cela ne dit
 * RIEN de la question qui compte : les messages de ses clients nous
 * parviennent-ils ? Entre les deux il y a un webhook, et sa declaration vit
 * chez le fournisseur — pas chez nous.
 *
 * Le piege est ecrit dans `routeurWhatsApp.ts` : n8n sert le webhook sous
 * `/webhook/<uuid>/<chemin>` ET sous `/webhook/<chemin>`, mais SEULE la
 * premiere est enregistree. La seconde rend 404, « et un 404 ressemble a un
 * refus poli ». Une ligne declaree a la main, avant que ce fichier n'existe,
 * peut donc etre parfaitement connectee et parfaitement sourde.
 *
 * TROIS VERDICTS, PAS DEUX. `illisible` existe parce que rien ne garantit que
 * le fournisseur rende l'adresse du webhook quand on relit une session. Ne pas
 * la trouver n'est pas la preuve qu'il n'y en a pas — c'est l'aveu qu'on n'a
 * pas su lire, et il se compte plutot qu'il ne se tait.
 */
export type VerdictWebhook = 'conforme' | 'divergent' | 'illisible';

export function verdictWebhook(
  session: unknown,
  attendue: string,
): { verdict: VerdictWebhook; vue?: string } {
  // Une barre finale de plus ou de moins ne change pas la destination.
  const nu = (u: string) => u.trim().replace(/\/+$/, '');
  const cible = nu(attendue);
  if (!cible) return { verdict: 'illisible' };

  const adresses = valeursTexte(session).filter((v) => /^https?:\/\//i.test(v));
  if (adresses.some((a) => nu(a) === cible)) return { verdict: 'conforme' };

  /**
   * ON NE CRIE QUE SUR CE QUI NOUS DESIGNE. Une session porte parfois d'autres
   * adresses — un avatar, une documentation. Les compter comme un webhook
   * divergent ferait une alerte a chaque ligne saine.
   *
   * Une adresse qui vise NOTRE hote sans etre la bonne, en revanche, est un
   * webhook, et il se trompe de porte.
   */
  let hote = '';
  try {
    hote = new URL(cible).host;
  } catch {
    return { verdict: 'illisible' };
  }

  const suspecte = adresses.find((a) => {
    try {
      return new URL(a).host === hote;
    } catch {
      return false;
    }
  });

  return suspecte ? { verdict: 'divergent', vue: nu(suspecte) } : { verdict: 'illisible' };
}

export type Rapprochement = {
  /** Lignes facturees qu'aucune boutique ne reclame — a verifier, puis liberer. */
  orphelines: string[];
  /** Boutiques dont la ligne a disparu du compte : elles se croient branchees. */
  fantomes: string[];
  /**
   * Lignes dont on n'a lu aucun numero. NI saines NI orphelines : un nombre,
   * pour que le silence de cet instrument reste distinguable de son ignorance.
   */
  illisibles: number;
  /** Lignes rattachees a une boutique. C'est le temoin de l'instrument. */
  rattachees: number;
  /**
   * Le chemin ENTRANT des lignes rattachees. Absent quand l'appelant n'a pas
   * fourni l'adresse attendue — la regle vit chez lui, pas ici.
   */
  webhooks?: {
    conformes: number;
    /** « boutique → adresse vue », pour que l'alerte soit actionnable. */
    divergents: string[];
    illisibles: number;
  };
};

/** Au-dela, on ne descend plus : une charge utile pathologique ne doit pas nous retenir. */
const PROFONDEUR_MAX = 4;
/** Meme raison. Une session n'a pas cent champs. */
const VALEURS_MAX = 200;

/**
 * Toutes les chaines non vides d'un objet, quelle que soit sa forme.
 *
 * Les nombres sont convertis : un numero de telephone arrive parfois en
 * entier, et le manquer ferait paraitre orpheline une ligne parfaitement
 * rattachee.
 */
export function valeursTexte(valeur: unknown, profondeur = 0): string[] {
  if (profondeur > PROFONDEUR_MAX) return [];

  if (typeof valeur === 'string') {
    const v = valeur.trim();
    return v ? [v] : [];
  }
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return [String(valeur)];
  if (!valeur || typeof valeur !== 'object') return [];

  const sortie: string[] = [];
  for (const v of Object.values(valeur as Record<string, unknown>)) {
    if (sortie.length >= VALEURS_MAX) break;
    sortie.push(...valeursTexte(v, profondeur + 1));
  }
  return sortie.slice(0, VALEURS_MAX);
}

/** Ce qui, dans une session, peut se lire comme un numero de telephone. */
function numerosLisibles(valeurs: string[]): string[] {
  // Huit chiffres au minimum : c'est le seuil que tout le depot emploie pour
  // qu'une suite de chiffres puisse pretendre designer un abonne.
  return valeurs.filter((v) => v.replace(/\D/g, '').length >= 8);
}

export function rapprocherSessions(
  sessions: unknown[],
  boutiques: BoutiqueBranchee[],
  /**
   * L'adresse que le webhook de cette boutique DEVRAIT porter.
   *
   * Elle est passee plutot que construite ici : ce module ne connait ni n8n ni
   * les variables d'environnement, et c'est ce qui le rend eprouvable sans
   * reseau. Omise, le chemin entrant n'est simplement pas juge.
   *
   * ELLE VIT AVEC L'APPARIEMENT, ET NON A COTE. Savoir quelle boutique
   * reclame quelle ligne est exactement le travail de cette boucle ; le refaire
   * chez l'appelant, c'est deux exemplaires d'une meme regle, donc deux
   * regles le jour ou l'une change.
   */
  urlAttendue?: (b: BoutiqueBranchee) => string,
): Rapprochement {
  const identifiants = new Map<string, BoutiqueBranchee>();
  for (const b of boutiques) {
    const id = String(b.wasender_session_id ?? '').trim();
    if (id) identifiants.set(id, b);
  }

  const orphelines: string[] = [];
  let illisibles = 0;
  let rattachees = 0;

  /** Les identifiants de session effectivement rencontres au compte. */
  const vusAuCompte = new Set<string>();

  let webhooksConformes = 0;
  let webhooksIllisibles = 0;
  const webhooksDivergents: string[] = [];

  for (const s of sessions) {
    const valeurs = valeursTexte(s);

    for (const v of valeurs) if (identifiants.has(v)) vusAuCompte.add(v);

    const parIdentifiant = valeurs.some((v) => identifiants.has(v));

    // LE NUMERO COMPTE AUTANT QUE L'IDENTIFIANT, ET CE N'EST PAS UN LUXE.
    //
    // Zahara a ete branchee A LA MAIN, avant que le libre-service n'existe :
    // elle porte un jeton au coffre et AUCUN `wasender_session_id`. Un
    // rapprochement par identifiant seul declarerait sa ligne orpheline et
    // proposerait de supprimer le canal d'une boutique qui vend.
    const numeros = numerosLisibles(valeurs);
    const parNumero = numeros.some((n) =>
      boutiques.some((b) => b.telephone && memeNumero(n, b.telephone)),
    );

    if (parIdentifiant || parNumero) {
      rattachees += 1;

      /**
       * QUI RECLAME CETTE LIGNE ? PARFOIS PLUSIEURS, ET C'EST LE PIEGE.
       *
       * Un meme numero peut porter DEUX boutiques : un compte a le droit d'en
       * posseder plusieurs, et le gerant en exploite deux sous le sien. Prendre
       * « la premiere trouvee » attribuait alors la ligne au hasard.
       *
       * MESURE DU 2 SEPTEMBRE 2026, en production : la ligne de Zahara a ete
       * creditee a Rose Monde, dont l'adresse attendue differait forcement — et
       * l'instrument a crie « webhook devie » sur une ligne parfaitement saine.
       * La premiere alerte de cet instrument etait donc fausse, et de ma main.
       *
       * On garde TOUS les pretendants. Si l'adresse observee est celle de l'un
       * d'eux, la ligne est conforme — le webhook porte le slug, il tranche
       * lui-meme l'ambiguite que le numero laisse. Sinon, on ne designe un
       * coupable que s'il n'y en a qu'un possible : accuser au hasard vaut
       * moins que se taire.
       */
      const candidats = boutiques.filter(
        (b) =>
          (b.wasender_session_id && valeurs.includes(String(b.wasender_session_id).trim()))
          || (b.telephone && numeros.some((n) => memeNumero(n, b.telephone!))),
      );

      if (urlAttendue && candidats.length) {
        const verdicts = candidats.map((b) => ({ b, v: verdictWebhook(s, urlAttendue(b)) }));

        if (verdicts.some((x) => x.v.verdict === 'conforme')) {
          webhooksConformes += 1;
        } else if (candidats.length === 1 && verdicts[0].v.verdict === 'divergent') {
          webhooksDivergents.push(`${candidats[0].nom || candidats[0].slug} → ${verdicts[0].v.vue}`);
        } else {
          // Soit rien de lisible, soit plusieurs pretendants et aucun conforme :
          // on ne sait pas a qui reprocher quoi.
          webhooksIllisibles += 1;
        }
      }

      continue;
    }

    // Aucun numero lisible : on ne SAIT PAS a qui elle est. Ce n'est pas une
    // orpheline, et le dire serait proposer de supprimer une ligne au hasard.
    if (!numeros.length) {
      illisibles += 1;
      continue;
    }

    orphelines.push(numeros[0]);
  }

  /**
   * L'AUTRE SENS. Une boutique qui porte un identifiant que le compte ne
   * connait plus se croit branchee : le tableau de bord dit « connectee », et
   * ses messages ne partiront pas.
   *
   * On ne le conclut que des sessions REELLEMENT parcourues — un compte rendu
   * vide ne prouve pas que toutes les lignes ont disparu, il prouve qu'on n'a
   * rien lu. L'appelant ne doit donc pas nous passer une liste vide issue
   * d'une reponse illisible ; c'est ecrit chez lui.
   */
  const fantomes: string[] = [];
  for (const [id, b] of identifiants) {
    if (vusAuCompte.has(id)) continue;
    if (b.surveillee === false) continue;
    fantomes.push(String(b.nom || b.slug));
  }

  return {
    orphelines,
    fantomes,
    illisibles,
    rattachees,
    ...(urlAttendue
      ? {
          webhooks: {
            conformes: webhooksConformes,
            divergents: webhooksDivergents,
            illisibles: webhooksIllisibles,
          },
        }
      : {}),
  };
}
