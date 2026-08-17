import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';

export const dynamic = 'force-dynamic';

/**
 * Le livreur a ouvert son lien d'invitation : on noue le lien.
 *
 * Appelee par le routeur Telegram quand un `/start <code>` arrive en prive. Le
 * code designe une fiche livreur et une seule ; l'identifiant Telegram, lui,
 * vient de Telegram et ne peut pas etre usurpe par l'expediteur.
 *
 * LE CODE EST A USAGE UNIQUE. Il est efface au rattachement : un lien transmis
 * par WhatsApp finit toujours par etre transfere, et quiconque le presente se
 * declare livreur de la boutique. Le marchand peut en regenerer un depuis son
 * tableau de bord si le livreur change de telephone.
 *
 * LE DOUBLE APPUI NE DOIT PAS RESSEMBLER A UNE ERREUR. Telegram renvoie
 * volontiers deux fois la meme mise a jour, et un livreur curieux rouvre son
 * lien. Comme le code vient d'etre efface, la recherche echoue — on regarde
 * alors si ce compte est deja rattache ici, et on repond « c'est deja fait »
 * plutot que « lien invalide », qui l'enverrait deranger son gerant pour rien.
 *
 * LA BOUTIQUE EST VERIFIEE. Le slug vient du bot qui a recu le message : un
 * code emis par le marchand A, active dans le bot du marchand B, ne doit
 * rattacher personne.
 */
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
  const code = String(corps.code ?? '').trim();
  const telegramId = String(corps.telegram_id ?? '').trim();

  if (!slug || !telegramId) {
    return NextResponse.json({ error: 'boutique et telegram_id requis' }, { status: 400 });
  }

  const marchand = await resoudreMarchand(slug);
  if (!marchand) {
    return NextResponse.json({ error: 'Marchand introuvable' }, { status: 404 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible' }, { status: 503 });

  const nomBoutique = marchand.nom ?? '';

  // Ce compte est-il deja rattache ici ? La question se pose AVANT le code :
  // elle repond au double appui, et elle evite qu'un livreur deja en place
  // n'accapare la fiche d'un collegue en presentant un autre lien.
  const { data: deja, error: erreurDeja } = await sb
    .from('livreurs')
    .select('nom')
    .eq('boutique_id', marchand.boutiqueId)
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (erreurDeja) {
    console.error(`Rattachement — lecture impossible (${slug}) :`, erreurDeja.message);
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 });
  }

  if (deja) {
    return NextResponse.json({
      ok: true,
      etat: 'deja',
      nom: String(deja.nom ?? ''),
      nom_boutique: nomBoutique,
    });
  }

  if (!code) {
    return NextResponse.json({ ok: true, etat: 'code_absent', nom_boutique: nomBoutique });
  }

  // L'ecriture porte elle-meme sa garde : `telegram_id is null` dans le filtre,
  // plutot qu'une lecture suivie d'une ecriture. Deux livreurs qui ouvrent le
  // meme lien a la meme seconde ne peuvent pas se doubler.
  const { data: rattaches, error: erreurMaj } = await sb
    .from('livreurs')
    .update({
      telegram_id: telegramId,
      rattache_le: new Date().toISOString(),
      code_invitation: null,
    })
    .eq('code_invitation', code)
    .eq('boutique_id', marchand.boutiqueId)
    .is('telegram_id', null)
    .select('nom');

  if (erreurMaj) {
    console.error(`Rattachement — ecriture impossible (${slug}) :`, erreurMaj.message);
    return NextResponse.json({ error: 'Écriture impossible' }, { status: 502 });
  }

  if (!rattaches || rattaches.length === 0) {
    // Code inconnu, deja consomme, ou fiche deja rattachee a quelqu'un d'autre.
    // Les trois se disent pareil au livreur : lui detailler la cause ne l'aide
    // pas et renseignerait un curieux sur les codes existants.
    return NextResponse.json({ ok: true, etat: 'code_inconnu', nom_boutique: nomBoutique });
  }

  return NextResponse.json({
    ok: true,
    etat: 'rattache',
    nom: String(rattaches[0].nom ?? ''),
    nom_boutique: nomBoutique,
  });
}
