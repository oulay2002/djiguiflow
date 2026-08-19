import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Frais de livraison annonces par le livreur.
 *
 * POURQUOI LE LIVREUR ET PAS UNE GRILLE. Le prix depend de la distance, du
 * trafic, du pont a traverser et de l'accord passe avec ce livreur-la. La
 * plateforme ne connait rien de tout cela ; lui le sait, et il le sait au
 * moment ou il accepte la course. On le lui demande donc a cet instant precis,
 * plutot que de calculer a sa place — un tarif faux coute plus cher qu'un
 * tarif absent, parce que le client l'a lu et s'en prevaut a la porte.
 *
 * L'APPARIEMENT SE FAIT PAR LA REFERENCE, jamais par le telephone ni par « la
 * derniere course de ce livreur ». Le bouton Telegram porte la reference : elle
 * est donc connue avec certitude, et il n'y a rien a deviner. C'est la lecon de
 * `commande-appariee-par-order-id` — un rapprochement approximatif sur de
 * l'argent finit toujours par designer la mauvaise ligne.
 *
 * ON N'ECRASE PAS UN MONTANT DEJA ANNONCE. Le client l'a lu ; le changer sans
 * qu'il le sache produirait une discussion a la livraison, exactement ce que
 * cette fonction cherche a eviter.
 */

/** Au-dela, c'est une faute de frappe : un doigt qui glisse sur le clavier. */
const PLAFOND_FCFA = 20000;

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const slug = String(corps.boutique ?? '').trim();
  const reference = String(corps.reference ?? '').trim();
  const montant = Number(corps.montant);

  if (!slug || !reference) {
    return NextResponse.json({ error: 'boutique et reference requises' }, { status: 400 });
  }

  // Zero est une valeur LEGITIME : « livraison offerte » se dit, et se dit
  // autrement que « pas encore annoncee ». C'est tout l'interet d'avoir garde
  // NULL pour le silence.
  if (!Number.isFinite(montant) || montant < 0 || montant > PLAFOND_FCFA) {
    return NextResponse.json(
      { error: `Montant attendu entre 0 et ${PLAFOND_FCFA} FCFA` },
      { status: 400 },
    );
  }

  const marchand = await resoudreMarchand(slug);
  if (!marchand) return NextResponse.json({ error: 'Marchand introuvable' }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const { data: existante, error } = await sb
    .from('commandes')
    .select('reference, client_nom, client_telephone, chat_id, canal, frais_livraison')
    .eq('boutique_id', marchand.boutiqueId)
    .eq('reference', reference)
    .maybeSingle();

  if (error) {
    console.error(`Frais — lecture impossible (${reference}) :`, error.message);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 });
  }

  // Commande inconnue : elle peut ne vivre que dans la feuille du marchand. Ce
  // n'est pas une panne, et l'appelant n8n ne doit pas rougir pour autant.
  if (!existante) {
    return NextResponse.json({ ok: true, etat: 'commande_inconnue' });
  }

  if (existante.frais_livraison !== null && existante.frais_livraison !== undefined) {
    return NextResponse.json({
      ok: true,
      etat: 'deja_annonce',
      montant: Number(existante.frais_livraison),
      reference,
    });
  }

  const { error: erreurMaj } = await sb
    .from('commandes')
    .update({ frais_livraison: montant, frais_annonces_le: new Date().toISOString() })
    .eq('boutique_id', marchand.boutiqueId)
    .eq('reference', reference)
    // La garde vit dans l'ECRITURE et non dans la lecture ci-dessus : deux
    // livreurs qui appuient a la meme seconde ne peuvent pas se doubler.
    .is('frais_livraison', null);

  if (erreurMaj) {
    console.error(`Frais — ecriture impossible (${reference}) :`, erreurMaj.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    etat: 'enregistre',
    reference,
    montant,
    client_nom: String(existante.client_nom ?? ''),
    // Le routeur s'en sert pour prevenir le client sur le bon canal.
    canal: String(existante.canal ?? 'whatsapp'),
    destinataire: String(existante.chat_id ?? existante.client_telephone ?? ''),
  });
}
