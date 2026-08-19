import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { creerOnglet } from '@/lib/googleSheets';
import {
  ENTETES_COMMANDES,
  ENTETES_MENU,
  nomsOngletsParDefaut,
} from '@/lib/provisioning';

export const dynamic = 'force-dynamic';

/**
 * Prepare le classeur d'une boutique : ses onglets, et rien que les siens.
 *
 * POURQUOI CETTE ROUTE EXISTE. Le provisionnement complet (`/api/marchands`)
 * cree les onglets — mais il est reserve a l'administrateur, et une boutique
 * creee par le marchand depuis son tableau de bord n'y passe JAMAIS. Elle
 * n'avait donc pas d'onglet : son assistante ne pouvait ni lire une carte ni
 * enregistrer une commande, et le message d'erreur parlait d'une feuille
 * introuvable — ce qui n'apprend rien a un commercant.
 *
 * TROIS ONGLETS, ET LE NOM DE L'ENSEIGNE DEDANS. Le classeur est partage par
 * la plateforme : ce sont les onglets qui separent les marchands. Un « Notes »
 * sans suffixe enverrait les avis d'une boutique dans ceux d'une autre — c'est
 * arrive.
 *
 * IDEMPOTENTE. `creerOnglet` laisse intact un onglet existant sans reecrire ses
 * en-tetes : rappeler cette route ne peut donc pas effacer des donnees en
 * production. C'est ce qui permet au marchand de cliquer deux fois sans risque.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data: fiche } = await sb
    .from('boutiques')
    .select('slug, sheet_document_id, sheet_commandes, sheet_menu, sheet_notes')
    .eq('id', m.boutiqueId)
    .maybeSingle();

  if (!fiche) return Response.json({ error: 'Boutique introuvable' }, { status: 404 });

  const parDefaut = nomsOngletsParDefaut(String(fiche.slug ?? ''));
  const suffixe = String(fiche.slug ?? '')
    .split('-')
    .map((mot) => (mot ? mot[0].toUpperCase() + mot.slice(1) : ''))
    .join('');

  const commandes = String(fiche.sheet_commandes ?? '').trim() || parDefaut.sheetCommandes;
  const menu = String(fiche.sheet_menu ?? '').trim() || parDefaut.sheetMenu;
  // `Notes` sans suffixe est le piege : c'est l'onglet d'une autre boutique.
  const notesBrut = String(fiche.sheet_notes ?? '').trim();
  const notes = notesBrut && notesBrut.toLowerCase() !== 'notes' ? notesBrut : `Notes_${suffixe}`;

  // Le classeur du marchand s'il en a un, celui de la plateforme sinon.
  const classeur = String(fiche.sheet_document_id ?? '').trim() || process.env.SHEET_ID || '';
  if (!classeur) {
    return Response.json(
      { error: 'Aucun classeur n’est configuré pour la plateforme.' },
      { status: 503 },
    );
  }

  const crees: string[] = [];
  const existants: string[] = [];

  try {
    for (const [titre, entetes] of [
      [commandes, ENTETES_COMMANDES],
      [menu, ENTETES_MENU],
      // Les avis n'ont pas d'en-tete impose : l'onglet suffit.
      [notes, []],
    ] as [string, string[]][]) {
      if (await creerOnglet(titre, entetes, classeur)) crees.push(titre);
      else existants.push(titre);
    }
  } catch (e) {
    console.error(`Onglets — creation impossible (${m.id}) :`, e);
    return Response.json(
      { error: 'Création des onglets impossible. Réessayez dans un instant.' },
      { status: 502 },
    );
  }

  // Les noms sont enregistres APRES coup : une fiche qui pointerait vers un
  // onglet inexistant ferait echouer chaque commande.
  const { error } = await sb
    .from('boutiques')
    .update({ sheet_commandes: commandes, sheet_menu: menu, sheet_notes: notes })
    .eq('id', m.boutiqueId);

  if (error) {
    console.error(`Onglets — enregistrement des noms impossible (${m.id}) :`, error.message);
    return Response.json({ error: 'Onglets créés, mais non enregistrés.' }, { status: 503 });
  }

  return Response.json({ ok: true, crees, existants, onglets: { commandes, menu, notes } });
}
