import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierPaiement } from '@/lib/billing/geniuspay';
import { prolongerAcces } from '@/lib/billing/periode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notification de paiement GeniusPay.
 *
 * CE QUI OUVRE L'ACCES N'EST PAS CE WEBHOOK. La notification ne sert qu'a nous
 * reveiller : le verdict vient d'un appel que NOUS emettons vers
 * `GET /payments/{reference}`. Une notification forgee ne peut donc rien
 * ouvrir, meme si sa signature nous echappait — elle nous ferait au pire
 * interroger GeniusPay sur une reference.
 *
 * La signature reste verifiee quand le secret est configure : c'est une
 * defense en profondeur, pas la defense principale. On ne bloque PAS quand le
 * secret manque — sinon aucun paiement n'aboutirait entre la mise en ligne de
 * cette route et sa declaration chez GeniusPay, et un marchand paierait sans
 * recevoir son acces. L'absence est journalisee bruyamment.
 *
 * LE MONTANT EST CONFRONTE A L'ATTENDU. Sans ce controle, une transaction de
 * 200 FCFA ouvrirait les droits d'un plan a 25 000 : il suffirait de savoir
 * forger une reference et de payer une piece.
 *
 * UNE TRANSACTION DE BAC A SABLE N'OUVRE RIEN. Elle est simulee : l'honorer
 * donnerait un acces que personne n'a paye. Le contournement existe pour les
 * essais, mais il se declare — `GENIUSPAY_ACCEPTE_SANDBOX=1` — et il se voit.
 */

/** Fenetre anti-rejeu annoncee par GeniusPay. */
const FENETRE_SIGNATURE_S = 300;

