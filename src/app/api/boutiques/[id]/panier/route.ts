import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';
import { normaliserTelephone } from '@/lib/telephone';

export const dynamic = 'force-dynamic';

/**
 * Le panier tel qu'il est, AVANT que le client ne valide.
 *
 * POURQUOI. Le marchand ne voit que ses ventes, jamais ses quasi-ventes. Un
 * client qui compose un panier, saisit son numero et s'arrete ne laisse aucune
 * trace — impossible de savoir combien on en perd, ni ou ca coince. On mesure
 * donc l'etape juste avant la validation, la seule qui ait de la valeur.
 *
 * CE QUE CETTE ROUTE NE FAIT PAS : constituer une liste de demarchage. Un
 * client de la vitrine n'a jamais ecrit sur WhatsApp ; lui envoyer un message
 * serait le premier contact non sollicite qui fait bannir une session.
 *
 * Route PUBLIQUE, appelee par la vitrine sans compte. Elle est donc ecrite en
 * supposant qu'on lui envoie n'importe quoi : bornes sur tout, un seul
 * enregistrement par numero, et un plafond journalier par boutique.
 */

/** Assez pour un gros panier, trop peu pour remplir la table. */
const LIGNES_MAX = 50;
/** Ecritures acceptees par boutique et par jour, garde-fou anti-abus. */
const PLAFOND_JOUR = 500;

type Ligne = { id: string; nom: string; quantite: number; prix: number };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: slug } = await ctx.params;

  const m = await resoudreMarchand(slug);
  if (!m) return Response.json({ error: 'Boutique inconnue' }, { status: 404 });

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  // Sans numero, on ne saurait ni regrouper les mises a jour d'un meme client,
  // ni dire au marchand qui rappeler. Un panier anonyme n'apprend rien.
  const tel = normaliserTelephone(corps.tel ?? corps.telephone);
  if (!tel.ok) return Response.json({ error: 'Téléphone invalide' }, { status: 400 });

  const brutes = Array.isArray(corps.lignes) ? corps.lignes : [];
  if (!brutes.length) return Response.json({ error: 'Panier vide' }, { status: 400 });

  const lignes: Ligne[] = brutes.slice(0, LIGNES_MAX).map((l) => {
    const o = (l ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? '').slice(0, 64),
      nom: String(o.nom ?? '').slice(0, 120),
      quantite: Math.max(0, Math.min(999, Number(o.quantite) || 0)),
      prix: Math.max(0, Number(o.prix) || 0),
    };
  });

  const articles = lignes.reduce((s, l) => s + l.quantite, 0);
  const total = lignes.reduce((s, l) => s + l.quantite * l.prix, 0);
  if (!articles) return Response.json({ error: 'Panier vide' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const boutiqueUuid = m.boutiqueId;
  if (!boutiqueUuid) return Response.json({ error: 'Boutique non reliée' }, { status: 409 });

  // Le plafond protege la table d'un robot qui ferait tourner des numeros.
  // Il est journalier et par boutique : un abus ne genera jamais un voisin.
  try {
    const { data } = await sb.rpc('incrementer_compteur', {
      p_cle: `paniers:${m.id}`,
      p_plafond: PLAFOND_JOUR,
    });
    const verdict = Array.isArray(data) ? data[0] : null;
    if (verdict && verdict.autorise === false) {
      // On refuse en silence pour le client : ce n'est pas SA commande qui est
      // refusee, c'est une mesure qu'on renonce a prendre. Rien ne doit
      // apparaitre a l'ecran.
      return Response.json({ ok: true, mesure: false });
    }
  } catch (e) {
    console.error(`Panier — compteur illisible (${m.id}) :`, e);
  }

  // Un seul enregistrement par numero : le client qui ajuste son panier trois
  // fois est un client, pas trois paniers perdus.
  const { error } = await sb.from('paniers').upsert(
    {
      boutique_id: boutiqueUuid,
      telephone: tel.international,
      nom: String(corps.nom ?? '').trim().slice(0, 80) || null,
      lignes,
      articles,
      total,
      maj_le: new Date().toISOString(),
      // Un panier repris apres une commande redevient un panier en cours.
      converti_le: null,
      commande_id: null,
    },
    { onConflict: 'boutique_id,telephone' },
  );

  if (error) {
    // Jamais bloquant : une mesure ratee ne doit pas peser sur le client, qui
    // n'a rien demande et ne saurait qu'en faire.
    console.error(`Panier — enregistrement impossible (${m.id}) :`, error.message);
    return Response.json({ ok: true, mesure: false });
  }

  return Response.json({ ok: true, mesure: true });
}
