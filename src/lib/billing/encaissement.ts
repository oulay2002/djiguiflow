import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierPaiement, type ResultatVerification } from '@/lib/billing/geniuspay';
import { prolongerAcces } from '@/lib/billing/periode';

/**
 * Honorer un paiement : du verdict du prestataire a l'acces ouvert.
 *
 * POURQUOI CE FICHIER EXISTE. Deux chemins mènent ici — la notification de
 * GeniusPay, et le rattrapage planifie. Ecrire deux fois les memes gardes sur
 * de l'argent, c'est se garantir qu'elles divergeront : on corrige un jour le
 * controle de montant d'un cote et pas de l'autre, et plus personne ne sait
 * lequel fait foi. Une seule implementation, deux appelants.
 *
 * POURQUOI UN RATTRAPAGE EN PLUS DU WEBHOOK. Un webhook se perd — URL non
 * declaree, panne passagere, deploiement en cours, rejeu abandonne apres un
 * 200. Constate le 17 aout 2026 : GeniusPay a confirme un paiement
 * (`completed`, 10 000 XOF) que notre base a laisse `en_attente` faute de
 * notification. Le marchand avait paye et n'avait pas son acces. Une plateforme
 * qui n'encaisse que si un message arrive n'encaisse pas de facon fiable.
 *
 * LE RATTRAPAGE N'EST PAS UNE SECONDE SOURCE DE VERITE : il pose exactement les
 * memes questions au prestataire, avec exactement les memes gardes.
 */

export type IssueEncaissement =
  | { etat: 'introuvable' }
  | { etat: 'deja' }
  | { etat: 'sans_jeton' }
  | { etat: 'indetermine'; statutBrut: string | null }
  | { etat: 'refuse'; motif: 'statut' | 'montant'; statutBrut: string | null }
  | { etat: 'sandbox' }
  | { etat: 'acces_non_ouvert'; erreur: string }
  | { etat: 'honore'; montant: number | null; operateur: string | null };

/**
 * Le bac a sable peut-il ouvrir un acces ? Sortie de la chaine pour etre
 * eprouvee : un test qui RECOPIE la regle prouverait le contraire du code sans
 * rien dire.
 */
export function bacASableAccepte(): boolean {
  return (
    process.env.VERCEL_ENV !== 'production' && process.env.GENIUSPAY_ACCEPTE_SANDBOX === '1'
  );
}

