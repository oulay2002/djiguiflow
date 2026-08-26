import { NextResponse } from 'next/server';
import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cleAppariement } from '@/lib/telephone';
import { etatQuota } from '@/lib/billing/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le bot peut-il encore enregistrer une commande pour cette boutique ?
 *
 * Consultee par n8n AVANT d'inscrire la commande, pour que l'assistante
 * decline poliment plutot que de la prendre puis de la voir refusee. Couper le
 * bot en pleine conversation ferait perdre une vente au marchand — il nous en
 * voudrait plus qu'il ne paierait.
 *
 * Meme garde que le reste de /api/internal : le secret partage.
 */
/**
 * Au-dela, ce n'est plus une conversation en cours, c'est un panier oublie.
 *
 * La veille les signale d'ailleurs a vingt-quatre heures. Sans cette borne, un
 * panier abandonne il y a trois semaines rouvrirait indefiniment le plafond
 * pour ce client — le blocage deviendrait contournable en laissant trainer une
 * commande a moitie faite.
 */
const HEURES_DE_CONVERSATION = 6;

/**
 * Deux identifiants designent-ils le meme client ?
 *
 * DEUX MONDES COHABITENT DANS `chat_id`. Un numero WhatsApp arrive sous
 * plusieurs formes — avec l'indicatif, sans, avec des espaces — et se compare
 * donc par ses huit derniers chiffres. Un identifiant Telegram est un entier
 * arbitraire et parfaitement stable : `cleAppariement` ne lui rend RIEN,
 * volontairement, pour qu'un elargissement ne le confonde pas avec un autre.
 *
 * Sans ce repli a l'egalite stricte, un client Telegram n'aurait jamais ete
 * reconnu comme ayant une conversation en cours — et le plafond l'aurait coupe
 * au milieu de sa commande, precisement le cas que cette regle existe pour
 * eviter. Trouve par le banc avant la mise en service.
 */
function memeClient(a: unknown, b: unknown): boolean {
  const ca = cleAppariement(a);
  const cb = cleAppariement(b);
  if (ca && cb) return ca === cb;

  const ra = String(a ?? '').trim();
  const rb = String(b ?? '').trim();
  return Boolean(ra) && ra === rb;
}


