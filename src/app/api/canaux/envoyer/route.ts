import { envoyerMessage, type Canal } from '@/lib/canaux';

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

  const resultat = await envoyerMessage({
    boutique,
    canal: canalBrut as Canal,
    destinataire,
    message,
    clavier,
    html,
  });

  if (!resultat.ok) {
    // Le code d'origine est repris tel quel : n8n doit pouvoir distinguer un
    // parametre invalide (400) d'un marchand non equipe (424) ou d'une panne
    // du fournisseur (502), et ne reessayer que dans le dernier cas.
    return Response.json(
      { ok: false, canal: resultat.canal, raison: resultat.raison },
      { status: resultat.statut },
    );
  }

  return Response.json({ ok: true, canal: resultat.canal, via: resultat.via });
}
