import { envoyerMessage, type Canal, type TypeEnvoi } from '@/lib/canaux';
import { notificationAutorisee, typeNotification } from '@/lib/preferencesNotifications';

export const dynamic = 'force-dynamic';

/**
 * Sortie unique des messages, appelee par n8n.
 *
 * n8n demande un envoi et n'obtient jamais de quoi envoyer lui-meme : le
 * jeton du marchand reste sur ce serveur. C'est ce qui permet a un marchand
 * d'utiliser son propre numero sans qu'aucune credential ne soit ajoutee
 * dans n8n — et donc de s'inscrire sans intervention manuelle.
 *
 * Authentification par `x-sync-secret`, le meme secret partage que
 * /api/commandes/sync utilise deja dans ce sens.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: 'Non autorise' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const boutique = String(corps.boutique ?? corps.boutique_id ?? '').trim();
  const canalBrut = String(corps.canal ?? '').trim().toLowerCase();
  const destinataire = String(corps.destinataire ?? '').trim();
  const message = String(corps.message ?? '');

  if (!boutique) {
    return Response.json({ error: 'boutique requise' }, { status: 400 });
  }
  if (canalBrut !== 'whatsapp' && canalBrut !== 'telegram') {
    return Response.json(
      { error: "canal doit valoir 'whatsapp' ou 'telegram'" },
      { status: 400 },
    );
  }
  if (!destinataire) {
    return Response.json({ error: 'destinataire requis' }, { status: 400 });
  }

  // Le clavier arrive parfois serialise : n8n compose souvent son corps en
  // texte, et un JSON.stringify de trop ne doit pas couter les boutons.
  let clavier: unknown = corps.reply_markup ?? corps.clavier ?? undefined;
  if (typeof clavier === 'string' && clavier.trim()) {
    try {
      clavier = JSON.parse(clavier);
    } catch {
      return Response.json({ error: 'reply_markup illisible' }, { status: 400 });
    }
  }

  // `format: "html"` demande a Telegram d'analyser les balises du message.
  // Sans lui, le texte part brut — ce qui est le bon defaut : un texte analyse
  // echoue des qu'il contient une esperluette, et l'envoi entier est perdu.
  const html = String(corps.format ?? '').toLowerCase() === 'html';

  // `type: "relance"` demande explicitement le passage par le frein : liste
  // STOP, espacement de 30 jours, plafond du jour. Le defaut est `service`,
  // donc les appels existants de n8n ne changent pas d'un iota — un message que
  // le client attend ne doit jamais pouvoir etre retenu par un quota.
  const type: TypeEnvoi = String(corps.type ?? '').toLowerCase() === 'relance' ? 'relance' : 'service';
  const motif = String(corps.motif ?? '').trim() || undefined;

  /**
   * LA PREFERENCE DU MARCHAND, HONOREE ICI ET NULLE PART AILLEURS.
   *
   * C'est le seul point de passage de tout ce que n8n envoie. Y placer le
   * filtre evite de le repeter dans chaque workflow -- et un workflow ajoute
   * demain en herite sans rien faire.
   *
   * `notification` est FACULTATIF : sans lui, rien ne change. Les appels
   * existants continuent exactement comme avant, et le filtre ne s'applique
   * qu'aux workflows qui nomment leur notification.
   *
   * UN REFUS N'EST PAS UN ECHEC. On rend 200 avec `envoye: false` : n8n doit
   * poursuivre son execution, pas la teindre en rouge. Une execution rouge
   * masque les vraies pannes -- c'est la lecon du 20 aout.
   */
  const notification = typeNotification(corps.notification);
  const verdict = await notificationAutorisee({ boutique, destinataire, type: notification });

  if (!verdict.envoyer) {
    console.log(`Canaux — envoi tu pour « ${boutique} » : ${verdict.raison}.`);
    return Response.json({
      ok: true,
      envoye: false,
      canal: canalBrut,
      raison: verdict.raison,
    });
  }

  const resultat = await envoyerMessage({
    boutique,
    canal: canalBrut as Canal,
    destinataire,
    message,
    clavier,
    html,
    type,
    motif,
  });

  if (!resultat.ok) {
    // Le code d'origine est repris tel quel : n8n doit pouvoir distinguer un
    // parametre invalide (400) d'un marchand non equipe (424), d'une relance
    // refusee (429) ou d'une panne du fournisseur (502) — et ne reessayer que
    // dans ce dernier cas. Reessayer un 429 serait precisement le comportement
    // qui fait bannir une session.
    return Response.json(
      { ok: false, canal: resultat.canal, raison: resultat.raison },
      { status: resultat.statut },
    );
  }

  return Response.json({ ok: true, envoye: true, canal: resultat.canal, via: resultat.via });
}
