import { NextResponse } from 'next/server';
import { estAdmin } from '@/lib/adminAuth';
import { resoudreMarchand } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { brancherBotTelegram } from '@/lib/telegramBranchement';

export const dynamic = 'force-dynamic';

async function ficheDuConnecte(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return { sb: null as never, erreur: 'Base indisponible', statut: 503 };

  const entete = req.headers.get('authorization') ?? '';
  const token = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : '';
  if (!token) return { sb, erreur: 'Authentification requise.', statut: 401 };

  const { data, error } = await sb.auth.getUser(token);
  const utilisateur = data?.user;
  if (error || !utilisateur) return { sb, erreur: 'Session invalide ou expiree.', statut: 401 };

  // 1) La boutique POSSEDÉE par ce compte
  const { data: possedee } = await sb
    .from('boutiques')
    .select('*')
    .eq('user_id', utilisateur.id)
    .maybeSingle();
  if (possedee) return { sb, boutique: possedee, admin: estAdmin(utilisateur.email) };

  // 2) Admin sans boutique propre → boutique par défaut, sinon la 1ère
  if (estAdmin(utilisateur.email)) {
    let def: { id: string } | null = null;

    const marchand = await resoudreMarchand(null);
    if (marchand) {
      const r1 = await sb
        .from('boutiques')
        .select('id')
        .eq('id', marchand.boutiqueId)
        .maybeSingle();
      def = r1.data;
    }

    if (!def) {
      const r2 = await sb
        .from('boutiques')
        .select('id')
        .order('nom')
        .limit(1)
        .maybeSingle();
      def = r2.data;
    }

    if (def) {
      const r3 = await sb.from('boutiques').select('*').eq('id', def.id).maybeSingle();
      if (r3.data) return { sb, boutique: r3.data, admin: true };
    }
  }

  return { sb, erreur: 'Aucune boutique liee a ce compte.', statut: 404 };
}

/**
 * Ce que le navigateur a le droit de voir.
 *
 * La fiche brute porte les identifiants Vault des jetons et les empreintes des
 * secrets de webhook. Rien de tout cela n'a de raison d'arriver dans une page :
 * on ne renvoie que l'etat de branchement, vrai ou faux.
 */
function pourLeNavigateur(boutique: Record<string, unknown>) {
  const etat = {
    whatsapp_connecte: Boolean(boutique.wasender_secret_id),
    whatsapp_webhook_protege: Boolean(boutique.webhook_secret_hash),
    telegram_connecte: Boolean(boutique.telegram_secret_id),
    telegram_webhook_branche: Boolean(boutique.telegram_webhook_secret_hash),
  };

  const publique = { ...boutique };
  for (const cle of [
    'wasender_secret_id',
    'telegram_secret_id',
    'wasender_session_hash',
    'webhook_secret_hash',
    'telegram_webhook_secret_hash',
  ]) {
    delete publique[cle];
  }

  return { ...publique, ...etat };
}

export async function GET(req: Request) {
  const r = await ficheDuConnecte(req);
  if ('erreur' in r) return NextResponse.json({ error: r.erreur }, { status: r.statut });
  return NextResponse.json(pourLeNavigateur(r.boutique as Record<string, unknown>));
}

export async function PATCH(req: Request) {
  const r = await ficheDuConnecte(req);
  if ('erreur' in r) return NextResponse.json({ error: r.erreur }, { status: r.statut });

  const body = await req.json();
  const slug = String((r.boutique as { slug?: unknown }).slug ?? '').trim();

  /**
   * Les jetons ne sont pas des champs de la fiche.
   *
   * Un jeton wasender ou un jeton de bot Telegram ne doit jamais atterrir dans
   * une colonne lisible : il part au Vault par une fonction dediee, et la fiche
   * n'en garde qu'un identifiant. C'est ce qui permet au marchand d'utiliser
   * son propre numero et son propre bot sans qu'aucune credential ne soit
   * ajoutee dans n8n — donc de s'inscrire sans intervention manuelle.
   */
  const rpc = async (fonction: string, args: Record<string, string>) => {
    const rep = (await r.sb.rpc(fonction as never, args as never)) as {
      error: { message: string } | null;
    };
    return rep.error?.message ?? null;
  };

  const faits: string[] = [];

  if (typeof body.wasender_token === 'string' && body.wasender_token.trim()) {
    if (!slug) return NextResponse.json({ error: 'Boutique sans slug.' }, { status: 409 });
    const echec = await rpc('definir_session_wasender', {
      p_slug: slug,
      p_token: body.wasender_token.trim(),
    });
    if (echec) {
      console.error(`Onboarding — jeton wasender refuse (${slug}) :`, echec);
      return NextResponse.json({ error: 'Jeton WhatsApp refusé.' }, { status: 502 });
    }
    faits.push('WhatsApp connecté');
  }

  if (typeof body.wasender_webhook_secret === 'string' && body.wasender_webhook_secret.trim()) {
    if (!slug) return NextResponse.json({ error: 'Boutique sans slug.' }, { status: 409 });
    const echec = await rpc('definir_secret_webhook', {
      p_slug: slug,
      p_secret: body.wasender_webhook_secret.trim(),
    });
    if (echec) {
      console.error(`Onboarding — secret webhook refuse (${slug}) :`, echec);
      return NextResponse.json({ error: 'Secret de webhook refusé.' }, { status: 502 });
    }
    faits.push('Webhook WhatsApp protégé');
  }

  if (typeof body.telegram_bot_token === 'string' && body.telegram_bot_token.trim()) {
    if (!slug) return NextResponse.json({ error: 'Boutique sans slug.' }, { status: 409 });
    const echec = await rpc('definir_jeton_canal', {
      p_slug: slug,
      p_canal: 'telegram',
      p_jeton: body.telegram_bot_token.trim(),
    });
    if (echec) {
      console.error(`Onboarding — jeton telegram refuse (${slug}) :`, echec);
      return NextResponse.json({ error: 'Jeton Telegram refusé.' }, { status: 502 });
    }

    // Enregistrer le jeton ne suffit pas : tant que le bot ne vise pas l'URL
    // du marchand, aucun message ne lui parvient.
    const branchement = await brancherBotTelegram(slug);
    if (!branchement.ok) {
      return NextResponse.json(
        { error: `Bot enregistré, mais branchement refusé : ${branchement.raison}` },
        { status: branchement.statut },
      );
    }
    faits.push('Bot Telegram branché');
  }

  const autorises = [
    'telephone', 'telegram_marchand', 'groupe_livreurs',
    'sheet_commandes', 'sheet_menu', 'sheet_notes',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of autorises) {
    if (k in body && typeof body[k] === 'string') updates[k] = body[k].trim();
  }

  if (!Object.keys(updates).length) {
    if (faits.length) {
      const { data } = await r.sb
        .from('boutiques')
        .select()
        .eq('id', r.boutique.id)
        .single();
      return NextResponse.json({
        ok: true,
        faits,
        boutique: data ? pourLeNavigateur(data as Record<string, unknown>) : null,
      });
    }
    return NextResponse.json({ error: 'Rien a mettre a jour.' }, { status: 400 });
  }

  const { data, error } = await r.sb
    .from('boutiques')
    .update(updates as never)
    .eq('id', r.boutique.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    faits,
    boutique: pourLeNavigateur(data as Record<string, unknown>),
  });
}