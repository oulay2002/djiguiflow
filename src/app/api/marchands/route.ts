import { listerMarchands } from '@/lib/marchands';
import { exigerAdmin } from '@/lib/adminAuth';
import { ErreurProvisioning, provisionnerMarchand } from '@/lib/provisioning';

export const dynamic = 'force-dynamic';

// Alimente la vitrine publique et le sélecteur de boutique du dashboard.
// La projection ci-dessous n'est pas cosmétique : cette route est ouverte à
// tous (CHEMINS_API_PUBLICS), et `Marchand` porte l'ID du classeur Google, le
// groupe Telegram des livreurs et le numéro WhatsApp du marchand. Les
// automatisations qui ont besoin de ces champs passent par
// GET /api/internal/boutiques, protégé par SYNC_SECRET.
export async function GET() {
  try {
    const marchands = (await listerMarchands()).map(m => ({
      id: m.id,
      nom: m.nom,
      secteur: m.secteur,
      emoji: m.emoji,
    }));
    return Response.json({ marchands });
  } catch (e) {
    console.error('Registre marchands — lecture impossible :', e);
    // Liste vide : le dashboard retombe sur le marchand par défaut
    // au lieu de planter.
    return Response.json({ marchands: [] });
  }
}

/**
 * Provisionne un marchand : « + Ajouter un marchand » du dashboard admin.
 *
 * Crée d'un coup ses onglets, sa fiche boutique et ses réglages de
 * notification. Aucun webhook ni code nouveau : le marchand devient une
 * ligne de registre que le tuyau générique sait servir.
 *
 * Réservé aux emails listés dans ADMIN_EMAILS.
 */
export async function POST(req: Request) {
  const admin = await exigerAdmin(req);
  if (!admin.ok) {
    return Response.json({ error: admin.message }, { status: admin.statut });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return Response.json({ error: 'Corps de requête illisible.' }, { status: 400 });
  }

  try {
    const resultat = await provisionnerMarchand({
      nom: String(corps.nom ?? ''),
      email: String(corps.email ?? ''),
      slug: corps.slug ? String(corps.slug) : undefined,
      categorie: corps.categorie ? String(corps.categorie) : undefined,
      zone: corps.zone ? String(corps.zone) : undefined,
      telephone: corps.telephone ? String(corps.telephone) : undefined,
      emoji: corps.emoji ? String(corps.emoji) : undefined,
      whatsapp: corps.whatsapp ? String(corps.whatsapp) : undefined,
      groupeLivreurs: corps.groupe_livreurs ? String(corps.groupe_livreurs) : undefined,
      sheetCommandes: corps.sheet_commandes ? String(corps.sheet_commandes) : undefined,
      sheetMenu: corps.sheet_menu ? String(corps.sheet_menu) : undefined,
      creerOnglets: corps.creer_onglets !== false,
    });

    console.info(`Provisioning marchand « ${resultat.slug} » par ${admin.email}`);
    return Response.json({ ok: true, marchand: resultat }, { status: 201 });
  } catch (e) {
    if (e instanceof ErreurProvisioning) {
      console.error(`Provisioning refusé (${e.statut}) :`, e.message);
      return Response.json({ error: e.message }, { status: e.statut });
    }
    console.error('Provisioning marchand — échec inattendu :', e);
    return Response.json({ error: 'Provisioning impossible, réessayez.' }, { status: 500 });
  }
}
