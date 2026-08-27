import { HORS_DE_PORTEE, traitementsDuClient } from '@/lib/donneesPersonnelles';
import { numeroMasque, prouverClient } from '@/lib/preuveClient';
import { rassemblerDossier } from '@/lib/dossierClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * « Montrez-moi ce que vous détenez sur moi. »
 *
 * ── POURQUOI CETTE ROUTE EST EN POST ───────────────────────────────────────
 *
 * Un GET porterait la référence et les quatre chiffres dans l'URL : ils
 * atterriraient dans l'historique du navigateur, dans les journaux de
 * l'hébergeur, et dans l'en-tête `Referer` de tout lien cliqué depuis la page.
 * Sur un écran dont l'objet même est la retenue, ce serait un contresens.
 *
 * ── CE QU'ON NE FAIT PAS : JOURNALISER LA CONSULTATION ─────────────────────
 *
 * Aucune ligne n'est écrite dans `demandes_droits` quand quelqu'un REGARDE son
 * dossier. La tentation était forte — « traçons tout » — mais garder qui a
 * consulté ses données, et quand, serait collecter DAVANTAGE sur une personne
 * venue demander qu'on en garde moins. Seul l'effacement laisse une trace,
 * parce que lui seul a besoin d'être prouvé plus tard.
 */
export async function POST(req: Request) {
  let corps: { ref?: unknown; t?: unknown; tel4?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return Response.json({ error: 'Demande illisible.' }, { status: 400 });
  }

  const preuve = await prouverClient(req, {
    ref: corps.ref,
    jeton: corps.t,
    tel4: corps.tel4,
  });
  if (!preuve.ok) {
    return Response.json({ error: preuve.message }, { status: preuve.statut, headers: preuve.entetes });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Service temporairement indisponible.' }, { status: 503 });

  try {
    const dossier = await rassemblerDossier(sb, preuve.telephone);

    return Response.json({
      numero: numeroMasque(preuve.telephone),
      commandes: dossier.commandes,
      paniers: dossier.paniers,
      relances: dossier.relances,
      avisLivraison: dossier.avisLivraison,
      refusDemarchage: dossier.refusDemarchage,
      demandesAnterieures: dossier.demandesAnterieures,
      /**
       * Le catalogue complet accompagne le dossier : voir « trois commandes »
       * ne dit pas ce qu'on en garde ni combien de temps. C'est cette liste qui
       * répond, et elle vient du même inventaire que le registre — les deux ne
       * peuvent donc pas se contredire.
       */
      traitements: traitementsDuClient(),
      horsDePortee: HORS_DE_PORTEE,
    });
  } catch (e) {
    // Un dossier incomplet est une réponse FAUSSE à une question de droit :
    // « rien à votre nom » sur une panne de lecture serait le pire des
    // messages. On refuse plutôt que de rassurer à tort.
    console.error('Droits — dossier non constitué :', e instanceof Error ? e.message : e);
    return Response.json(
      { error: 'Vos données n’ont pas pu être rassemblées. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
