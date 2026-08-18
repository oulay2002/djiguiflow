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
  // laquelle il n'y a rien a interroger. Les paiements CinetPay n'en ont pas et
  // sont donc naturellement hors de ce balayage.
  const { data: enAttente, error } = await sb
    .from('paiements')
    .select('reference, created_at')
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
    etat: IssueEncaissement['etat'];
    heures: number;
  }[] = [];
  let honores = 0;

  for (const ligne of lignes) {
    const reference = String(ligne.reference ?? '');
    if (!reference) continue;

    const naissance = Date.parse(String(ligne.created_at ?? ''));
    const heures = Number.isFinite(naissance)
      ? Math.round((Date.now() - naissance) / 3600_000)
      : 0;

    const issue = await honorerPaiement({ reference });
    resultats.push({ reference, etat: issue.etat, heures });

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

  // CE QUI DOIT REVEILLER QUELQU'UN. Un paiement que le rattrapage n'arrive pas
  // a honorer depuis plus de deux heures, c'est un marchand qui a peut-etre
  // paye et qui n'a pas son acces. `deja` et `honore` sont des succes ; tout le
  // reste, passe ce delai, est un dossier ouvert que personne ne regarde.
  const bloques = resultats.filter(
    (r) => r.etat !== 'honore' && r.etat !== 'deja' && r.heures >= SEUIL_ALERTE_H,
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
  return NextResponse.json({
    examines: lignes.length,
    honores,
    bloques: bloques.length,
    detailBloques: bloques,
    seuilAlerteH: SEUIL_ALERTE_H,
    fenetreJours: FENETRE_JOURS,
    resultats,
  });
}
