import { NOM_ANONYME, STATUTS_CLOS } from '@/lib/conservation';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cleAppariement, memeNumero } from '@/lib/telephone';

/**
 * Le dossier d'une personne : ce qu'on détient, et ce que l'effacement retire.
 *
 * ── POURQUOI RASSEMBLER ET EFFACER VIVENT ENSEMBLE ─────────────────────────
 *
 * L'écran des droits montre un dossier, puis propose de l'effacer. Si les deux
 * opérations cherchaient la personne différemment, l'écran montrerait des
 * lignes que l'effacement ne toucherait pas — et la personne repartirait
 * convaincue qu'elles sont parties. Ici, une seule fonction décide qui est la
 * personne, et les deux s'en servent.
 *
 * ── COMMENT ON RETROUVE QUELQU'UN ──────────────────────────────────────────
 *
 * Le même client porte plusieurs formes de son numéro (`2250102918886`,
 * `0102918886`). On présélectionne donc en base sur les HUIT derniers chiffres,
 * la part stable de part et d'autre de la réforme de 2021 — puis `memeNumero`
 * tranche en mémoire, et lui seul, parce qu'il sait écarter `0102918886` de
 * `0702918886`, que les huit chiffres confondent.
 *
 * La présélection est large et le tri est strict : l'inverse laisserait passer
 * les données d'un homonyme d'opérateur.
 */

/**
 * Le client admin, jamais `null` : les routes vérifient sa présence avant
 * d'appeler ici. Le tirer de `getSupabaseAdmin` plutôt que de le redéclarer
 * garde le typage des tables — sans quoi une faute de nom de colonne dans une
 * fonction QUI EFFACE passerait la compilation.
 */
type Sb = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * NI `total`, NI `statut` : ILS N'ONT JAMAIS ÉTÉ AFFICHÉS.
 *
 * Les deux traversaient le réseau à chaque ouverture du dossier sans jamais
 * atteindre un écran. Sur un forfait compté — la contrainte nommée dans
 * PRODUCT.md —, c'est du poids payé pour rien, et sur un écran de protection
 * des données c'est pire que du poids : on transportait le montant d'une
 * commande pour répondre à la question « que gardez-vous sur moi ? ».
 *
 * `statut` reste lu en base, parce que `close` en découle — mais il s'arrête
 * ici. C'est la réponse, pas la matière première, qui sort.
 */
export type LigneCommande = {
  reference: string;
  date: string | null;
  boutique: string;
  close: boolean;
  /** Ce qu'on détient sur cette commande, dit en clair. */
  detenu: string[];
};

export type Dossier = {
  telephone: string;
  commandes: LigneCommande[];
  /** Identifiants internes, pour l'effacement. Jamais rendus au client. */
  idsCommandes: string[];
  idsCommandesCloses: string[];
  paniers: number;
  relances: number;
  /** Les boutiques où un refus de démarchage est enregistré. */
  refusDemarchage: string[];
  avisLivraison: number;
  demandesAnterieures: { type: string; date: string | null; statut: string }[];
};

/**
 * Cette commande a-t-elle DÉJÀ été anonymisée ?
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ─────────────────────────────────────
 *
 * Une commande anonymisée porte un téléphone VIDE. Sans ce contrôle,
 * `rassemblerDossier` refusait de constituer un dossier et la route rendait
 * « Vos données n'ont pas pu être rassemblées, réessayez dans un instant » —
 * un message FAUX, sur l'écran d'une personne dont les données venaient
 * précisément d'être effacées, et qui l'invitait à réessayer sans fin.
 *
 * Or rouvrir son lien est le geste qui suit immédiatement un effacement. Le
 * cas n'était donc pas rare : c'était le plus probable.
 */
export function dejaEfface(telephone: unknown): boolean {
  return !cleAppariement(telephone);
}

/** Une commande est-elle close ? */
export function commandeClose(statut: unknown): boolean {
  return (STATUTS_CLOS as readonly string[]).includes(
    String(statut ?? '').trim().toLowerCase(),
  );
}

/**
 * Le motif `ilike` qui présélectionne les lignes d'un numéro.
 *
 * Rend `null` quand la valeur n'a pas la forme d'un téléphone ivoirien : sans
 * clé, il ne faut SURTOUT PAS retomber sur un motif large — `%` rendrait la
 * base entière.
 */
