import { invaliderCacheMarchands } from '@/lib/marchands';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// La fonction vit dans `@/lib/slug` : c'est une fonction de chaine, et ce
// module-ci tirait `google-auth-library` — ce qui interdisait de l'importer
// depuis un composant client. La dependance Google est partie le 28 aout 2026 ;
// la separation reste, parce qu'elle etait juste pour une autre raison : ce
// module parle a Supabase avec la cle de service, un composant client n'a rien
// a y prendre. Reexportee pour ne rien casser chez ses appelants.
export { genererSlug } from '@/lib/slug';
// Reexporter ne met pas le symbole dans la portee de CE module, qui s'en sert
// plus bas. Les deux lignes sont donc necessaires.
import { genererSlug } from '@/lib/slug';

export type DemandeProvisioning = {
  nom: string;
  email: string;
  slug?: string;
  categorie?: string;
  zone?: string;
  telephone?: string;
  emoji?: string;
  whatsapp?: string;
  groupeLivreurs?: string;
};

export type ResultatProvisioning = {
  boutiqueId: string;
  slug: string;
  userId: string;
  /** true si le compte marchand vient d'etre cree et invite par email. */
  invite: boolean;
};

export class ErreurProvisioning extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

/** Cherche un compte par email, page par page (l'API admin n'expose pas de get-by-email). */
async function trouverUtilisateurParEmail(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<{ id: string } | null> {
  const cible = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new ErreurProvisioning(`Lecture des comptes impossible : ${error.message}`, 502);
    const trouve = data.users.find(u => u.email?.toLowerCase() === cible);
    if (trouve) return { id: trouve.id };
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Reserve un slug libre : « rosemonde », puis « rosemonde-2 », etc. */
async function slugDisponible(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  souhaite: string,
): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidat = n === 1 ? souhaite : `${souhaite}-${n}`;
    const { data, error } = await sb.from('boutiques').select('id').eq('slug', candidat).maybeSingle();
    if (error) throw new ErreurProvisioning(`Verification du slug impossible : ${error.message}`, 502);
    if (!data) return candidat;
  }
  throw new ErreurProvisioning('Impossible de reserver un slug libre.', 409);
}

/**
 * Provisionne un marchand complet : compte invite, onglets Google Sheets,
 * fiche boutique et reglages de notification.
 *
 * L'ordre n'est pas anodin. Les onglets sont crees AVANT la fiche boutique :
 * une fiche qui pointe vers un onglet inexistant ferait echouer chaque
 * commande en 503. En cas d'echec apres l'insertion de la boutique, celle-ci
 * est supprimee pour ne pas laisser un tenant a moitie provisionne.
 */
