import { NextResponse } from 'next/server';
import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { brancherBotTelegram } from '@/lib/telegramBranchement';
import type { Database } from '@/lib/database.types';

type MajBoutique = Database['public']['Tables']['boutiques']['Update'];

export const dynamic = 'force-dynamic';

/**
 * Sur QUELLE boutique on travaille — et jamais une devinette.
 *
 * CE QUE CETTE FONCTION FAISAIT, ET CE QUE CA A COUTE. Elle cherchait la
 * boutique du compte avec `.maybeSingle()` sur `user_id`. Des qu'un compte en
 * possede DEUX, cette requete echoue et rend `null` — silencieusement. On
 * retombait alors sur « la premiere boutique du registre ».
 *
 * Le 19 aout 2026, un marchand a branche sa deuxieme boutique : jeton Telegram,
 * groupe de livreurs, identifiant du gerant. TOUT est parti chez la premiere.
 * Le groupe de livreurs de la boutique en service a ete ecrase par celui de la
 * nouvelle — ses vrais livreurs ne recevaient plus rien — et le nouveau bot
 * repondait aux clients avec le catalogue et le nom de l'autre enseigne.
 *
 * DEUX CHANGEMENTS. La boutique visee arrive desormais en parametre, comme sur
 * toutes les routes du tableau de bord, et le controle de propriete est celui
 * de `exigerAccesMarchand` — le meme pour tout le monde.
 *
 * Et quand le compte possede plusieurs boutiques sans qu'on precise laquelle,
 * ON REFUSE. Choisir a la place du marchand, c'est ce qui a ecrit ses reglages
 * chez sa voisine.
 */
async function ficheDuConnecte(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return { sb: null as never, erreur: 'Base indisponible', statut: 503 };

  const slug = new URL(req.url).searchParams.get('boutique_id');

  const acces = await exigerAccesMarchand(req, slug);
  if (!acces.ok) return { sb, erreur: acces.message, statut: acces.statut };

  // Sans boutique nommee, on verifie qu'il n'y a pas d'ambiguite AVANT
  // d'ecrire quoi que ce soit.
  if (!String(slug ?? '').trim()) {
    const { data: siennes } = await sb
      .from('boutiques')
      .select('slug, nom')
      .eq('user_id', acces.userId);

    if ((siennes?.length ?? 0) > 1) {
      return {
        sb,
        erreur:
          'Vous avez plusieurs boutiques : choisissez laquelle brancher dans le sélecteur en haut de page.',
        statut: 409,
      };
    }
  }

  const { data: boutique } = await sb
    .from('boutiques')
    .select('*')
    .eq('id', acces.marchand.boutiqueId)
    .maybeSingle();

  if (!boutique) return { sb, erreur: 'Aucune boutique liee a ce compte.', statut: 404 };

  return { sb, boutique, admin: acces.admin };
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
  // Le nom est contraint aux fonctions declarees : une fonction renommee en
  // base casse ici la compilation, plutot qu'une inscription a l'execution.
  const rpc = async (
    fonction: keyof Database['public']['Functions'],
    args: Record<string, string>,
  ) => {
    const rep = (await r.sb.rpc(fonction, args as never)) as {
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

  // `satisfies` verifie que chacun de ces noms est bien une colonne de
  // `boutiques`. La liste etait de simples chaines : une colonne renommee y
  // serait restee, et la mise a jour aurait echoue a l'execution.
  const autorises = [
    'telephone', 'telegram_marchand', 'groupe_livreurs',
    'sheet_commandes', 'sheet_menu', 'sheet_notes',
  ] as const satisfies readonly (keyof MajBoutique)[];

  const updates: MajBoutique = {};
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
    .update(updates)
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