import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { pointValide } from '@/lib/position';
import { positionRecevable } from '@/lib/positionRecevable';
import { jetonRefuse, verdictJeton } from '@/lib/jetonSuivi';
import { adresseAppelante, rafaleDepassee } from '@/lib/limiteur';
import { motifExact, referenceRecevable } from '@/lib/reference';

export const dynamic = 'force-dynamic';

/**
 * La position exacte du client, donnee depuis la page de confirmation.
 *
 * ── CE QUE CETTE ROUTE A LAISSE OUVERT, ET POURQUOI ────────────────────────
 *
 * Elle a longtemps porte, en tete de fichier, cette justification :
 * « la reference tient lieu de cle, exactement comme pour les boutons
 * "Je confirme" et "J'annule" de la meme page ». C'etait vrai le jour ou elle a
 * ete ecrite. Ca a cesse de l'etre le 22 aout 2026, quand `JETON_EXIGE` est
 * passe a `true` : les deux boutons se sont mis a exiger le jeton, et cette
 * route-ci — nee de la meme page, appelee depuis le meme ecran — a ete oubliee.
 * Le commentaire, lui, est reste, et il a servi de caution pendant quatre jours.
 *
 * C'EST LA LECON, PLUS QUE LE CORRECTIF. Une regle de securite qui vit dans un
 * drapeau partage (`jetonSuivi.ts`) ne protege que les routes qui pensent a le
 * lire. Celle-ci n'importait meme pas le fichier.
 *
 * Ce que l'oubli permettait, mesure le 26 aout : la route acceptait un MOTIF
 * (voir `@/lib/reference` — `*` n'etait pas neutralise), donc un prefixe
 * suffisait a designer une commande vivante sans en connaitre la reference. Et
 * elle rendait `{ok:true, reference:"…"}` : elle livrait la reference complete.
 * Un tiers ecrasait ainsi la position GPS d'un client, et le livreur partait a
 * l'adresse de son choix. Ni jeton, ni frein, ni plafond.
 *
 * ── CE QUI LA FERME, DESORMAIS ────────────────────────────────────────────
 *
 * 1. La forme de la reference est validee AVANT toute lecture.
 * 2. Le jeton de suivi est exige, par la meme fonction que la route voisine.
 * 3. Un frein par appelant, comme ses deux soeurs en avaient deja un.
 * 4. UNE SEULE ET MEME REPONSE pour tous les refus — forme invalide, commande
 *    inconnue, jeton absent ou faux, commande trop ancienne ou terminee. Et
 *    elle ne renvoie plus la reference : la rendre confirmait ce qu'on venait
 *    de deviner.
 */

// La fenetre et les statuts termines vivent dans `positionRecevable.ts` : la
// PAGE doit decider d'afficher le bouton avec exactement la meme regle que
// celle-ci applique pour l'accepter. Deux copies finiraient par diverger, et la
// page proposerait un bouton que cette route refuse — le pire des cas, puisqu'un
// bouton qui echoue apprend au client a ne plus appuyer.

/**
 * Trente par dix minutes, comme `/api/suivi`.
 *
 * Un client qui se deplace et corrige sa position deux ou trois fois n'y arrive
 * jamais. Un script qui balaie des references s'y heurte a la deuxieme seconde.
 */
const POSITIONS_PAR_APPELANT = 30;
const FENETRE_MS = 10 * 60_000;

/**
 * LE MEME REFUS POUR TOUT. Voir le point 4 ci-dessus.
 *
 * Une fonction et non une constante : une `Response` ne se consomme qu'une
 * fois, et deux refus dans la meme seconde partageraient le meme corps vide.
 */
function refus(): NextResponse {
  return NextResponse.json({ ok: false, raison: 'commande non modifiable' }, { status: 404 });
}

export async function POST(req: Request) {
  const appelant = adresseAppelante(req);
  const rafale = rafaleDepassee(`position:${appelant}`, POSITIONS_PAR_APPELANT, FENETRE_MS);
  if (rafale.depassee) {
    console.error(`Position page — rafale refusee depuis ${appelant} : enumeration probable.`);
    return NextResponse.json(
      { ok: false, raison: 'trop de tentatives' },
      { status: 429, headers: { 'Retry-After': String(rafale.attendreSecondes) } },
    );
  }

  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps) return NextResponse.json({ ok: false, raison: 'requête illisible' }, { status: 400 });

  const ref = String(corps.ref ?? '').trim();
  const jetonFourni = String(corps.t ?? '').trim();
  const latitude = Number(corps.latitude);
  const longitude = Number(corps.longitude);

  if (!ref || !pointValide(latitude, longitude)) {
    return NextResponse.json({ ok: false, raison: 'référence ou position invalide' }, { status: 400 });
  }

  // Une reference qui n'a pas la forme d'une reference est un motif : on refuse
  // avant d'approcher la base, et avec le refus commun.
  if (!referenceRecevable(ref)) {
    console.error(`Position page — reference de forme invalide depuis ${appelant} : ${ref}`);
    return refus();
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, raison: 'base indisponible' }, { status: 503 });

  const { data: ligne, error } = await sb
    .from('commandes')
    .select('reference, statut, created_at, jeton_suivi')
    .ilike('reference', motifExact(ref))
    .maybeSingle();

  if (error) {
    console.error(`Position page — lecture impossible (${ref}) :`, error.message);
    return NextResponse.json({ ok: false, raison: 'lecture impossible' }, { status: 502 });
  }

  const reference = String(ligne?.reference ?? '');
  if (!ligne || !reference || !positionRecevable(ligne)) return refus();

  // LE JETON PROUVE, LA REFERENCE NE FAIT QUE DESIGNER. Meme fonction que
  // `/api/confirmation` et `/api/suivi` : la regle ne peut plus diverger d'une
  // route a l'autre, puisqu'il n'y en a qu'une.
  const verdict = verdictJeton(jetonFourni, ligne.jeton_suivi);
  if (jetonRefuse(verdict)) {
    console.error(`Position page — jeton refuse (${verdict}) depuis ${appelant}.`);
    return refus();
  }

  const { error: erreurMaj } = await sb
    .from('commandes')
    .update({ latitude, longitude, position_recue_le: new Date().toISOString() })
    .eq('reference', reference);

  if (erreurMaj) {
    console.error(`Position page — écriture impossible (${reference}) :`, erreurMaj.message);
    return NextResponse.json({ ok: false, raison: 'écriture impossible' }, { status: 502 });
  }

  // On ne rend plus la reference : le client qui appelle la connait deja, et la
  // renvoyer confirmait a un curieux qu'il venait d'en deviner une.
  return NextResponse.json({ ok: true });
}
