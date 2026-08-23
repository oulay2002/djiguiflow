import { exigerAdmin } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Le tableau de l'exploitant : qui a besoin de moi aujourd'hui.
 *
 * CE N'EST PAS UN TABLEAU DE CHIFFRES, ET C'EST VOULU. Savoir qu'on a trois
 * marchands ne dit rien a faire. Ce qui compte, c'est de voir OU CHACUN EST
 * BLOQUE : celui qui s'est inscrit sans se brancher n'a pas besoin de la meme
 * chose que celui qui vendait et s'est arrete.
 *
 * Le goulot de la plateforme n'est pas le trafic, c'est l'offre marchande.
 * Cette page est faite pour la regarder.
 *
 * ELLE VOIT TOUT, DONC ELLE EST STRICTEMENT FERMEE. `exigerAdmin` est
 * fail-closed : sans `ADMIN_EMAILS`, personne n'est admin. Un tableau ouvert
 * a tous exposerait le chiffre d'affaires de chaque commercant a ses
 * concurrents.
 */

/** Au-dela, un marchand qui vendait s'est arrete : c'est le signal a rattraper. */
const JOURS_SOMMEIL = 14;
/** La fenetre de reference pour « vend en ce moment ». */
const JOURS_ACTIVITE = 30;

type EtatMarchand = 'non branche' | 'branche sans vente' | 'vend' | 'en sommeil';

export async function GET(req: Request) {
  const acces = await exigerAdmin(req);
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const maintenant = Date.now();
  const depuisActivite = new Date(maintenant - JOURS_ACTIVITE * 86_400_000).toISOString();
  const seuilSommeil = maintenant - JOURS_SOMMEIL * 86_400_000;

  // ---- Les boutiques, avec de quoi juger leur branchement.
  const { data: boutiques, error: errBoutiques } = await sb
    .from('boutiques')
    .select('id, slug, nom, categorie, actif, essai, groupe_livreurs, wasender_secret_id, telegram_secret_id, telegram_marchand')
    .order('nom');

  if (errBoutiques) {
    console.error('Tableau admin — boutiques illisibles :', errBoutiques.message);
    return Response.json({ error: 'Lecture impossible' }, { status: 503 });
  }

  const vraies = (boutiques ?? []).filter((b) => b.essai !== true);
  const ids = vraies.map((b) => b.id);

  // ---- Les commandes qui comptent : ni panier en cours, ni abandon, ni annulation.
  const { data: commandes } = ids.length
    ? await sb
        .from('commandes')
        .select('boutique_id, total, statut, created_at')
        .in('boutique_id', ids)
        .not('statut', 'in', '("panier","abandonnee","annulee")')
    : { data: [] };

  // ---- Les articles en vente, par boutique.
  const { data: produits } = ids.length
    ? await sb.from('produits').select('boutique_id, disponible').in('boutique_id', ids)
    : { data: [] };

  const parBoutique = new Map<string, { commandes: number; ca: number; derniere: number | null; recentes: number; caRecent: number }>();
  for (const c of commandes ?? []) {
    const b = String(c.boutique_id);
    const e = parBoutique.get(b) ?? { commandes: 0, ca: 0, derniere: null, recentes: 0, caRecent: 0 };
    const quand = Date.parse(String(c.created_at ?? '')) || 0;
    const montant = Number(c.total ?? 0);

    e.commandes += 1;
    e.ca += montant;
    if (quand && (e.derniere === null || quand > e.derniere)) e.derniere = quand;
    if (String(c.created_at ?? '') > depuisActivite) { e.recentes += 1; e.caRecent += montant; }

    parBoutique.set(b, e);
  }

  const articles = new Map<string, number>();
  for (const p of produits ?? []) {
    if (p.disponible === false) continue;
    articles.set(String(p.boutique_id), (articles.get(String(p.boutique_id)) ?? 0) + 1);
  }

  const marchands = vraies.map((b) => {
    const stats = parBoutique.get(b.id) ?? { commandes: 0, ca: 0, derniere: null, recentes: 0, caRecent: 0 };
    const nbArticles = articles.get(b.id) ?? 0;

    // CE QUI MANQUE POUR SERVIR UNE COMMANDE — la meme regle que le bandeau
    // rouge du marchand, pour qu'on lui dise ici exactement ce qu'il voit.
    const manque: string[] = [];
    if (!b.wasender_secret_id && !b.telegram_secret_id) manque.push('canal client');
    if (!String(b.groupe_livreurs ?? '').trim()) manque.push('groupe livreurs');
    if (nbArticles === 0) manque.push('articles');

    let etat: EtatMarchand;
    if (manque.length) etat = 'non branche';
    else if (stats.commandes === 0) etat = 'branche sans vente';
    else if (stats.derniere !== null && stats.derniere < seuilSommeil) etat = 'en sommeil';
    else etat = 'vend';

    return {
      slug: b.slug,
      nom: b.nom,
      categorie: b.categorie,
      actif: b.actif !== false,
      articles: nbArticles,
      commandes: stats.commandes,
      commandesRecentes: stats.recentes,
      ca: stats.ca,
      caRecent: stats.caRecent,
      derniereVente: stats.derniere ? new Date(stats.derniere).toISOString() : null,
      manque,
      etat,
    };
  });

  // ---- Les visiteurs : quelle porte ils prennent, jour par jour.
  const { data: portes } = await sb
    .from('compteurs_journaliers')
    .select('cle, jour, valeur')
    .in('cle', ['porte:acheter', 'porte:vendre'])
    .order('jour', { ascending: false })
    .limit(60);

  const parJour = new Map<string, { acheter: number; vendre: number }>();
  for (const p of portes ?? []) {
    const j = String(p.jour);
    const e = parJour.get(j) ?? { acheter: 0, vendre: 0 };
    if (p.cle === 'porte:acheter') e.acheter = Number(p.valeur ?? 0);
    else e.vendre = Number(p.valeur ?? 0);
    parJour.set(j, e);
  }

  const visiteurs = [...parJour.entries()]
    .map(([jour, v]) => ({ jour, ...v }))
    .sort((a, b) => (a.jour < b.jour ? 1 : -1))
    .slice(0, 30);

  // ---- Ce qui est casse en ce moment, tel que la veille l'a vu.
  const { data: anomalies } = await sb
    .from('anomalies_signalees')
    .select('type, reference, signale_le')
    .gt('signale_le', new Date(maintenant - 7 * 86_400_000).toISOString())
    .order('signale_le', { ascending: false })
    .limit(50);

  return Response.json({
    ok: true,
    marchands,
    // L'entonnoir, dans l'ordre ou un marchand le traverse : c'est la forme
    // qui dit ou l'on perd du monde.
    entonnoir: {
      'non branche': marchands.filter((m) => m.etat === 'non branche').length,
      'branche sans vente': marchands.filter((m) => m.etat === 'branche sans vente').length,
      vend: marchands.filter((m) => m.etat === 'vend').length,
      'en sommeil': marchands.filter((m) => m.etat === 'en sommeil').length,
    },
    visiteurs,
    anomalies: anomalies ?? [],
    fenetres: { activiteJours: JOURS_ACTIVITE, sommeilJours: JOURS_SOMMEIL },
  });
}
