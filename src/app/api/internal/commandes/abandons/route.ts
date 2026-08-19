import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { envoyerMessage } from '@/lib/canaux';

export const dynamic = 'force-dynamic';

/**
 * Les paniers abandonnes sur WhatsApp : une relance, puis on ferme.
 *
 * CE QU'EST UN PANIER ABANDONNE ICI. L'assistante ECRIT la commande avant de
 * demander confirmation. Un panier abandonne n'est donc pas un fantome a
 * reconstituer : c'est une ligne portant `confirmation_statut = 'demandee'`
 * dont la reponse du client n'est jamais revenue.
 *
 * POURQUOI CETTE RELANCE EST LEGITIME, ET PRESQUE SEULE A L'ETRE. Le client a
 * ecrit le premier, il a compose le panier lui-meme, et on lui repond DANS SA
 * PROPRE CONVERSATION, ouverte il y a moins d'une heure. C'est l'exact inverse
 * du premier contact non sollicite qui fait bannir une session — et elle passe
 * quand meme par le frein : liste STOP et plafond du jour s'appliquent.
 *
 * UNE SEULE RELANCE, JAMAIS DEUX. `relance_le` est pose sur la commande. Deux
 * rappels pour un panier, c'est du harcelement pour 2 500 F.
 *
 * ET ON FERME. Sans cela, ces lignes restent « en attente » pour toujours : les
 * plus anciennes trainaient depuis vingt-deux jours, faussant le tableau de
 * bord du marchand et ses statistiques.
 *
 * Appelee toutes les 15 minutes par n8n, qui ne sert que d'horloge : la regle
 * vit ici, ou elle est lisible et eprouvable.
 */

/** Laisser au client le temps de repondre avant de le rappeler. */
const MINUTES_AVANT_RELANCE = 45;
/** Au-dela, la commande n'arrivera plus : on la ferme. */
const HEURES_AVANT_FERMETURE = 24;
/**
 * Un rappel par client et par jour au maximum. 30 jours serait la bonne mesure
 * pour du demarchage ; ici le client vient d'ecrire, et lui refuser un rappel
 * parce qu'il a hesite trois semaines plus tot ferait perdre une vente sans
 * rien proteger.
 */
const JOURS_ENTRE_RELANCES = 1;

type Ligne = {
  reference: string | null;
  client_nom: string | null;
  chat_id: string | null;
  client_telephone: string | null;
  total: number | null;
  canal: string | null;
  created_at: string | null;
  boutiques: { slug: string | null; nom: string | null } | null;
};

const fcfa = (n: number) => n.toLocaleString('fr-FR');

function messageRelance(l: Ligne): string {
  const prenom = String(l.client_nom ?? '').trim().split(/\s+/)[0] || 'Bonjour';
  const boutique = String(l.boutiques?.nom ?? 'notre boutique');
  const ref = String(l.reference ?? '');
  const lien = (r: 'oui' | 'non') =>
    `https://www.djiguiflow.com/api/confirmation?ref=${encodeURIComponent(ref)}&r=${r}`;

  // Le meme format que la demande initiale, a dessein : le client reconnait le
  // message et retrouve les memes liens. Un rappel qui ne ressemble pas a ce
  // qu'il rappelle se lit comme une publicite.
  return [
    `🛍️ ${prenom}, votre commande ${ref} (${fcfa(Number(l.total ?? 0))} F) chez ${boutique} attend encore votre réponse.`,
    '',
    '✅ Je confirme :',
    lien('oui'),
    '',
    '❌ J’annule :',
    lien('non'),
    '',
    // Dire ce qui va se passer, plutot que de presser. Le client sait quoi
    // faire et pourquoi maintenant ; personne n'est mis sous pression.
    'Sans réponse, nous l’annulerons d’ici demain — vous pourrez toujours recommander.',
  ].join('\n');
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const maintenant = Date.now();
  const seuilRelance = new Date(maintenant - MINUTES_AVANT_RELANCE * 60_000).toISOString();
  const seuilFermeture = new Date(maintenant - HEURES_AVANT_FERMETURE * 3_600_000).toISOString();

  // ---- 1. Relancer, une seule fois, dans la fenetre utile.
  //
  // Bornee des deux cotes : plus recente que la fermeture, plus ancienne que le
  // delai de reponse. Relancer une commande de la veille n'a plus de sens — le
  // client a mange depuis longtemps.
  const { data: aRelancer, error: errLecture } = await sb
    .from('commandes')
    .select(
      'reference, client_nom, chat_id, client_telephone, total, canal, created_at,' +
        ' boutiques(slug, nom)',
    )
    .eq('confirmation_statut', 'demandee')
    .eq('statut', 'en_attente')
    .is('relance_le', null)
    .lt('created_at', seuilRelance)
    .gt('created_at', seuilFermeture)
    .limit(50);

  if (errLecture) {
    console.error('Abandons — lecture impossible :', errLecture.message);
    return Response.json({ error: 'Lecture impossible' }, { status: 503 });
  }

  let relancees = 0;
  const refusees: { reference: string; raison: string }[] = [];

  for (const l of (aRelancer ?? []) as unknown as Ligne[]) {
    const destinataire = String(l.chat_id ?? l.client_telephone ?? '').trim();
    const boutique = String(l.boutiques?.slug ?? '').trim();
    if (!destinataire || !boutique || !l.reference) continue;

    // LA MARQUE AVANT L'ENVOI. Un reessai autour d'un envoi le duplique : un
    // client a deja recu trois fois le meme message. Une relance marquee puis
    // non partie ne coute qu'un rappel ; partie deux fois, elle coute la
    // confiance du client.
    const { error: errMarque } = await sb
      .from('commandes')
      .update({ relance_le: new Date().toISOString() })
      .eq('reference', l.reference)
      .is('relance_le', null);

    if (errMarque) {
      console.error(`Abandons ${l.reference} — marquage impossible :`, errMarque.message);
      continue;
    }

    const envoi = await envoyerMessage({
      boutique,
      canal: String(l.canal ?? '').toLowerCase() === 'telegram' ? 'telegram' : 'whatsapp',
      destinataire,
      message: messageRelance(l),
      type: 'relance',
      motif: 'panier_abandonne',
      jours: JOURS_ENTRE_RELANCES,
    });

    if (envoi.ok) relancees++;
    else refusees.push({ reference: l.reference, raison: envoi.raison });
  }

  // ---- 2. Fermer ce qui ne viendra plus.
  //
  // On ne supprime rien : la commande garde sa trace, son montant et son
  // client. Elle cesse simplement d'etre annoncee au marchand comme une
  // commande a preparer.
  const { data: fermees, error: errFermeture } = await sb
    .from('commandes')
    .update({ statut: 'abandonnee' })
    .eq('confirmation_statut', 'demandee')
    .eq('statut', 'en_attente')
    .lt('created_at', seuilFermeture)
    .select('reference');

  // L'ERREUR REMONTE, ELLE N'EST PLUS SEULEMENT JOURNALISEE.
  //
  // Au premier essai, la contrainte CHECK refusait 'abandonnee' et cet UPDATE
  // echouait — mais la route rendait « fermees: 0 » comme si tout allait bien.
  // Sans la verification en base, la panne serait passee pour un « rien a
  // fermer ». Une tache planifiee qui ment sur son resultat ne sert a rien.
  if (errFermeture) {
    console.error('Abandons — fermeture impossible :', errFermeture.message);
    return Response.json(
      { ok: false, relancees, fermees: 0, refusees, erreur: errFermeture.message },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    relancees,
    fermees: fermees?.length ?? 0,
    refusees,
  });
}
