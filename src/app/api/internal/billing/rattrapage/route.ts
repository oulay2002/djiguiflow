import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { honorerPaiement, type IssueEncaissement } from '@/lib/billing/encaissement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rattrape les paiements confirmes chez le prestataire mais restes en attente
 * chez nous.
 *
 * POURQUOI CETTE ROUTE EXISTE. Le 17 aout 2026, GeniusPay a confirme un
 * paiement — `completed`, 10 000 XOF — que notre base a laisse `en_attente`
 * faute de notification : l'URL du webhook n'etait pas encore declaree chez
 * eux. Le marchand avait paye et n'avait pas son acces, et rien ne l'aurait
 * jamais rattrape.
 *
 * Un webhook se perd, toujours : URL absente, panne passagere, deploiement en
 * cours, rejeu abandonne apres un 200. **Une plateforme qui n'encaisse que si
 * un message arrive n'encaisse pas de facon fiable.** Le prestataire, lui,
 * repond quand on l'interroge. C'est donc a nous d'aller voir.
 *
 * A APPELER REGULIEREMENT depuis n8n, comme les autres taches planifiees.
 *
 * ELLE NE PEUT PAS OUVRIR PLUS QUE LE WEBHOOK : elle passe par la meme fonction
 * `honorerPaiement`, donc par les memes gardes — idempotence, montant confronte
 * a l'attendu, bac a sable refuse, indetermine laisse en attente.
 */

/** Au-dela, une transaction n'est plus honoree automatiquement. */
const FENETRE_JOURS = 7;

/** Filet : on ne veut pas cent appels au prestataire dans une seule execution. */
const MAX_PAR_PASSAGE = 25;

/**
 * Au-dela de ce delai, un paiement encore en attente doit REVEILLER QUELQU'UN.
 *
 * Le rattrapage rate en silence : il rend `honores: 0` et l'execution n8n reste
 * verte. Or un paiement bloque, c'est un marchand qui a peut-etre paye et qui
 * n'a pas son acces — le pire etat possible, et celui que personne ne voit.
 *
 * Deux heures laissent passer ce qui est normal : une transaction `pending` que
 * le client n'a pas encore validee sur son telephone, ou une passerelle Mobile
 * Money lente. Au-dela, ce n'est plus de la patience, c'est de l'aveuglement.
 */
const SEUIL_ALERTE_H = 2;

function autorise(req: Request): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
}

