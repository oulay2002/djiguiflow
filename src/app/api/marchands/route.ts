import { listerMarchands } from '@/lib/marchands';
import { exigerAdmin } from '@/lib/adminAuth';
import { ErreurProvisioning, provisionnerMarchand } from '@/lib/provisioning';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { brancherBotTelegram } from '@/lib/telegramBranchement';
import type { Database } from '@/lib/database.types';

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

/**
 * Rattache les canaux d'un marchand — reserve a l'exploitant.
 *
 * Modele retenu : la plateforme possede le compte wasender, et ouvre une
 * session par marchand. Le commercant garde son numero, mais ne manipule ni
 * jeton ni secret de webhook — c'est l'exploitant qui cree la session, la
 * pointe sur le bon slug et colle les identifiants ici. L'incident du 11 aout
 * 2026, ou une case « messages.received » decochee a coupe la reception sans
 * rien signaler, tient a ce que cette configuration vivait chez le marchand.
 *
 * La boutique est designee explicitement par son slug : l'onboarding, lui,
 * resout « la boutique du compte connecte » et retomberait sur une boutique
 * par defaut pour un admin sans boutique propre — de quoi poser le jeton d'un
 * marchand sur la fiche d'un autre.
 *
 * Aucun jeton ne devient une colonne : ils partent au Vault par les fonctions
 * dediees, et la fiche n'en garde qu'un identifiant.
 */
export async function PATCH(req: Request) {
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

  const slug = String(corps.slug ?? '').trim();
  if (!slug) return Response.json({ error: 'slug requis' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data: boutique } = await sb
    .from('boutiques')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!boutique) return Response.json({ error: `Boutique « ${slug} » introuvable.` }, { status: 404 });

  // Le nom est contraint aux fonctions declarees : une fonction renommee en
  // base casse ici la compilation, plutot qu'un appel a l'execution.
  const rpc = async (
    fonction: keyof Database['public']['Functions'],
    args: Record<string, string>,
  ) => {
    const rep = (await sb.rpc(fonction, args as never)) as {
      error: { message: string } | null;
    };
    return rep.error?.message ?? null;
  };

  const faits: string[] = [];

  if (typeof corps.wasender_token === 'string' && corps.wasender_token.trim()) {
    const echec = await rpc('definir_session_wasender', {
      p_slug: slug,
      p_token: corps.wasender_token.trim(),
    });
    if (echec) {
      console.error(`Canaux — jeton wasender refusé (${slug}) :`, echec);
      return Response.json({ error: 'Jeton WhatsApp refusé.' }, { status: 502 });
    }
    faits.push('WhatsApp connecté');
  }

  if (typeof corps.wasender_webhook_secret === 'string' && corps.wasender_webhook_secret.trim()) {
    const echec = await rpc('definir_secret_webhook', {
      p_slug: slug,
      p_secret: corps.wasender_webhook_secret.trim(),
    });
    if (echec) {
      console.error(`Canaux — secret webhook refusé (${slug}) :`, echec);
      return Response.json({ error: 'Secret de webhook refusé.' }, { status: 502 });
    }
    faits.push('Webhook WhatsApp protégé');
  }

  if (typeof corps.telegram_bot_token === 'string' && corps.telegram_bot_token.trim()) {
    const echec = await rpc('definir_jeton_canal', {
      p_slug: slug,
      p_canal: 'telegram',
      p_jeton: corps.telegram_bot_token.trim(),
    });
    if (echec) {
      console.error(`Canaux — jeton telegram refusé (${slug}) :`, echec);
      return Response.json({ error: 'Jeton Telegram refusé.' }, { status: 502 });
    }

    const branchement = await brancherBotTelegram(slug);
    if (!branchement.ok) {
      return Response.json(
        { error: `Bot enregistré, mais branchement refusé : ${branchement.raison}` },
        { status: branchement.statut },
      );
    }
    faits.push('Bot Telegram branché');
  }

  if (!faits.length) {
    return Response.json({ error: 'Aucun canal à rattacher.' }, { status: 400 });
  }

  console.info(`Canaux marchand « ${slug} » : ${faits.join(', ')} — par ${admin.email}`);
  return Response.json({ ok: true, slug, faits });
}