export async function provisionnerMarchand(d: DemandeProvisioning): Promise<ResultatProvisioning> {
  const nom = d.nom?.trim();
  const email = d.email?.trim().toLowerCase();
  if (!nom) throw new ErreurProvisioning('Le nom de la boutique est requis.', 400);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ErreurProvisioning('Un email marchand valide est requis.', 400);
  }

  const sb = getSupabaseAdmin();
  if (!sb) throw new ErreurProvisioning('Configuration Supabase absente.', 500);

  /**
   * UN SLUG FOURNI PASSE PAR LA MEME REDUCTION QU'UN SLUG DEDUIT.
   *
   * `genererSlug` ramene la valeur a `[a-z0-9-]` ; il n'etait applique qu'au
   * repli, et un slug explicite entrait tel quel. Or il ressort ensuite dans
   * l'URL et l'`@id` du balisage schema.org de la vitrine, et dans les chemins
   * de la page — un slug portant `<` ou `"` n'a rien a y faire.
   *
   * `jsonLdSur` echappe deja la sortie : c'est le second rideau. Celui-ci est
   * le premier, et il vaut mieux ne pas stocker ce qu'on devra echapper.
   */
  const slug = await slugDisponible(sb, genererSlug(d.slug?.trim() || nom));
  if (!slug) throw new ErreurProvisioning('Nom de boutique inexploitable comme slug.', 400);

  // 1. Compte marchand : on reutilise un compte existant, sinon on invite.
  const existant = await trouverUtilisateurParEmail(sb, email);
  let userId = existant?.id ?? '';
  let invite = false;
  if (!userId) {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email);
    if (error || !data?.user) {
      throw new ErreurProvisioning(
        `Invitation du marchand impossible : ${error?.message ?? 'reponse vide'}`,
        502,
      );
    }
    userId = data.user.id;
    invite = true;
  }

  /*
    L'ETAPE 2 ETAIT « ONGLETS GOOGLE SHEETS, AVANT TOUTE ECRITURE EN BASE ».
    Elle est retiree le 28 aout 2026 : plus rien ne lit ces onglets. Elle
    LEVAIT en 502 quand Google refusait — un quota Google pouvait donc empecher
    la creation d'un marchand, alors que rien de ce qu'on lui construisait n'en
    dependait.
  */

  // 2. Fiche boutique.
  const { data: boutique, error: erreurBoutique } = await sb
    .from('boutiques')
    .insert({
      user_id: userId,
      nom,
      slug,
      // UNE PLATEFORME MULTI-SECTEURS NE SUPPOSE PAS LA RESTAURATION.
      // Une pharmacie, un quincaillier ou un vendeur de vetements se
      // retrouvaient classes « Restaurant » faute d'avoir choisi.
      categorie: d.categorie?.trim() || 'Commerce',
      zone: d.zone?.trim() || null,
      telephone: d.telephone?.trim() || null,
      emoji: d.emoji?.trim() || '🏪',
      /*
        `sheet_document_id`, `sheet_commandes` et `sheet_menu` NE SONT PLUS
        POSES. Le commentaire qui les justifiait disait « n8n lit
        `sheet_document_id` pour construire chacun de ses appels Google Sheets » :
        il n'y a plus un seul appel Google Sheets a construire.

        Les colonnes restent en base — les vider est une migration, et les
        anciennes fiches les portent encore. Un nouveau marchand nait
        simplement sans, ce que la voie « sans classeur » faisait deja pour
        toute boutique creee depuis le tableau de bord.
      */
      groupe_livreurs: d.groupeLivreurs?.trim() || null,
    })
    .select('id')
    .single();

  if (erreurBoutique || !boutique) {
    throw new ErreurProvisioning(
      `Creation de la boutique impossible : ${erreurBoutique?.message ?? 'reponse vide'}`,
      502,
    );
  }

  // 4. Reglages de notification. Un echec ici laisserait un marchand sans
  //    alerte : on annule la boutique plutot que de livrer un tenant muet.
  const { error: erreurNotif } = await sb.from('notification_settings').insert({
    boutique_id: boutique.id,
    whatsapp_numero: d.whatsapp?.trim() || d.telephone?.trim() || null,
    telegram_chat_id: d.groupeLivreurs?.trim() || null,
  });

  if (erreurNotif) {
    await sb.from('boutiques').delete().eq('id', boutique.id);
    throw new ErreurProvisioning(
      `Reglages de notification impossibles : ${erreurNotif.message}`,
      502,
    );
  }

  // 5. Le registre vit dans Supabase : la fiche inseree ci-dessus suffit a
  //    rendre le marchand visible partout. Une ligne etait aussi ajoutee dans
  //    l'onglet Marchands, du temps ou ce dernier servait de registre ; il ne
  //    porte plus rien que la base ne porte, et sa lecture a ete retiree.

    // 6. Essai de 30 jours offert : le marchand entre immediatement dans son
  //    dashboard (statut « trialing »). A echeance, le paywall reprend la
  //    main : c'est la que commence ton abonnement payant.
  const { error: erreurEssai } = await sb.from('subscriptions').upsert(
    {
      user_id: userId,
      plan_key: 'pro',
      status: 'trialing',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      last_checkout_session_id: '', // ← Ajouté : obligatoire mais vide pour un essai
    },
    { onConflict: 'user_id' },
  );
  if (erreurEssai) {
    console.error('Essai 30 jours impossible :', erreurEssai.message);
  }

  invaliderCacheMarchands();

  return { boutiqueId: boutique.id, slug, userId, invite };
}
