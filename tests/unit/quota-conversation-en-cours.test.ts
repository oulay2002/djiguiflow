import { describe, expect, it } from 'vitest';
import { cleAppariement } from '@/lib/telephone';

/**
 * Le plafond ne coupe pas une conversation commencée.
 *
 * LA RÈGLE, décidée par l'exploitant. Deux situations que rien ne distinguait :
 *
 *   - Le client a **déjà commencé** à composer sa commande. L'arrêter en cours
 *     de route lui laisse un panier à moitié fait et une phrase qu'il ne
 *     comprend pas ; le marchand perd une vente presque conclue. On va au bout.
 *
 *   - Le client **n'a rien commencé**. Le laisser composer un panier entier
 *     pour le refuser à la validation serait pire que de le dire tout de
 *     suite : il aurait donné son nom, son numéro, son adresse pour rien. On
 *     bloque dès le premier mot.
 *
 * LE MARQUEUR EST UN PANIER OUVERT. L'assistante écrit la commande en `panier`
 * dès le premier article et la met à jour à chaque échange : c'est exactement
 * l'état « il a commencé ». Aucune heuristique de temps n'est nécessaire — sauf
 * la borne qui empêche un panier oublié de rouvrir le plafond indéfiniment.
 *
 * L'APPARIEMENT N'EST PAS UNE ÉGALITÉ STRICTE. Un même client arrive sous
 * plusieurs `chat_id` selon le canal et l'appareil. Une égalité stricte aurait
 * coupé la conversation d'un client déjà servi — le défaut qui avait déjà fait
 * perdre une note client.
 */

type Panier = { chat_id?: string | null; client_telephone?: string | null };

/**
 * Deux identifiants désignent-ils le même client ?
 *
 * `cleAppariement` ne rend RIEN pour un identifiant Telegram — il n'a pas la
 * forme d'un numéro ivoirien. Sans le repli à l'égalité stricte, un client
 * Telegram n'aurait jamais été reconnu comme ayant une conversation en cours,
 * et le plafond l'aurait coupé au milieu de sa commande.
 *
 * Ce cas a été trouvé PAR CE BANC, avant la mise en service.
 */
function memeClient(a: unknown, b: unknown): boolean {
  const ca = cleAppariement(a);
  const cb = cleAppariement(b);
  if (ca && cb) return ca === cb;

  const ra = String(a ?? '').trim();
  const rb = String(b ?? '').trim();
  return Boolean(ra) && ra === rb;
}

/** La décision, telle que la route l'applique. */
function decider(
  bloqueParQuota: boolean,
  exempt: boolean,
  client: string | null,
  paniers: Panier[],
): { autorise: boolean; conversationEnCours: boolean } {
  if (!bloqueParQuota || exempt) return { autorise: true, conversationEnCours: false };

  const ident = String(client ?? '').trim();
  const conversationEnCours = ident
    ? paniers.some((p) => memeClient(p.chat_id, ident) || memeClient(p.client_telephone, ident))
    : false;

  return { autorise: conversationEnCours, conversationEnCours };
}

const CLIENT = '2250759486701';

describe('plafond atteint — on finit ce qui est commencé', () => {
  it('un client qui a un panier ouvert va au bout', () => {
    const d = decider(true, false, CLIENT, [{ chat_id: CLIENT }]);
    expect(d.autorise).toBe(true);
    expect(d.conversationEnCours).toBe(true);
  });

  it('un client qui n a rien commencé est bloqué tout de suite', () => {
    const d = decider(true, false, CLIENT, []);
    expect(d.autorise).toBe(false);
    expect(d.conversationEnCours).toBe(false);
  });

  it('le panier d un AUTRE client ne débloque pas celui-ci', () => {
    const d = decider(true, false, CLIENT, [{ chat_id: '2250102030405' }]);
    expect(d.autorise).toBe(false);
  });
});

describe('le même client sous plusieurs adresses', () => {
  // LE DÉFAUT QU ON ÉVITE. Un client écrit depuis WhatsApp puis depuis un
  // autre appareil : le numéro est le même, sa forme ne l'est pas. Une égalité
  // stricte l'aurait coupé au milieu de sa commande.
  it.each([
    ['sans indicatif', '0759486701'],
    ['avec le plus', '+2250759486701'],
    ['avec des espaces', '225 07 59 48 67 01'],
  ])('le panier est reconnu %s', (_nom, forme) => {
    const d = decider(true, false, forme, [{ chat_id: CLIENT }]);
    expect(d.autorise).toBe(true);
  });

  it('le panier retrouvé par le téléphone plutôt que par le chat_id', () => {
    const d = decider(true, false, CLIENT, [{ chat_id: 'autre', client_telephone: CLIENT }]);
    expect(d.autorise).toBe(true);
  });

  it('un identifiant Telegram reste apparié à l identique', () => {
    const d = decider(true, false, '1724402569', [{ chat_id: '1724402569' }]);
    expect(d.autorise).toBe(true);
  });

  it('deux identifiants Telegram différents ne se confondent pas', () => {
    const d = decider(true, false, '1724402569', [{ chat_id: '1724402570' }]);
    expect(d.autorise).toBe(false);
  });
});

describe('ce qui n a pas changé', () => {
  it('sous le plafond, tout passe — sans même regarder les paniers', () => {
    const d = decider(false, false, CLIENT, []);
    expect(d.autorise).toBe(true);
  });

  it('un compte exempté n est jamais bloqué', () => {
    const d = decider(true, true, CLIENT, []);
    expect(d.autorise).toBe(true);
  });

  it.each([null, '', '   ', 'inconnu'])(
    'un client non identifiable (%s) ne débloque rien',
    (client) => {
      expect(decider(true, false, client, [{ chat_id: CLIENT }]).autorise).toBe(false);
    },
  );
});
