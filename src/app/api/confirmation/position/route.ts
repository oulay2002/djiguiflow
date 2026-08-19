import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { pointValide } from '@/lib/position';

export const dynamic = 'force-dynamic';

/**
 * Le client donne sa position depuis la page de confirmation.
 *
 * C'est le meilleur moment et le meilleur endroit. Le client vient d'appuyer
 * sur « Je confirme » : il est dans un navigateur, sur notre page, en HTTPS,
 * et son telephone sait donner une position au metre pres. Un appui suffit —
 * rien a copier, rien a coller, et surtout aucune dependance a ce qu'une
 * passerelle WhatsApp veut bien nous transmettre.
 *
 * CE QUI PROTEGE CETTE ROUTE. La reference tient lieu de cle, exactement comme
 * pour les boutons « Je confirme » et « J'annule » de la meme page : celui qui
 * la connait a recu le message. Trois bornes s'y ajoutent, parce qu'une
 * position fausse envoie un livreur au mauvais endroit :
 *
 *   1. la commande doit exister et ne pas etre terminee ;
 *   2. elle doit avoir moins de 24 h ;
 *   3. le point doit etre plausible — pas de (0, 0), pas de latitude a 95.
 *
 * On ne refuse PAS une seconde position : un client qui se deplace, ou qui
 * corrige un premier releve imprecis, doit pouvoir recommencer.
 */

const FENETRE_H = 24;
const TERMINEES = new Set(['livree', 'annulee', 'abandonnee']);

/** Voir `motifExact` dans la route voisine : « % » ferait correspondre la premiere commande venue. */
function motifExact(valeur: string): string {
  return valeur.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function POST(req: Request) {
  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps) return NextResponse.json({ ok: false, raison: 'requête illisible' }, { status: 400 });

  const ref = String(corps.ref ?? '').trim();
  const latitude = Number(corps.latitude);
  const longitude = Number(corps.longitude);

  if (!ref || !pointValide(latitude, longitude)) {
    return NextResponse.json({ ok: false, raison: 'référence ou position invalide' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, raison: 'base indisponible' }, { status: 503 });

  const { data: ligne, error } = await sb
    .from('commandes')
    .select('reference, statut, created_at')
    .ilike('reference', motifExact(ref))
    .maybeSingle();

  if (error) {
    console.error(`Position page — lecture impossible (${ref}) :`, error.message);
    return NextResponse.json({ ok: false, raison: 'lecture impossible' }, { status: 502 });
  }

  // Meme reponse pour « n'existe pas », « deja livree » et « trop ancienne » :
  // detailler renseignerait un curieux sur les references valides.
  const reference = String(ligne?.reference ?? '');
  const trop_vieille =
    !ligne?.created_at
    || Date.now() - Date.parse(String(ligne.created_at)) > FENETRE_H * 3600 * 1000;

  if (!ligne || !reference || TERMINEES.has(String(ligne.statut ?? '')) || trop_vieille) {
    return NextResponse.json({ ok: false, raison: 'commande non modifiable' }, { status: 404 });
  }

  const { error: erreurMaj } = await sb
    .from('commandes')
    .update({ latitude, longitude, position_recue_le: new Date().toISOString() })
    .eq('reference', reference);

  if (erreurMaj) {
    console.error(`Position page — écriture impossible (${reference}) :`, erreurMaj.message);
    return NextResponse.json({ ok: false, raison: 'écriture impossible' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, reference });
}