export async function honorerPaiement(params: {
  /** NOTRE reference, celle de la table `paiements`. */
  reference: string;
  /**
   * Reference du prestataire, quand l'appelant la connait et que la ligne ne la
   * porte pas — c'est le cas d'une notification arrivee alors que le checkout
   * n'avait pas reussi a la conserver. Elle est alors ECRITE au passage, pour
   * que le rattrapage puisse reprendre la main plus tard.
   */
  refPrestataire?: string | null;
  /**
   * Verdict deja obtenu par l'appelant, s'il a du interroger l'API pour
   * retrouver le paiement. Le repasser evite un second appel pour rien.
   */
  verdictConnu?: ResultatVerification | null;
}): Promise<IssueEncaissement> {
  const sb = getSupabaseAdmin();
  if (!sb) return { etat: 'acces_non_ouvert', erreur: 'Base indisponible.' };

  const { data: paiement, error } = await sb
    .from('paiements')
    .select('reference, user_id, plan_key, mois, montant_fcfa, statut, jeton_prestataire')
    .eq('reference', params.reference)
    .maybeSingle();

  if (error) {
    return { etat: 'acces_non_ouvert', erreur: `Lecture impossible : ${error.message}` };
  }
  if (!paiement) return { etat: 'introuvable' };

  // Idempotence : le prestataire rejoue ses notifications, et le rattrapage
  // repasse. Sans cette sortie, l'acces serait prolonge deux fois pour un seul
  // paiement.
  if (paiement.statut === 'paye') return { etat: 'deja' };

  const jeton =
    String(paiement.jeton_prestataire ?? '').trim()
    || String(params.refPrestataire ?? '').trim();

  if (!params.verdictConnu && !jeton) {
    // Sans la reference du prestataire, il n'y a rien a interroger. Le paiement
    // reste EN ATTENTE : ce n'est pas un refus, c'est une trace manquante chez
    // nous, et l'argent a pu etre preleve.
    return { etat: 'sans_jeton' };
  }

  const verdict = params.verdictConnu ?? (await verifierPaiement(jeton));

  // On NE SAIT PAS : prestataire injoignable, corps illisible, ou statut
  // `pending`/`processing`. L'argent peut avoir ete preleve. Classer ce cas en
  // « echoue » enterrerait un paiement encaisse.
  if (verdict.indetermine) {
    return { etat: 'indetermine', statutBrut: verdict.statutBrut };
  }

  if (!verdict.accepte) {
    await sb
      .from('paiements')
      .update({ statut: 'echoue', operateur: verdict.operateur })
      .eq('reference', paiement.reference);
    return { etat: 'refuse', motif: 'statut', statutBrut: verdict.statutBrut };
  }

  // Le montant encaisse doit etre celui qu'on a demande. Sans ce controle, une
  // transaction de 200 FCFA ouvrirait les droits d'un plan a 25 000 : il
  // suffirait de savoir forger une reference et de payer une piece.
  if (verdict.montant !== null && verdict.montant !== paiement.montant_fcfa) {
    await sb
      .from('paiements')
      .update({ statut: 'echoue', operateur: verdict.operateur })
      .eq('reference', paiement.reference);
    return { etat: 'refuse', motif: 'montant', statutBrut: verdict.statutBrut };
  }

  // Une transaction simulee est reussie par construction : l'honorer donnerait
  // un acces que personne n'a paye. Le paiement reste EN ATTENTE, jamais
  // « echoue » — il n'a rien fait de mal.
  //
  // LE DRAPEAU NE VAUT PAS EN PRODUCTION, et c'est le coeur de ce garde.
  //
  // Constate le 22 aout 2026 : `GENIUSPAY_ACCEPTE_SANDBOX` valait « 1 » sur le
  // deploiement de production, ou la cle GeniusPay est justement une cle de bac
  // a sable. La chaine etait donc complete : s'inscrire — l'inscription est
  // libre — demander un paiement, le « regler » dans le bac a sable, et
  // repartir avec un abonnement Pro REEL. Le controle du montant ne protege
  // rien : l'argent du bac a sable n'existe pas.
  //
  // Une variable d'environnement posee pour eprouver la chaine se retire mal :
  // elle survit au test qui l'a justifiee. On ne compte donc plus dessus en
  // production — un contournement de paywall ne doit pas tenir a ce que
  // quelqu'un se souvienne d'une case.
  //
  // CE QU'ON PERD, ET POURQUOI CE N'EST PAS GRAVE : atteindre cette ligne prouve
  // deja que tout l'amont a fonctionne — notification recue, verdict obtenu du
  // prestataire, montant conforme. `etat: 'sandbox'` est donc un SUCCES de test,
  // pas un echec. Seule la derniere marche, celle qui donne les droits, n'est
  // pas franchie.
  if (verdict.environnement === 'sandbox' && !bacASableAccepte()) {
    return { etat: 'sandbox' };
  }

  const prolongation = await prolongerAcces({
    userId: paiement.user_id,
    planKey: paiement.plan_key,
    mois: paiement.mois,
    reference: paiement.reference,
  });

  // Le paiement est encaisse mais l'acces n'est pas ouvert : le seul cas ou
  // l'on VEUT que l'appelant reessaie, et qu'une alerte parte. Le statut reste
  // `en_attente` pour que le rattrapage le reprenne.
  if (!prolongation.ok) {
    return { etat: 'acces_non_ouvert', erreur: prolongation.erreur ?? 'inconnue' };
  }

  await sb
    .from('paiements')
    .update({
      statut: 'paye',
      operateur: verdict.operateur,
      paye_le: new Date().toISOString(),
      // Conserve la reference du prestataire meme quand elle nous arrive par la
      // notification : sans elle, plus rien n'est verifiable a posteriori.
      ...(jeton ? { jeton_prestataire: jeton } : {}),
    })
    .eq('reference', paiement.reference);

  return { etat: 'honore', montant: verdict.montant, operateur: verdict.operateur };
}
