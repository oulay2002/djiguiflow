import {
  PLAFOND_PREUVES_PAR_COMMANDE,
  ageEnHeures,
  jetonRefuse,
  journaliserAccesSansJeton,
  verdictJeton,
  verdictTelephone,
} from '@/lib/jetonSuivi';
import { adresseAppelante, plafondJournalierDepasse, rafaleDepassee } from '@/lib/limiteur';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreMarchand } from '@/lib/marchands';

type LigneItem = { nom_produit: string | null; quantite: number | null; prix_unitaire: number | null };

/**
 * Le suivi d'une commande, quelle que soit la boutique.
 *
 * La reference suffit, et elle suffit seule. Une premiere tentative deduisait
 * la boutique du prefixe de la reference — « ZH- » pour Zahara — via une
 * colonne `prefixe_commande` a renseigner par marchand, plus un cas particulier
 * « APP → zahara » ecrit en dur. C'etait fragile sur trois plans : les deux
 * autres boutiques n'avaient pas de prefixe et rendaient donc 404 sur toutes
 * leurs commandes ; Zahara emet elle-meme deux prefixes (17 refs « ZH- » et 9
 * « APP- »), donc le cas particulier n'etait pas une transition mais une
 * dependance ; et il aurait envoye la commande d'un futur marchand chez Zahara
 * le jour ou celui-ci emettrait des refs « APP- ».
 *
 * Or la reference est unique — 26 sur 26 distinctes au 12 aout 2026 — et la
 * ligne de commande porte deja `boutique_id`. On cherche donc la commande, puis
 * on lit sa boutique : l'inverse du detour precedent. Aucune configuration par
 * marchand, et toute boutique presente ou future est servie sans rien declarer.
 *
 * `boutique_id` reste accepte en parametre : le tableau de bord fabrique des
 * liens `?ref=…&boutique=…`. Il ne sert plus qu'a restreindre la recherche.
 */

/**
 * Neutralise les jokers d'un motif LIKE.
 *
 * La reference vient de la query string et partait telle quelle dans un
 * `ilike`. Verifie en production le 12 aout 2026 : la reference amputee de son
 * dernier caractere et terminee par « _ » rendait la commande complete d'un
 * client — son nom et son adresse de livraison — sur une route publique et sans
 * authentification. Un « % » bien place aurait balaye le reste.
 */