function motifNumero(telephone: string): string | null {
  const cle = cleAppariement(telephone);
  return cle ? `%${cle}` : null;
}

/**
 * CE QUE TOUTES LES COMMANDES DÉTIENNENT, quand c'est la même chose.
 *
 * Rend la phrase commune — « votre nom, votre adresse de livraison » — dès que
 * les commandes du dossier retiennent EXACTEMENT les mêmes champs, et `null`
 * dès qu'elles divergent.
 *
 * ── POURQUOI CETTE RÈGLE, ET PAS « ON HISSE TOUJOURS » ─────────────────────
 *
 * Mesuré sur un vrai dossier le 2 septembre 2026 : six commandes, six fois la
 * même phrase, mot pour mot. Deux lignes de texte gris répétées six fois
 * occupaient plus de hauteur que les références qu'elles accompagnaient — pour
 * zéro information, puisque ce qui se répète à l'identique ne distingue rien.
 *
 * Mais `detenu` est calculé PAR COMMANDE : une commande de la vitrine et une
 * autre prise sur WhatsApp ne retiennent pas les mêmes champs. Hisser la
 * phrase sans condition dirait donc parfois faux — et sur cet écran-là, dire
 * faux sur ce qu'on détient est exactement la faute qu'il ne faut pas
 * commettre.
 *
 * Un dossier mixte garde donc sa phrase par ligne, où elle redevient une
 * information : elle distingue.
 *
 * ── L'ORDRE COMPTE, ET C'EST VOULU ────────────────────────────────────────
 *
 * `detenuSurCommande` énumère toujours dans le même ordre. Deux listes de
 * mêmes champs sortent donc dans le même ordre, et une comparaison position
 * par position suffit : trier avant de comparer masquerait une divergence
 * d'ordre qui ne peut pas se produire, au prix d'un tri à chaque rendu.
 *
 * ── UNE SEULE COMMANDE NE FAIT PAS UNE RÈGLE ──────────────────────────────
 *
 * Avec une seule commande, il n'y a rien à dédupliquer : la phrase reste sur
 * sa ligne, où elle est lue comme une précision sur CETTE commande — et non
 * comme une règle qui vaudrait pour un ensemble qui n'existe pas.
 */
export function detenuEnCommun(commandes: { detenu: string[] }[]): string | null {
  if (commandes.length < 2) return null;

  const premier = commandes[0].detenu;
  if (premier.length === 0) return null;

  // Comparaison element par element : pas de separateur, donc aucune valeur
  // a choisir qui ne puisse apparaitre dans les chaines — et rien a echapper.
  for (const c of commandes) {
    if (c.detenu.length !== premier.length) return null;
    if (c.detenu.some((v, i) => v !== premier[i])) return null;
  }
  return premier.join(', ');
}

/** Ce qu'on détient sur une commande, énuméré pour l'écran. */
function detenuSurCommande(c: {
  client_nom: unknown;
  client_adresse: unknown;
  instructions: unknown;
  latitude: unknown;
  chat_id: unknown;
}): string[] {
  const d: string[] = [];
  if (String(c.client_nom ?? '').trim() && c.client_nom !== NOM_ANONYME) d.push('votre nom');
  if (String(c.client_adresse ?? '').trim()) d.push('votre adresse de livraison');
  if (String(c.instructions ?? '').trim()) d.push('vos instructions de livraison');
  if (c.latitude !== null && c.latitude !== undefined) d.push('la position que vous avez partagée');
  if (String(c.chat_id ?? '').trim()) d.push('votre identifiant de messagerie');
  return d;
}

/**
 * Rassemble tout ce que la plateforme détient sur ce numéro.
 *
 * Lève en cas d'erreur de lecture plutôt que de rendre un dossier incomplet :
 * montrer trois commandes sur cinq, ou pire annoncer « rien à votre nom » sur
 * une panne, serait une réponse fausse à une question de droit.
 */