export async function POST(req: Request) {
  if (!autorise(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });

  const depuis = new Date(Date.now() - FENETRE_JOURS * 86400_000).toISOString();

  // `jeton_prestataire` non nul : c'est la reference du prestataire, sans
  // laquelle il n'y a rien a interroger. Ceux qui n'en ont pas sont repris plus
  // bas — on ne peut pas les VERIFIER, on refuse seulement qu'ils disparaissent.
  const { data: enAttente, error } = await sb
    .from('paiements')
    .select('reference, created_at, jeton_prestataire, alerte_envoyee_le')
    .eq('statut', 'en_attente')
    .not('jeton_prestataire', 'is', null)
    .gte('created_at', depuis)
    .order('created_at', { ascending: true })
    .limit(MAX_PAR_PASSAGE);

  if (error) {
    console.error('Rattrapage — lecture impossible :', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 503 });
  }

  const lignes = enAttente ?? [];
  const resultats: {
    reference: string;
    // `statut_non_enregistre` n'est pas rendu par `honorerPaiement` : il est
    // DERIVE ici, quand l'acces a bien ete ouvert mais que la ligne de compte
    // n'a pas suivi. Il n'existe que pour que l'alerte le voie.
    etat: IssueEncaissement['etat'] | 'statut_non_enregistre';
    heures: number;
    /** Jeton de bac a sable : aucun franc reel n'est en jeu. */
    bacASable: boolean;
    /** Deja signale une fois. On ne le redit pas. */
    dejaSignale: boolean;
  }[] = [];
  let honores = 0;

  for (const ligne of lignes) {
    const reference = String(ligne.reference ?? '');
    if (!reference) continue;

    // LE BAC A SABLE N'EST PAS DE L'ARGENT.
    //
    // Le prestataire prefixe ses jetons d'essai par `SANDBOX_`. Un paiement
    // d'essai bloque, c'est un test qu'on a laisse ouvert — pas un marchand
    // qui attend son acces. Les confondre coute cher dans un seul sens : le
    // 25 aout 2026, un unique jeton d'essai laisse en attente la veille a fait
    // ECHOUER CE WORKFLOW TOUTES LES QUINZE MINUTES, quarante-deux fois dans
    // la journee. Une liste d'executions rouge en permanence ne se lit plus,
    // et la vraie panne du lendemain s'y serait perdue.
    //
    // Il n'est pas ecarte du RATTRAPAGE — on tente de l'honorer comme les
    // autres, et un bac a sable qui se debloque est une information utile.
    // Il est ecarte de l'ALERTE, qui ne parle que d'argent reel.
    const bacASable = String(ligne.jeton_prestataire ?? '')
      .trim()
      .toUpperCase()
      .startsWith('SANDBOX_');

    // ON ALERTE UNE FOIS, PUIS ON SE TAIT.
    //
    // Le seuil de deux heures OUVRAIT l'alerte, rien ne la refermait : un
    // paiement bloque qui ne se resout jamais la relancait a chaque passage.
    // Un dossier ouvert reste ouvert — le redire tous les quarts d'heure
    // n'ajoute rien et finit par rendre la liste d'executions illisible.
    const dejaSignale = Boolean(String(ligne.alerte_envoyee_le ?? '').trim());

    const naissance = Date.parse(String(ligne.created_at ?? ''));
    const heures = Number.isFinite(naissance)
      ? Math.round((Date.now() - naissance) / 3600_000)
      : 0;

    const issue = await honorerPaiement({ reference });
    // `statutNonEnregistre` veut dire : l'argent est encaisse, l'acces est
    // ouvert, mais la ligne `paiements` n'a PAS pu passer a `paye`. Le dossier
    // reviendra a chaque passage sans jamais alerter, puisque le filtre
    // ci-dessous ecarte les `honore`. On le compte donc comme bloque.
    const statutPerdu = 'statutNonEnregistre' in issue && issue.statutNonEnregistre === true;
    resultats.push({
      reference,
      etat: statutPerdu ? 'statut_non_enregistre' : issue.etat,
      heures,
      bacASable,
      dejaSignale,
    });

    if (statutPerdu) {
      console.error(
        `Rattrapage — ${reference} encaissé et accès ouvert, mais le statut « payé »`
        + " n'a pas pu être écrit. Le dossier restera ouvert tant qu'il n'est pas corrigé.",
      );
    }

    if (issue.etat === 'honore') {
      honores++;
      console.log(
        `Rattrapage — ${reference} honoré (${issue.montant} XOF, ${issue.operateur}).`
        + ' Le webhook n’était pas arrivé.',
      );
    } else if (issue.etat === 'acces_non_ouvert') {
      // Encaisse mais acces ferme : la seule situation qui merite une alerte.
      console.error(`Rattrapage — ${reference} encaissé mais accès non ouvert : ${issue.erreur}`);
    }
  }

  /**
   * LES PAIEMENTS SANS JETON — CEUX QUI SORTAIENT DU CHAMP DE VISION.
   *
   * ── LE TROU, MESURE LE 3 SEPTEMBRE 2026 ──────────────────────────────────
   *
   * Le balayage ci-dessus exige `jeton_prestataire is not null`, et c'est juste
   * pour ce qu'il fait : sans reference du prestataire, il n'y a rien a lui
   * demander. Mais ces paiements-la n'etaient alors NI examines, NI comptes, NI
   * signales, NI listes dans les dossiers ouverts. Ils disparaissaient — ce que
   * les commentaires de cette route interdisent explicitement quelques lignes
   * plus bas : « un marchand qui a paye sans recevoir son acces ne doit jamais
   * sortir du champ de vision ».
   *
   * Le banc `scripts/essai-rattrapage.mjs` l'a montre en production avant qu'on
   * y touche : le paiement porteur d'un jeton etait examine et signale, celui
   * sans jeton restait INVISIBLE, meme vieux de trois heures.
   *
   * ── QUAND CA ARRIVE ──────────────────────────────────────────────────────
   *
   * Le jeton est ecrit au checkout par une mise a jour SEPAREE de l'insertion,
   * juste apres l'appel au prestataire. Son echec n'est que journalise — a
   * dessein, car refuser la commande a ce stade serait pire. Mais le paiement
   * existe alors sans jeton, et le tunnel s'est ouvert : le marchand peut
   * payer. Personne ne le rattrapera jamais.
   *
   * ── CE QU'ON EN FAIT ─────────────────────────────────────────────────────
   *
   * On ne peut pas les verifier : on ne le tente donc pas, et on ne pretend pas
   * le contraire. On les fait simplement REJOINDRE la meme machinerie —
   * l'alerte a deux heures, le « une fois puis silence », les dossiers ouverts.
   * Une seconde voie d'alerte serait une voie de plus a oublier.
   */
  const { data: sansJeton, error: errSansJeton } = await sb
    .from('paiements')
    .select('reference, created_at, alerte_envoyee_le')
    .eq('statut', 'en_attente')
    .is('jeton_prestataire', null)
    .gte('created_at', depuis)
    .order('created_at', { ascending: true })
    .limit(MAX_PAR_PASSAGE);

  if (errSansJeton) {
    console.error('Rattrapage — lecture des paiements sans jeton impossible :', errSansJeton.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 503 });
  }

  for (const ligne of sansJeton ?? []) {
    const reference = String(ligne.reference ?? '');
    if (!reference) continue;

    const naissance = Date.parse(String(ligne.created_at ?? ''));
    resultats.push({
      reference,
      // L'etat existe deja dans `IssueEncaissement` : on ne fabrique pas un
      // vocabulaire parallele pour dire la meme chose.
      etat: 'sans_jeton',
      heures: Number.isFinite(naissance) ? Math.round((Date.now() - naissance) / 3600_000) : 0,
      // Sans jeton, impossible de savoir si c'est un essai : on ne l'ecarte
      // donc pas de l'alerte. Le repli penche du cote qui reveille.
      bacASable: false,
      dejaSignale: Boolean(String(ligne.alerte_envoyee_le ?? '').trim()),
    });
  }

  // CE QUI DOIT REVEILLER QUELQU'UN. Un paiement que le rattrapage n'arrive pas
  // a honorer depuis plus de deux heures, c'est un marchand qui a peut-etre
  // paye et qui n'a pas son acces. `deja` et `honore` sont des succes ; tout le
  // reste, passe ce delai, est un dossier ouvert que personne ne regarde.
  const bloques = resultats.filter(
    (r) => !r.bacASable
      && !r.dejaSignale
      && r.etat !== 'honore'
      && r.etat !== 'deja'
      && r.heures >= SEUIL_ALERTE_H,
  );

  if (bloques.length > 0) {
    console.error(
      `Rattrapage — ${bloques.length} paiement(s) bloqué(s) depuis plus de ${SEUIL_ALERTE_H}h : `
      + bloques.map((b) => `${b.reference} (${b.etat}, ${b.heures}h)`).join(', '),
    );
  }

  // Toujours 200 : c'est un balayage, pas une transaction. Un paiement encore
  // `pending` chez le prestataire n'est pas une panne, et repondre en erreur
  // ferait rougir une execution n8n parfaitement normale. L'alerte se declenche
  // sur `bloques`, que l'appelant n8n teste — pas sur le code HTTP.
  // CE QUI EST ECARTE DE L'ALERTE EST COMPTE ICI, ET C'EST LA CONDITION POUR
  // POUVOIR L'ECARTER. Un dossier retire d'une alerte sans laisser de trace
  // devient un dossier oublie : le bac a sable disparaitrait du bruit et
  // disparaitrait aussi de la vue. Il figure donc dans la reponse, lisible
  // dans l'execution n8n et par tout appelant.
  const bacASable = resultats.filter(
    (r) => r.bacASable && r.etat !== 'honore' && r.etat !== 'deja',
  );

  if (bacASable.length > 0) {
    console.log(
      `Rattrapage — ${bacASable.length} paiement(s) de bac à sable en attente, `
      + 'hors alerte (aucun franc réel) : '
      + bacASable.map((b) => `${b.reference} (${b.etat}, ${b.heures}h)`).join(', '),
    );
  }

  /**
   * LES DOSSIERS DEJA OUVERTS — SILENCIEUX DANS L'ALERTE, VISIBLES DANS LE
   * RAPPORT.
   *
   * C'est la contrepartie indispensable du « une fois puis silence ». Se taire
   * ET disparaitre, ce serait remplacer un dossier bruyant par un dossier
   * oublie — et un marchand qui a paye sans recevoir son acces ne doit jamais
   * sortir du champ de vision.
   *
   * Ils figurent donc dans chaque reponse, lisibles dans l'execution n8n, et
   * comptes. Ils ne font simplement plus lever le workflow.
   */
  const dossiersOuverts = resultats.filter(
    (r) => r.dejaSignale && !r.bacASable && r.etat !== 'honore' && r.etat !== 'deja',
  );

  if (dossiersOuverts.length > 0) {
    console.warn(
      `Rattrapage — ${dossiersOuverts.length} dossier(s) toujours bloqué(s), déjà signalé(s) `
      + 'une fois et donc hors alerte : '
      + dossiersOuverts.map((b) => `${b.reference} (${b.etat}, ${b.heures}h)`).join(', '),
    );
  }

  /**
   * ON MARQUE CE QU'ON VIENT DE SIGNALER, et seulement cela.
   *
   * Sans cette ecriture, le filtre ne s'enclenche jamais et l'alerte se repete
   * comme avant. Elle vit EN BASE et non dans la memoire du workflow n8n :
   * celle-ci est perdue quand l'execution echoue — or elle echoue precisement
   * quand il y a quelque chose a retenir.
   *
   * Elle n'est PAS bloquante. Si elle rate, le dossier sera resignale au
   * prochain passage : une alerte de trop vaut mieux qu'une alerte perdue.
   */
  if (bloques.length > 0) {
    const { error: errMarque } = await sb
      .from('paiements')
      .update({ alerte_envoyee_le: new Date().toISOString() })
      .in('reference', bloques.map((b) => b.reference));

    if (errMarque) {
      console.error(
        'Rattrapage — impossible de marquer les paiements signalés, '
        + `ils le seront à nouveau au prochain passage : ${errMarque.message}`,
      );
    }
  }

  return NextResponse.json({
    // EXAMINES COMPTE TOUT CE QU'ON A REGARDE, pas seulement ce qu'on a pu
    // interroger : un chiffre qui tait la moitie de ce qu'il couvre rassure a
    // tort, et c'est ce silence qui a laisse les paiements sans jeton dehors.
    examines: resultats.length,
    interroges: lignes.length,
    sansJeton: resultats.filter((r) => r.etat === 'sans_jeton').length,
    honores,
    bloques: bloques.length,
    detailBloques: bloques,
    bacASable: bacASable.length,
    detailBacASable: bacASable,
    dossiersOuverts: dossiersOuverts.length,
    detailDossiersOuverts: dossiersOuverts,
    seuilAlerteH: SEUIL_ALERTE_H,
    fenetreJours: FENETRE_JOURS,
    resultats,
  });
}