function motifExact(valeur: string): string {
  return valeur.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * LE FREIN CONTRE L'ENUMERATION.
 *
 * Cette route est publique, elle n'exige aucune preuve autre que la reference,
 * et elle rend le NOM et l'ADRESSE du client. Or les references de production
 * ne sont pas toutes imprevisibles : on y trouve des compteurs sequentiels
 * (`ATT-1000000006`, `ATT-1000000007`) et surtout des formes derivables comme
 * `APP-<telephone>-<horodatage unix en secondes>`. Avec le numero d'un client,
 * balayer une journee ne demande que 86 400 essais.
 *
 * CE FREIN NE CORRIGE PAS LA CAUSE, il en augmente le prix. La correction de
 * fond est un jeton imprevisible par commande, porte par le lien de suivi.
 * Tant qu'il n'existe pas, ceci reste le seul obstacle.
 *
 * Trente par dix minutes : un client qui rafraichit son suivi pendant sa
 * livraison n'y arrive jamais ; un script qui enumere le franchit en deux
 * secondes, et se fait arreter.
 */
const SUIVIS_PAR_APPELANT = 30;
const FENETRE_SUIVI_MS = 10 * 60_000;

export async function GET(req: Request) {
  const appelant = adresseAppelante(req);
  const rafale = rafaleDepassee(`suivi:${appelant}`, SUIVIS_PAR_APPELANT, FENETRE_SUIVI_MS);
  if (rafale.depassee) {
    console.error(`Suivi — rafale refusee depuis ${appelant} : enumeration probable.`);
    return Response.json(
      { error: 'Trop de consultations. Patientez quelques minutes.' },
      { status: 429, headers: { 'Retry-After': String(rafale.attendreSecondes) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get('ref') || '').trim();
  if (!ref) return Response.json({ error: 'Référence requise' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Suivi temporairement indisponible' }, { status: 503 });

  // Le parametre porte tantot un slug, tantot un uuid ; le registre accepte
  // les deux et rend toujours l'uuid, seule forme comparable a `boutique_id`.
  const filtre = searchParams.get('boutique_id') || searchParams.get('boutique');
  const restreindre = filtre ? (await resoudreMarchand(filtre))?.boutiqueId ?? null : null;
  if (filtre && !restreindre) {
    return Response.json({ error: 'Boutique introuvable' }, { status: 404 });
  }

  let requete = sb
    .from('commandes')
    .select(
      'reference, jeton_suivi, client_telephone, client_nom, client_adresse, total, created_at,' +
        ' nom_livreur, statut_livraison,' +
        ' frais_livraison,' +
        ' heure_prise_en_charge, heure_livraison, boutique_id,' +
        ' commande_items(nom_produit, quantite, prix_unitaire)',
    )
    .ilike('reference', motifExact(ref));

  if (restreindre) requete = requete.eq('boutique_id', restreindre);

  const { data, error } = await requete.maybeSingle();

  if (error) {
    console.error(`Suivi — lecture Supabase impossible (${ref}) :`, error);
    return Response.json({ error: 'Suivi temporairement indisponible' }, { status: 503 });
  }
  if (!data) return Response.json({ error: 'Commande introuvable' }, { status: 404 });

  const c = data as unknown as {
    reference: string; jeton_suivi: string | null; client_telephone: string | null;
    client_nom: string | null; client_adresse: string | null;
    total: number | null; created_at: string | null; nom_livreur: string | null;
    frais_livraison: number | null;
    statut_livraison: string | null; heure_prise_en_charge: string | null;
    heure_livraison: string | null; boutique_id: string;
    commande_items: LigneItem[] | null;
  };

  // ---- LE JETON. La reference designe, le jeton PROUVE.
  //
  // Un jeton faux est toujours refuse — le tolerer rendrait le jeton decoratif.
  // Un jeton absent est encore tolere (phase 3) mais COMPTE : des clients ont
  // en ce moment des liens sans jeton pour des commandes en cours, et l'exiger
  // aujourd'hui casserait leur suivi.
  //
  // Un refus rend 404, comme une commande introuvable : distinguer les deux
  // confirmerait a un enumerateur que la reference existe.
  const verdict = verdictJeton(searchParams.get('t'), c.jeton_suivi);

  // ---- LA SECONDE PREUVE, pour qui a perdu son lien.
  //
  // Le client peut taper sa reference a la main : ce chemin n'a pas de jeton,
  // et la phase 4 le refuserait. Or c'est justement celui qui a perdu son
  // message WhatsApp, donc celui qui a le plus besoin de suivre sa commande.
  // Les quatre derniers chiffres de SON numero le laissent passer.
  //
  // Quatre chiffres ne sont pas un secret : ce sont 10 000 possibilites. Ce
  // qui les rend tenables, c'est le plafond PAR COMMANDE ci-dessous — dix
  // essais par jour, soit mille jours pour tout balayer. Le compteur porte la
  // commande et non l'appelant : une attaque repartie sur cent adresses ne
  // gagne rien.
  const quatreChiffres = searchParams.get('tel4');
  const verdictSecondaire = verdictTelephone(quatreChiffres, c.client_telephone);

  if (verdictSecondaire !== 'absent') {
    const plafond = await plafondJournalierDepasse(
      `preuve:${c.reference}`,
      PLAFOND_PREUVES_PAR_COMMANDE,
    );
    if (plafond.depasse) {
      console.error(
        `Suivi — plafond de preuves atteint sur une commande, depuis ${appelant}.`,
      );
      // 404 comme partout ailleurs : dire « trop d'essais » confirmerait a
      // celui qui devine qu'il tape sur une vraie commande.
      return Response.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    // Le compteur est consomme meme quand la preuve est JUSTE : sinon un
    // attaquant essaierait a l'infini tant qu'il se trompe, et le plafond ne
    // bornerait rien.
    if (verdictSecondaire === 'invalide') {
      console.error(`Suivi — seconde preuve refusee depuis ${appelant}.`);
    }
  }

  // L'une OU l'autre suffit. Un jeton juste rend la seconde preuve inutile.
  const passe = verdict === 'ok' || verdictSecondaire === 'ok';

  // ON COMPTE AVANT DE REFUSER, et l'ordre n'est pas cosmetique.
  //
  // En phase 3 ce journal servait a decider de la bascule. En phase 4 il sert a
  // savoir si la bascule a CASSE quelqu'un — c'est-a-dire au moment ou il est
  // le plus utile. Place apres le `return`, il se taisait justement la : on
  // aurait bascule, puis on serait devenu aveugle.
  //
  // Un jeton INVALIDE n'est pas compte : ce n'est pas un client qui a perdu son
  // lien, c'est quelqu'un qui essaie. Le marqueur doit rester lisible.
  if (!passe && verdict === 'absent' && verdictSecondaire === 'absent') {
    journaliserAccesSansJeton({
      route: 'suivi',
      appelant,
      ageHeures: ageEnHeures(c.created_at),
    });
  }

  if (!passe && (jetonRefuse(verdict) || verdictSecondaire === 'invalide')) {
    console.error(`Suivi — acces refuse (jeton=${verdict}) depuis ${appelant}.`);
    return Response.json({ error: 'Commande introuvable' }, { status: 404 });
  }

  // Le nom de l'enseigne se lit apres coup, sur la boutique que la commande
  // designe — et non l'inverse.
  const { data: boutique } = await sb
    .from('boutiques')
    .select('slug, nom')
    .eq('id', c.boutique_id)
    .maybeSingle();

  return Response.json({
    boutique_id: boutique?.slug ?? c.boutique_id,
    nom_boutique: boutique?.nom ?? '',
    order_id: c.reference,
    customer_name: c.client_nom ?? '',
    address: c.client_adresse ?? '',
    total_price: String(c.total ?? 0),
    // NULL veut dire « pas encore annonce », jamais « gratuit » : on le rend
    // tel quel plutot qu'en zero, pour que l'ecran puisse se taire au lieu
    // d'afficher une livraison offerte que personne n'a promise.
    frais_livraison: c.frais_livraison === null ? null : Number(c.frais_livraison),
    items: (c.commande_items ?? []).map((i) => ({
      plat: i.nom_produit ?? '',
      quantite: i.quantite ?? 1,
      prix_unitaire: i.prix_unitaire ?? 0,
    })),
    timestamp: c.created_at ?? '',
    nom_livreur: c.nom_livreur ?? '',
    statut_livraison: c.statut_livraison ?? '',
    heure_prise_en_charge: c.heure_prise_en_charge ?? '',
    heure_livraison: c.heure_livraison ?? '',
  });
}