export async function rassemblerDossier(sb: Sb, telephone: string): Promise<Dossier> {
  const motif = motifNumero(telephone);
  if (!motif) {
    throw new Error('Numéro inexploitable : impossible de constituer un dossier.');
  }

  const echoue = (quoi: string, message: string): never => {
    throw new Error(`Lecture impossible (${quoi}) : ${message}`);
  };

  const cmd = await sb
    .from('commandes')
    .select(
      'id, reference, created_at, statut, client_nom, client_telephone,'
      + ' client_adresse, instructions, latitude, chat_id, boutiques(nom)',
    )
    .ilike('client_telephone', motif)
    .order('created_at', { ascending: false })
    .limit(500);
  if (cmd.error) echoue('commandes', cmd.error.message);

  type Brute = {
    id: string; reference: string; created_at: string | null;
    statut: string | null; client_nom: string | null; client_telephone: string | null;
    client_adresse: string | null; instructions: string | null; latitude: number | null;
    chat_id: string | null; boutiques: { nom: string | null } | null;
  };

  const miennes = ((cmd.data ?? []) as unknown as Brute[])
    .filter((c) => memeNumero(c.client_telephone, telephone));

  const commandes: LigneCommande[] = miennes.map((c) => ({
    reference: c.reference,
    date: c.created_at,
    boutique: c.boutiques?.nom ?? 'Boutique',
    close: commandeClose(c.statut),
    detenu: detenuSurCommande(c),
  }));

  const idsCommandes = miennes.map((c) => c.id);
  const idsCommandesCloses = miennes.filter((c) => commandeClose(c.statut)).map((c) => c.id);

  const pan = await sb.from('paniers').select('id, telephone').ilike('telephone', motif).limit(500);
  if (pan.error) echoue('paniers', pan.error.message);
  const paniers = (pan.data ?? []).filter((p) => memeNumero(p.telephone, telephone));

  const rel = await sb
    .from('relances_envoyees').select('id, telephone').ilike('telephone', motif).limit(500);
  if (rel.error) echoue('relances', rel.error.message);
  const relances = (rel.data ?? []).filter((r) => memeNumero(r.telephone, telephone));

  const stop = await sb
    .from('relances_stop').select('boutique, telephone').ilike('telephone', motif).limit(500);
  if (stop.error) echoue('refus de démarchage', stop.error.message);
  const refus = (stop.data ?? []).filter((s) => memeNumero(s.telephone, telephone));

  // Les avis passent par la commande : `livraisons` ne porte aucun numéro.
  let avisLivraison = 0;
  if (idsCommandes.length) {
    const av = await sb
      .from('livraisons')
      .select('id, commentaire_client, note_client')
      .in('commande_id', idsCommandes)
      .limit(500);
    if (av.error) echoue('avis de livraison', av.error.message);
    avisLivraison = (av.data ?? []).filter(
      (l) => String(l.commentaire_client ?? '').trim() || l.note_client !== null,
    ).length;
  }

  const dem = await sb
    .from('demandes_droits')
    .select('type, cree_le, statut')
    .ilike('telephone', motif)
    .order('cree_le', { ascending: false })
    .limit(50);
  if (dem.error) echoue('demandes antérieures', dem.error.message);

  return {
    telephone,
    commandes,
    idsCommandes,
    idsCommandesCloses,
    paniers: paniers.length,
    relances: relances.length,
    refusDemarchage: refus.map((r) => String(r.boutique)),
    avisLivraison,
    demandesAnterieures: (dem.data ?? []).map((d) => ({
      type: String(d.type),
      date: d.cree_le as string | null,
      statut: String(d.statut),
    })),
  };
}

export type BilanEffacement = {
  commandesAnonymisees: number;
  paniersSupprimes: number;
  relancesSupprimees: number;
  avisRetires: number;
  /** Commandes encore en cours : intouchées, et il faut le dire. */
  commandesEnCours: number;
  refusEnregistres: number;
};

/**
 * Efface ce qui peut l'être, et rend le compte de ce qui reste.
 *
 * ── UNE COMMANDE EN COURS N'EST PAS EFFACÉE ────────────────────────────────
 *
 * Retirer le nom et l'adresse d'une commande qu'un livreur est en train de
 * porter, c'est empêcher qu'elle arrive. On efface donc les commandes CLOSES, et
 * la demande reste ouverte pour les autres : la tâche nocturne la reprend dès
 * qu'elles se ferment. La personne n'a pas à revenir le demander.
 *
 * ── ON AJOUTE LA PERSONNE À LA LISTE DES REFUS ─────────────────────────────
 *
 * Cela paraît contradictoire — effacer quelqu'un tout en gardant son numéro. Ce
 * n'en est pas : sans cette ligne, plus rien n'empêcherait de la démarcher à
 * nouveau dès demain. On garde le strict nécessaire pour tenir parole, et
 * l'écran le lui dit avant qu'elle ne décide.
 */
