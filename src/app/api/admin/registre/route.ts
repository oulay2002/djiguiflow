import { HORS_DE_PORTEE, REGISTRE_MIS_A_JOUR, TRAITEMENTS } from '@/lib/donneesPersonnelles';
import { exigerAdmin } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Le registre des traitements, tel qu'il est à cet instant.
 *
 * ── POURQUOI IL EST CALCULÉ ET NON RÉDIGÉ ──────────────────────────────────
 *
 * Un registre écrit à la main est juste le jour où on l'écrit, puis il vieillit
 * sans que personne ne s'en aperçoive — et un registre faux est pire qu'aucun
 * registre : il atteste par écrit d'un état qui n'est plus. Celui-ci est rendu
 * depuis l'inventaire du code, le même qui sert à l'écran des droits et à
 * l'effacement. Les trois ne peuvent donc pas se contredire.
 *
 * ── POURQUOI IL EST RÉSERVÉ À L'ADMINISTRATEUR ─────────────────────────────
 *
 * Le registre est un document INTERNE, produit à la demande du régulateur. Ce
 * qui est public, c'est la politique de confidentialité — un engagement
 * juridique, qui reste à écrire avec un conseil. Publier ce document-ci à sa
 * place ferait passer un inventaire technique pour un engagement, ce qu'il
 * n'est pas.
 */
export async function GET(req: Request) {
  const admin = await exigerAdmin(req);
  if (!admin.ok) {
    return Response.json({ error: admin.message }, { status: admin.statut });
  }

  const sb = getSupabaseAdmin();

  /**
   * Le nombre de personnes concernées, mesuré et non estimé.
   *
   * Un registre qui annonce « quelques centaines » invite à la question
   * suivante. Ces chiffres viennent de la base, et s'ils manquent on le dit
   * plutôt que d'écrire zéro — zéro serait lu comme « aucune donnée ».
   */
  let volumes: Record<string, number | null> = {};
  if (sb) {
    const compte = async (table: 'commandes' | 'paniers' | 'relances_envoyees'
      | 'relances_stop' | 'livreurs' | 'boutiques' | 'demandes_droits') => {
      const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
      return error ? null : count ?? null;
    };
    volumes = {
      commandes: await compte('commandes'),
      paniers: await compte('paniers'),
      relances: await compte('relances_envoyees'),
      refusDemarchage: await compte('relances_stop'),
      livreurs: await compte('livreurs'),
      boutiques: await compte('boutiques'),
      demandesDroits: await compte('demandes_droits'),
    };
  }

  return Response.json({
    misAJour: REGISTRE_MIS_A_JOUR,
    traitements: TRAITEMENTS,
    horsDePortee: HORS_DE_PORTEE,
    volumes,
    /**
     * CE QUE LE CODE NE PEUT PAS SAVOIR, et qu'il ne faut donc pas inventer.
     *
     * La raison sociale, l'adresse et le responsable désigné sont des faits
     * juridiques, pas des faits techniques. Les remplir ici « pour faire
     * complet » produirait un document faux remis à un régulateur. On les
     * nomme, et on laisse l'administrateur les compléter.
     */
    aCompleter: [
      'Raison sociale et adresse du responsable de traitement',
      'Personne désignée comme point de contact auprès de l’ARTCI',
      'Numéro de déclaration ARTCI, une fois la déclaration effectuée',
      'Analyse des transferts hors Côte d’Ivoire (Supabase, Vercel, hébergeur du serveur d’automatisation) et garanties associées',
      'Relecture des cinq documents de docs/legal/ par un conseil ivoirien : ils existent, ils portent encore des marqueurs « à compléter », et ils restent hors index tant qu’il en reste un',
      'Suppression définitive du document Google, ou de son historique de versions : les colonnes d’identité en ont été retirées le 28 août 2026, mais l’historique du fichier garde trace des valeurs supprimées',
    ],
  });
}