export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: { boutique?: string; client?: string };
  try {
    corps = (await req.json()) as { boutique?: string; client?: string };
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const marchand = await resoudreMarchand(corps.boutique ?? null);
  if (!marchand) {
    return NextResponse.json({ error: 'Marchand introuvable.' }, { status: 404 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    // Panne de notre cote : on laisse passer. Bloquer les ventes d'un marchand
    // parce que notre base tousse serait le pire des arbitrages.
    return NextResponse.json({ autorise: true, indetermine: true });
  }

  const { data: boutique } = await sb
    .from('boutiques')
    .select('user_id')
    .eq('id', marchand.boutiqueId)
    .maybeSingle();

  if (!boutique?.user_id) {
    return NextResponse.json({ autorise: true, indetermine: true });
  }

  const etat = await etatQuota(boutique.user_id);
  if (!etat) {
    return NextResponse.json({ autorise: true, indetermine: true });
  }

  /**
   * ON NE COUPE PAS UNE CONVERSATION EN COURS, ON N'EN OUVRE PAS DE NOUVELLE.
   *
   * La regle vient de l'exploitant, et elle tranche le cas le plus dur du
   * plafond. Deux situations que rien ne distinguait jusqu'ici :
   *
   *   - Le client a DEJA commence a composer sa commande. L'arreter en cours
   *     de route lui laisse un panier a moitie fait et une phrase qu'il ne
   *     comprend pas. Le marchand, lui, perd une vente qui etait presque
   *     conclue. On va jusqu'au bout.
   *
   *   - Le client n'a rien commence. Lui laisser composer un panier entier
   *     pour le refuser a la validation serait pire que de le dire tout de
   *     suite : il aura donne son nom, son numero, son adresse pour rien.
   *     On bloque des le premier mot.
   *
   * LE MARQUEUR D'UNE CONVERSATION EN COURS EST UN PANIER OUVERT. L'assistante
   * ecrit la commande en `panier` des le premier article et la met a jour a
   * chaque echange : c'est exactement l'etat « il a commence ». Aucune
   * heuristique de temps n'est necessaire.
   *
   * L'APPARIEMENT DU CLIENT N'EST PAS UNE EGALITE STRICTE. Un meme client
   * arrive sous plusieurs `chat_id` selon le canal et l'appareil ; on compare
   * donc par `cleAppariement`, qui retient les huit derniers chiffres d'un
   * numero ivoirien et laisse un identifiant Telegram intact. Une egalite
   * stricte aurait coupe la conversation d'un client qu'on avait deja servi.
   */
  let conversationEnCours = false;

  /**
   * ON A LAISSE PASSER SANS SAVOIR. C'est un etat distinct des deux autres, et
   * le confondre avec « conversation en cours » serait mentir dans la trace.
   *
   * Le champ existe deja plus haut avec exactement ce sens — base injoignable,
   * quota illisible — et il vaut ici pour la meme raison.
   */
  let indetermine = false;

  if (etat.bloque && !etat.exempt) {
    const client = String(corps.client ?? '').trim();

    if (client) {
      const { data: paniers, error: errPanier } = await sb
        .from('commandes')
        .select('chat_id, client_telephone')
        .eq('boutique_id', marchand.boutiqueId)
        .eq('statut', 'panier')
        .gt('created_at', new Date(Date.now() - HEURES_DE_CONVERSATION * 3_600_000).toISOString())
        .limit(50);

      if (errPanier) {
        /**
         * DANS LE DOUTE, ON LAISSE PARLER — les deux erreurs ne coutent pas la
         * meme chose.
         *
         * Laisser passer a tort : une commande au-dela du forfait, qui se
         * regle commercialement avec le marchand. Recuperable, et elle lui
         * profite.
         *
         * Bloquer a tort : un client reel coupe au milieu de sa commande. Il
         * part, et c'est le client du marchand. Rien ne le rattrape.
         *
         * MAIS ON NE DIT PAS « CONVERSATION EN COURS ». On n'en sait rien. Le
         * marquer comme tel rendrait la trace indiscernable d'un vrai cas, et
         * une panne durable de la base ouvrirait le plafond a tout le monde
         * sans que la trace ne montre jamais pourquoi. C'est le defaut de la
         * journee — un repli que personne ne regarde — et il n'a pas sa place
         * dans le correctif qui le denonce.
         */
        console.error('Quota — paniers illisibles, on laisse passer sans savoir :', errPanier.message);
        indetermine = true;
      } else {
        conversationEnCours = (paniers ?? []).some(
          (c) => memeClient(c.chat_id, client) || memeClient(c.client_telephone, client),
        );
      }
    }
  }

  const bloque = etat.bloque && !conversationEnCours && !indetermine;

  return NextResponse.json({
    autorise: !bloque,
    // Rendus pour que l'execution n8n montre POURQUOI un compte au plafond a
    // laisse passer : sans cela, la trace se lirait comme un quota qui ne
    // marche pas. Et les deux raisons ne se valent pas — l'une est une regle,
    // l'autre est une ignorance.
    conversationEnCours,
    indetermine,
    exempt: etat.exempt,
    plan: etat.plan.key,
    inclus: etat.quota,
    utilise: etat.utilise,
    restant: etat.restant,
    niveau: etat.niveau,
    // Ce que l'assistante peut dire au client, sans jargon d'abonnement : le
    // client n'a pas a savoir que son restaurateur a atteint un plafond.
    messageClient: bloque
      ? 'Je ne peux pas enregistrer votre commande pour le moment. Appelez directement la boutique, elle prendra le relais.'
      : null,
  });
}