export async function effacerDossier(sb: Sb, telephone: string): Promise<BilanEffacement> {
  const dossier = await rassemblerDossier(sb, telephone);

  const bilan: BilanEffacement = {
    commandesAnonymisees: 0,
    paniersSupprimes: 0,
    relancesSupprimees: 0,
    avisRetires: 0,
    commandesEnCours: dossier.idsCommandes.length - dossier.idsCommandesCloses.length,
    refusEnregistres: 0,
  };

  const echoue = (quoi: string, message: string): never => {
    throw new Error(`Effacement impossible (${quoi}) : ${message}`);
  };

  // ---- 1. Les boutiques concernées, AVANT d'effacer : après anonymisation, on
  // ne saurait plus à qui adresser le refus de démarchage.
  const motif = motifNumero(telephone);
  const slugs = new Set<string>();
  if (dossier.idsCommandes.length) {
    const b = await sb
      .from('commandes')
      .select('boutiques(slug)')
      .in('id', dossier.idsCommandes);
    if (b.error) echoue('boutiques concernées', b.error.message);
    for (const l of (b.data ?? []) as unknown as { boutiques: { slug: string | null } | null }[]) {
      if (l.boutiques?.slug) slugs.add(l.boutiques.slug);
    }
  }

  // ---- 2. Les avis, avant les commandes : ils s'y rattachent par identifiant.
  if (dossier.idsCommandes.length) {
    const av = await sb
      .from('livraisons')
      .update({ commentaire_client: null })
      .in('commande_id', dossier.idsCommandesCloses)
      .not('commentaire_client', 'is', null)
      .select('id');
    if (av.error) echoue('avis de livraison', av.error.message);
    bilan.avisRetires = (av.data ?? []).length;
  }

  // ---- 3. Les commandes closes : anonymisées, pas supprimées.
  //
  // Les champs sont écrits EN TOUTES LETTRES, comme dans la tâche nocturne :
  // une clé calculée élargirait le type de `update()` à n'importe quelle
  // colonne, et le compilateur cesserait de protéger une opération qui efface.
  if (dossier.idsCommandesCloses.length) {
    const maj = await sb
      .from('commandes')
      .update({
        client_nom: NOM_ANONYME,
        // NOT NULL en base : on les vide, on ne les annule pas.
        client_telephone: '',
        client_adresse: '',
        chat_id: null,
        instructions: null,
        latitude: null,
        longitude: null,
        position_livreur: null,
      })
      .in('id', dossier.idsCommandesCloses)
      .select('id');
    if (maj.error) echoue('commandes', maj.error.message);
    bilan.commandesAnonymisees = (maj.data ?? []).length;
  }

  // ---- 4. Paniers et relances : supprimés.
  if (motif) {
    const pan = await sb.from('paniers').select('id, telephone').ilike('telephone', motif);
    if (pan.error) echoue('paniers', pan.error.message);
    const ids = (pan.data ?? []).filter((p) => memeNumero(p.telephone, telephone)).map((p) => p.id);
    if (ids.length) {
      const s = await sb.from('paniers').delete().in('id', ids);
      if (s.error) echoue('paniers', s.error.message);
      bilan.paniersSupprimes = ids.length;
    }

    const rel = await sb.from('relances_envoyees').select('id, telephone').ilike('telephone', motif);
    if (rel.error) echoue('relances', rel.error.message);
    const idsRel = (rel.data ?? [])
      .filter((r) => memeNumero(r.telephone, telephone)).map((r) => r.id);
    if (idsRel.length) {
      const s = await sb.from('relances_envoyees').delete().in('id', idsRel);
      if (s.error) echoue('relances', s.error.message);
      bilan.relancesSupprimees = idsRel.length;
    }
  }

  // ---- 5. Le refus de démarchage, dans chaque boutique concernée.
  for (const slug of slugs) {
    const r = await sb
      .from('relances_stop')
      .upsert(
        { boutique: slug, telephone, motif: 'effacement demande par la personne' },
        { onConflict: 'boutique,telephone' },
      );
    if (r.error) echoue('refus de démarchage', r.error.message);
    bilan.refusEnregistres += 1;
  }

  return bilan;
}
