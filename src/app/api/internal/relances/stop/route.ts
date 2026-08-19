import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { envoyerMessage, normaliserTelephoneCI } from '@/lib/canaux';
import { estDemandeStop } from '@/lib/relances';

export const dynamic = 'force-dynamic';

/**
 * « STOP » — le client demande qu'on cesse de le solliciter.
 *
 * POURQUOI CETTE ROUTE EXISTE. Sur WhatsApp, un client agace n'ecrit pas au
 * service client : il BLOQUE ET SIGNALE. Et le signalement est le signal le
 * plus fort qui existe pour faire bannir une session — c'est-a-dire faire
 * perdre au marchand son canal principal, pas seulement sa campagne.
 *
 * Offrir une porte de sortie qui marche est donc l'inverse d'une concession :
 * c'est ce qui protege le marchand. Un client qui tape « stop » et qu'on cesse
 * d'ennuyer ne signale pas.
 *
 * CE QUE STOP NE BLOQUE PAS. Les messages de service — confirmation de
 * commande, frais de livraison, livreur en route. Le client a demande a ne plus
 * etre DEMARCHE, pas a ne plus etre SERVI. Le lui refuser casserait le produit
 * pour lui, et ce n'est pas ce qu'il a demande.
 *
 * Appelee par le routeur n8n, protegee par `x-sync-secret` comme les autres
 * routes internes.
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

  const boutique = String(corps.boutique ?? corps.slug ?? '').trim();
  const telephone = normaliserTelephoneCI(corps.telephone ?? corps.destinataire ?? corps.chat_id);
  const motif = String(corps.motif ?? 'stop_client').trim().slice(0, 60);
  // `retirer: true` remet le client dans le circuit — il a redemande a recevoir
  // apres coup, ou le marchand corrige une erreur de saisie.
  const retirer = corps.retirer === true || String(corps.retirer ?? '') === 'true';

  if (!boutique) return Response.json({ error: 'boutique requise' }, { status: 400 });
  if (!telephone) return Response.json({ error: 'telephone requis' }, { status: 400 });

  // ---- C'EST ICI QU'ON DECIDE, PAS DANS n8n.
  //
  // Le routeur fait un tri grossier — « ce message contient peut-etre un mot
  // d'arret » — et cette route tranche. La regle vit dans `relances.ts`, avec
  // son banc d'essai : une regle recopiee dans un workflow finirait par
  // diverger, et on l'a deja paye deux fois.
  //
  // Le point delicat n'est pas de reconnaitre « stop ». C'est de NE PAS
  // reconnaitre « arretez le piment svp » : intercepter ce message-la, c'est
  // perdre la commande en silence. Le refus est donc explicite et n8n sait quoi
  // en faire — passer la main a l'assistante.
  const texte = corps.texte ?? corps.message ?? corps.body;
  if (texte !== undefined && !retirer && !estDemandeStop(texte)) {
    return Response.json({ ok: true, etat: 'ignore', reconnu: false });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  if (retirer) {
    const { error } = await sb
      .from('relances_stop')
      .delete()
      .eq('boutique', boutique)
      .eq('telephone', telephone);

    if (error) {
      console.error(`STOP — retrait impossible (${boutique}) :`, error.message);
      return Response.json({ error: 'Retrait impossible' }, { status: 503 });
    }
    return Response.json({ ok: true, etat: 'retire', telephone });
  }

  // `upsert` et non `insert` : un client qui tape « stop » trois fois doit
  // obtenir trois fois la meme reponse rassurante, jamais une erreur de doublon.
  const { error } = await sb
    .from('relances_stop')
    .upsert({ boutique, telephone, motif }, { onConflict: 'boutique,telephone' });

  if (error) {
    console.error(`STOP — enregistrement impossible (${boutique}) :`, error.message);
    return Response.json({ error: 'Enregistrement impossible' }, { status: 503 });
  }

  // ---- ON REPOND, ET C'EST LE POINT ESSENTIEL.
  //
  // Un « stop » sans accuse de reception laisse le client persuade qu'on
  // continue. Il bloque et il signale — et le signalement est ce qui fait
  // bannir la session du marchand. Confirmer coute un message et evite cela.
  //
  // On lui rappelle qu'il peut toujours commander : il a demande a ne plus
  // etre demarche, pas a ne plus etre client. Sans cette phrase, beaucoup
  // croiraient s'etre ferme la porte.
  const canal = String(corps.canal ?? 'whatsapp').toLowerCase() === 'telegram' ? 'telegram' : 'whatsapp';
  const accuse = await envoyerMessage({
    boutique,
    canal,
    destinataire: String(corps.destinataire ?? corps.chat_id ?? telephone),
    message:
      'C’est noté : vous ne recevrez plus de messages de notre part.\n\n' +
      'Vous pouvez toujours nous écrire ou commander quand vous voulez.',
    type: 'service',
  });

  // L'accuse rate ne defait pas l'enregistrement : le client est desinscrit, et
  // c'est ce qui compte. On le signale pour que ce ne soit pas silencieux.
  if (!accuse.ok) {
    console.error(`STOP — accuse de reception non parti (${boutique}) :`, accuse.raison);
  }

  return Response.json({
    ok: true,
    etat: 'enregistre',
    reconnu: true,
    telephone,
    accuse_recu: accuse.ok,
  });
}