function egales(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // `timingSafeEqual` exige des longueurs egales et leve sinon.
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verifie `HMAC-SHA256(timestamp + "." + charge, secret)`.
 *
 * Leur exemple PHP signe `json_encode($request->all())`, c'est-a-dire la charge
 * RE-SERIALISEE, pas les octets recus. Deux langages ne re-serialisent pas
 * forcement pareil — espaces, ordre des cles, echappement de l'unicode. On
 * accepte donc les deux candidats : les octets bruts, et notre propre
 * re-serialisation. Refuser une notification legitime pour une virgule
 * d'encodage couterait un acces non ouvert sur un paiement encaisse.
 */
function signatureValide(
  secret: string,
  timestamp: string,
  brut: string,
  signature: string,
): boolean {
  const candidats = [brut];
  try {
    candidats.push(JSON.stringify(JSON.parse(brut)));
  } catch {
    /* charge non-JSON : seul le brut sera essaye */
  }

  return candidats.some((charge) =>
    egales(createHmac('sha256', secret).update(`${timestamp}.${charge}`).digest('hex'), signature),
  );
}

/** Cherche une valeur a plusieurs profondeurs plausibles, sans rien supposer. */
function premier(objet: Record<string, unknown>, chemins: string[][]): string | null {
  for (const chemin of chemins) {
    let courant: unknown = objet;
    for (const cle of chemin) {
      if (!courant || typeof courant !== 'object') { courant = null; break; }
      courant = (courant as Record<string, unknown>)[cle];
    }
    const v = String(courant ?? '').trim();
    if (v) return v;
  }
  return null;
}

export async function POST(req: Request) {
  const brut = await req.text().catch(() => '');
  if (!brut.trim()) {
    return NextResponse.json({ error: 'Corps vide.' }, { status: 400 });
  }

  let charge: Record<string, unknown>;
  try {
    charge = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  // ---- Defense en profondeur : signature et fraicheur.
  const secret = process.env.GENIUSPAY_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get('x-webhook-signature')?.trim() ?? '';
  const horodatage = req.headers.get('x-webhook-timestamp')?.trim() ?? '';
  const evenement = req.headers.get('x-webhook-event')?.trim() ?? '';

  if (!secret) {
    console.error(
      'GeniusPay webhook — GENIUSPAY_WEBHOOK_SECRET absent : notification acceptée sans'
      + ' vérification de signature. Le verdict reste celui de l’API, mais posez ce secret.',
    );
  } else if (!signature || !horodatage) {
    console.error('GeniusPay webhook — signature ou horodatage absent, notification rejetée.');
    return NextResponse.json({ error: 'Signature absente.' }, { status: 401 });
  } else {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(horodatage));
    if (!Number.isFinite(age) || age > FENETRE_SIGNATURE_S) {
      console.error(`GeniusPay webhook — horodatage hors fenêtre (${horodatage}).`);
      return NextResponse.json({ error: 'Horodatage trop ancien.' }, { status: 400 });
    }
    if (!signatureValide(secret, horodatage, brut, signature)) {
      console.error('GeniusPay webhook — signature invalide, notification rejetée.');
      return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 });
    }
  }

  // ---- Retrouver de quoi on parle. Leur reference interroge l'API ; la notre
  // designe l'abonnement. On accepte plusieurs profondeurs : leur charge n'est
  // pas documentee, et supposer une forme unique casserait au premier envoi.
  const refPrestataire = premier(charge, [
    ['data', 'reference'], ['reference'], ['data', 'data', 'reference'], ['payment', 'reference'],
  ]);
  const refInterne = premier(charge, [
    ['data', 'metadata', 'reference'], ['metadata', 'reference'],
    ['data', 'data', 'metadata', 'reference'], ['payment', 'metadata', 'reference'],
  ]);

  if (!refPrestataire) {
    console.error(`GeniusPay webhook — aucune référence dans la charge (${evenement}) :`, brut.slice(0, 400));
    return NextResponse.json({ error: 'Référence absente.' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // 503 volontaire : ici le reessai a du sens, la panne est de notre cote.
  if (!sb) return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });

  const requete = sb
    .from('paiements')
    .select('reference, user_id, plan_key, mois, montant_fcfa, statut');

  const { data: trouve, error } = refInterne
    ? await requete.eq('reference', refInterne).maybeSingle()
    : await requete.eq('jeton_prestataire', refPrestataire).maybeSingle();

  if (error) {
    console.error('GeniusPay webhook — lecture du paiement impossible :', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 503 });
  }

  let paiement = trouve;

  // DERNIER RECOURS AVANT DE CLASSER « INCONNUE », et il compte parce que la
  // branche d'a cote repond 200 : GeniusPay considere alors la notification
  // delivree et ARRETE de reessayer. Se tromper ici, c'est de l'argent encaisse
  // dont l'acces ne s'ouvrira jamais, avec pour seule trace une ligne de log.
  //
  // Le cas se produit sur double defaut : leur charge ne porte pas notre
  // `metadata.reference`, ET `jeton_prestataire` n'a pas ete conserve a
  // l'initialisation — le checkout journalise cet echec sans interrompre la
  // vente, donc le marchand paie quand meme.
  //
  // L'API, elle, sait a qui appartient sa reference : elle rend notre propre
  // reference telle qu'elle etait partie dans `metadata`. On la lui demande
  // plutot que d'abandonner. Le verdict obtenu ici est conserve : le rappeler
  // plus bas ferait deux appels pour une seule notification.
  let verdictObtenu: Awaited<ReturnType<typeof verifierPaiement>> | null = null;

  if (!paiement && !refInterne) {
    verdictObtenu = await verifierPaiement(refPrestataire);

    if (verdictObtenu.referenceInterne) {
      const secours = await sb
        .from('paiements')
        .select('reference, user_id, plan_key, mois, montant_fcfa, statut')
        .eq('reference', verdictObtenu.referenceInterne)
        .maybeSingle();

      if (secours.data) {
        paiement = secours.data;
        console.warn(
          `GeniusPay webhook — paiement retrouvé par l’API et non par la base`
          + ` (${verdictObtenu.referenceInterne}) : jeton_prestataire manquant à`
          + ' l’initialisation, à vérifier.',
        );
      }
    }
  }

  // Reference inconnue : appel forge, ou transaction d'un autre site. On ne
  // cree JAMAIS un droit a partir d'une notification. Ici le 200 est le bon
  // choix — il n'y a rien a rejouer, et l'API elle-meme ne l'a pas reconnue.
  if (!paiement) {
    console.error(`GeniusPay webhook — référence inconnue : ${refInterne ?? refPrestataire}`);
    return NextResponse.json({ ok: true, ignore: 'référence inconnue' });
  }

  // Idempotence : le prestataire rejoue ses notifications. Sans cette sortie,
  // deux appels prolongeraient l'acces deux fois pour un seul paiement.
  if (paiement.statut === 'paye') {
    return NextResponse.json({ ok: true, deja: true });
  }

  // ---- LE VERDICT. Il ne vient pas de la notification mais de l'API.
  // Deja obtenu si l'on a du passer par le recours ci-dessus.
  const verdict = verdictObtenu ?? (await verifierPaiement(refPrestataire));

  if (verdict.indetermine) {
    // On NE SAIT PAS : prestataire injoignable, corps illisible, ou statut
    // `pending`/`processing`. L'argent peut avoir ete preleve. Classer ce cas
    // en « echoue » enterrerait un paiement encaisse. On laisse EN ATTENTE et
    // on repond 503 : GeniusPay rejouera, et la panne remonte au canal
    // d'alerte au lieu de se ranger dans les refus.
    console.error(
      `Paiement ${paiement.reference} — vérification indéterminée (${verdict.statutBrut}).`
      + ' Laissé en attente : ne pas le compter comme refusé.',
    );
    return NextResponse.json({ error: 'Vérification impossible.' }, { status: 503 });
  }

  if (!verdict.accepte) {
    await sb
      .from('paiements')
      .update({ statut: 'echoue', operateur: verdict.operateur })
      .eq('reference', paiement.reference);

    console.error(`Paiement ${paiement.reference} refusé : ${verdict.statutBrut ?? 'inconnu'}`);
    return NextResponse.json({ ok: true, accepte: false });
  }

  // Le montant encaisse doit etre celui qu'on a demande.
  if (verdict.montant !== null && verdict.montant !== paiement.montant_fcfa) {
    await sb
      .from('paiements')
      .update({ statut: 'echoue', operateur: verdict.operateur })
      .eq('reference', paiement.reference);

    console.error(
      `Paiement ${paiement.reference} — montant inattendu : encaissé ${verdict.montant},`
      + ` attendu ${paiement.montant_fcfa}.`,
    );
    return NextResponse.json({ ok: true, accepte: false, motif: 'montant' });
  }

  // Une transaction simulee est reussie par construction : l'honorer donnerait
  // un acces que personne n'a paye. Le paiement reste EN ATTENTE, jamais
  // « echoue » — il n'a rien fait de mal.
  const sandbox = verdict.environnement === 'sandbox';
  if (sandbox && process.env.GENIUSPAY_ACCEPTE_SANDBOX !== '1') {
    console.error(
      `Paiement ${paiement.reference} — transaction de BAC A SABLE, accès non ouvert.`
      + ' Posez GENIUSPAY_ACCEPTE_SANDBOX=1 pour éprouver la chaîne complète.',
    );
    return NextResponse.json({ ok: true, accepte: true, ouvert: false, motif: 'sandbox' });
  }

  const prolongation = await prolongerAcces({
    userId: paiement.user_id,
    planKey: paiement.plan_key,
    mois: paiement.mois,
    reference: paiement.reference,
  });

  if (!prolongation.ok) {
    // Le paiement est encaisse mais l'acces n'est pas ouvert : le seul cas ou
    // l'on VEUT que le prestataire reessaie, et qu'une alerte parte.
    console.error(
      `Paiement ${paiement.reference} encaissé mais accès non ouvert : ${prolongation.erreur}`,
    );
    return NextResponse.json({ error: 'Prolongation impossible.' }, { status: 503 });
  }

  await sb
    .from('paiements')
    .update({
      statut: 'paye',
      operateur: verdict.operateur,
      paye_le: new Date().toISOString(),
      jeton_prestataire: refPrestataire,
    })
    .eq('reference', paiement.reference);

  console.log(
    `Paiement ${paiement.reference} encaissé (${verdict.montant} XOF, ${verdict.operateur},`
    + ` frais ${verdict.frais}, net ${verdict.net}) — accès prolongé.`,
  );

  return NextResponse.json({ ok: true, accepte: true, ouvert: true });
}
