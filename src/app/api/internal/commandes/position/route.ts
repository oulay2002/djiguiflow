import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';
import { pointValide, positionDansMessage } from '@/lib/position';

export const dynamic = 'force-dynamic';

/**
 * Le client a envoye sa position : on l'attache a sa commande en cours.
 *
 * A Abidjan l'adresse est un repere, pas une rue. Le client est le seul a
 * savoir ou il habite, et sa position est la seule donnee qui amene le livreur
 * a la porte plutot qu'au quartier.
 *
 * L'APPARIEMENT EST LE POINT DELICAT. Une position n'a pas de reference de
 * commande — le client appuie sur un trombone, c'est tout. Il faut donc la
 * rattacher par le client et par le temps, ce qui est exactement le genre de
 * rapprochement qui a deja produit un bug ici : apparier par telephone seul
 * avait fait ressortir une vieille commande. Trois garde-fous, donc :
 *
 *   1. meme boutique ;
 *   2. commande NON terminee (ni livree, ni annulee, ni panier abandonne) ;
 *   3. moins de 24 h, et la PLUS RECENTE.
 *
 * Et la reference est rendue a l'appelant pour que le client la voie dans la
 * reponse du bot : s'il s'est attache a la mauvaise commande, il le lit
 * immediatement au lieu de le decouvrir a la livraison.
 *
 * L'IDENTITE DU CLIENT se lit d'abord sur `chat_id`, qui est ce que les
 * routeurs connaissent de facon sure. Le rapprochement par telephone ne sert
 * que de secours, sur les huit derniers chiffres : `0102918886` en base et
 * `22502918886` cote WhatsApp designent la meme personne.
 */

const FENETRE_H = 24;
const TERMINEES = new Set(['livree', 'annulee', 'panier', 'abandonnee']);

/** Les huit derniers chiffres : ce qui reste identique d'une notation a l'autre. */
function empreinteTelephone(brut: unknown): string {
  const chiffres = String(brut ?? '').replace(/\D/g, '');
  return chiffres.length >= 8 ? chiffres.slice(-8) : '';
}

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
  const identifiant = String(corps.chat_id ?? corps.destinataire ?? '').trim();
  const telephone = String(corps.telephone ?? '').trim();
  let latitude = Number(corps.latitude);
  let longitude = Number(corps.longitude);

  if (!slug || (!identifiant && !telephone)) {
    return NextResponse.json({ error: 'boutique et chat_id (ou telephone) requis' }, { status: 400 });
  }

  // DEUX ENTREES, VOLONTAIREMENT. L'epingle native quand le canal la transmet —
  // Telegram le fait proprement. Et le lien colle dans la conversation sinon :
  // une position partagee sur WhatsApp n'a jamais atteint notre webhook, et une
  // fonction dont dependent les livraisons ne peut pas reposer sur ce qu'un
  // tiers veut bien transmettre. Le lien, lui, est du texte : il arrive
  // toujours.
  if (!pointValide(latitude, longitude)) {
    const trouve = await positionDansMessage(corps.texte);
    if (trouve) {
      latitude = trouve.latitude;
      longitude = trouve.longitude;
    }
  }

  // Illisible n'est pas une erreur de l'appelant : un client peut coller
  // n'importe quoi. On repond 200 avec la raison, plutot qu'un 4xx qui
  // teindrait l'execution n8n en rouge et masquerait les vraies pannes.
  if (!pointValide(latitude, longitude)) {
    return NextResponse.json({ ok: true, trouve: false, etat: 'illisible' });
  }

  const marchand = await resoudreMarchand(slug);
  if (!marchand) {
    return NextResponse.json({ error: 'Marchand introuvable' }, { status: 404 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const depuis = new Date(Date.now() - FENETRE_H * 3600 * 1000).toISOString();

  const { data: recentes, error } = await sb
    .from('commandes')
    .select('id, reference, client_nom, client_telephone, chat_id, statut, created_at')
    .eq('boutique_id', marchand.boutiqueId)
    .gte('created_at', depuis)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error(`Position — lecture impossible (${slug}) :`, error.message);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 });
  }

  // Le rapprochement se fait ici, en clair, plutot que dans un filtre SQL :
  // il y a deux identites possibles et une normalisation de numero, et une
  // condition illisible est une condition qu'on n'ose plus corriger.
  const empreinte = empreinteTelephone(telephone || identifiant);

  const cible = (recentes ?? []).find((c) => {
    if (TERMINEES.has(String(c.statut ?? ''))) return false;
    if (identifiant && String(c.chat_id ?? '').trim() === identifiant) return true;
    if (empreinte && empreinteTelephone(c.client_telephone) === empreinte) return true;
    if (empreinte && empreinteTelephone(c.chat_id) === empreinte) return true;
    return false;
  });

  // Aucune commande en cours : ce n'est pas une panne. Le client a pu envoyer
  // sa position spontanement, avant de commander ou apres livraison. On le dit
  // a l'appelant, qui saura quoi repondre.
  if (!cible) {
    return NextResponse.json({ ok: true, trouve: false, etat: 'commande_introuvable' });
  }

  const { error: erreurMaj } = await sb
    .from('commandes')
    .update({
      latitude,
      longitude,
      position_recue_le: new Date().toISOString(),
    })
    .eq('id', cible.id);

  if (erreurMaj) {
    console.error(`Position — ecriture impossible (${cible.reference}) :`, erreurMaj.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    trouve: true,
    etat: 'enregistree',
    reference: String(cible.reference ?? ''),
    client_nom: String(cible.client_nom ?? ''),
    latitude,
    longitude,
  });
}
