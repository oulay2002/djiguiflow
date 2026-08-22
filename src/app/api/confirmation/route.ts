import {
  ageEnHeures,
  jetonRefuse,
  journaliserAccesSansJeton,
  verdictJeton,
} from '@/lib/jetonSuivi';
import { adresseAppelante, rafaleDepassee } from '@/lib/limiteur';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { secretWebhookN8n } from '@/lib/secretN8n';
import { DELAI_WEBHOOK, delai } from '@/lib/reseau';

export const dynamic = 'force-dynamic';

/**
 * LE FREIN CONTRE L'ENUMERATION.
 *
 * Cette route n'exige aucune preuve autre que la reference de commande, et
 * elle fait DEUX choses graves si cette reference est devinee : elle affiche
 * l'adresse du client, et surtout son POST confirme ou ANNULE la commande.
 * Deviner une reference permet donc de detruire la commande d'un inconnu.
 *
 * Or les references de production ne sont pas toutes imprevisibles : il existe
 * des compteurs sequentiels (`ATT-1000000006`) et des formes derivables comme
 * `APP-<telephone>-<horodatage unix en secondes>`, ou connaitre le numero d'un
 * client ramene une journee a 86 400 essais.
 *
 * CE FREIN NE CORRIGE PAS LA CAUSE. La correction de fond est un jeton
 * imprevisible par commande, exige par ce lien. Tant qu'il n'existe pas, ceci
 * est le seul obstacle.
 *
 * L'ecriture est plus severement bornee que la lecture : un client ouvre son
 * lien, hesite, rafraichit — mais il ne repond qu'une fois.
 */
const LECTURES_PAR_APPELANT = 30;
const REPONSES_PAR_APPELANT = 10;
const FENETRE_CONFIRMATION_MS = 10 * 60_000;

/** Rend une reponse de refus quand l'appelant depasse son quota, sinon `null`. */
function freinDepasse(req: Request, limite: number, quoi: string): Response | null {
  const appelant = adresseAppelante(req);
  const rafale = rafaleDepassee(
    `confirmation:${quoi}:${appelant}`,
    limite,
    FENETRE_CONFIRMATION_MS,
  );
  if (!rafale.depassee) return null;

  console.error(
    `Confirmation — rafale ${quoi} refusee depuis ${appelant} : enumeration probable.`,
  );
  return reponseHtml(
    'TROP DE DEMANDES',
    'attente',
    'Trop de demandes',
    'Patientez quelques minutes avant de réessayer.',
    429,
    '',
    { 'Retry-After': String(rafale.attendreSecondes) },
  );
}

type LigneItem = { nom_produit: string | null; quantite: number | null };

type Ligne = {
  reference: string;
  jeton_suivi: string | null;
  created_at: string | null;
  confirmation_statut: string | null;
  boutique_id: string;
  client_nom: string | null;
  client_telephone: string | null;
  chat_id: string | null;
  client_adresse: string | null;
  total: number | null;
  canal: string | null;
  commande_items: LigneItem[] | null;
};

/**
 * Pourquoi un bouton, et non un simple lien.
 *
 * Le lien de confirmation vit dans un message WhatsApp, et WhatsApp visite les
 * URL qu'il contient pour en fabriquer l'apercu. Un GET qui modifie l'etat est
 * donc declenche tout seul, avant meme que le client ait lu le message :
 * constate le 11 aout 2026, une commande s'est confirmee une seconde apres
 * l'envoi, sans aucun clic. L'etape de confirmation ne servait alors a rien, et
 * les livreurs partaient sur une commande que personne n'avait acceptee.
 *
 * Le GET ne fait plus que montrer la commande et proposer deux boutons ; seul
 * le POST qu'ils declenchent ecrit. Aucun robot d'apercu ne poste.
 */
/**
 * Les couleurs de la maison, en dur : cette page est servie hors de
 * l'application et n'a acces ni a Tailwind ni aux variables de `globals.css`.
 * Elles doivent donc rester alignees a la main sur le nuancier « indigo &
 * ticket » — c'est le prix d'une page autonome, et il vaut mieux que le
 * client tombe sur un ecran gris ardoise qui ne ressemble a rien.
 */
const ENCRE = {
  fond: '#eeece5',
  papier: '#f8f7f3',
  filet: 'rgba(19,28,61,.14)',
  perfo: 'rgba(19,28,61,.3)',
  nuit: '#131c3d',
  gris: '#5f5b50',
  bissap: '#c4123f',
  feuille: '#177a5d',
  mangue: '#7d4b13',
} as const;

/** La police du produit n'est pas chargee ici : on garde ses replis. */
const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
const TITRE = "'Trebuchet MS'," + SANS;

type Ton = 'attente' | 'ok' | 'refus';

const COULEUR_TON: Record<Ton, string> = {
  attente: ENCRE.mangue,
  ok: ENCRE.feuille,
  refus: ENCRE.bissap,
};

/**
 * Le bon remis au client, dans la langue visuelle du reste du produit.
 *
 * C'etait une carte blanche a coins ronds sur fond creme, titree par un gros
 * emoji, en `system-ui` et en gris ardoise : la page de confirmation que
 * produit n'importe quel gabarit. Le client la voit pourtant juste apres avoir
 * commande, et c'est a elle qu'il juge le serieux du commerce.
 *
 * Elle porte donc le meme objet que partout ailleurs — le talon, la
 * perforation, le tampon — et le tampon remplace l'emoji : il dit l'etat en
 * un mot, ce que le pictogramme laissait deviner.
 */
function pageHtml(tampon: string, ton: Ton, titre: string, detail: string, corps = ''): string {
  const teinte = COULEUR_TON[ton];
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"/>`
    + `<title>${titre}</title></head>`
    + `<body style="font-family:${SANS};background:${ENCRE.fond};margin:0;`
    + `display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px">`
    + `<div style="background:${ENCRE.papier};border:1px solid ${ENCRE.filet};`
    + `box-shadow:0 18px 44px rgba(19,28,61,.1);padding:26px;max-width:420px;width:100%">`
    + `<p style="font-family:${MONO};font-size:10px;font-weight:700;text-transform:uppercase;`
    + `letter-spacing:.28em;color:${ENCRE.gris};margin:0">DjiguiFlow</p>`
    + `<div style="border-top:1px dashed ${ENCRE.perfo};margin:14px 0 22px"></div>`
    + `<span style="display:inline-block;border:1.5px solid ${teinte};border-radius:3px;`
    + `padding:4px 8px;transform:rotate(-5deg);font-family:${MONO};font-size:11px;`
    + `font-weight:700;letter-spacing:.2em;color:${teinte};opacity:.85">${tampon}</span>`
    + `<h1 style="font-family:${TITRE};font-size:26px;font-weight:800;line-height:1.15;`
    + `margin:16px 0 6px;color:${ENCRE.nuit}">${titre}</h1>`
    + `<p style="color:${ENCRE.gris};margin:0;font-size:15px;line-height:1.5">${detail}</p>`
    + `${corps}</div></body></html>`
  );
}

/**
 * Echappe tout ce qui vient du client avant de l'inserer dans la page.
 *
 * L'adresse et le nom des produits sont saisis par le client dans WhatsApp et
 * stockes tels quels : les afficher bruts, c'est du XSS stocke sur une page
 * publique. La reference elle-meme atterrit dans un attribut value : un
 * guillemet suffirait a tronquer le champ cache et a envoyer le POST sur une
 * autre commande.
 */
function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Le bouton qui donne au livreur la porte exacte, et non le quartier.
 *
 * A Abidjan l'adresse est un repere : « akouedo », « pharmacie livie ». Un lien
 * Maps bati sur ce texte ouvre le quartier. Le geocodage automatique rend
 * souvent un point faux — et un point faux est PIRE que pas de point, parce que
 * le livreur lui fait confiance et se perd avec assurance.
 *
 * Ici, le client vient de confirmer : il est dans un navigateur, en HTTPS, et
 * son telephone sait donner une position au metre pres. Un appui suffit. C'est
 * le seul chemin qui ne demande rien a copier et ne depend d'aucune passerelle
 * tierce — une position partagee sur WhatsApp, elle, n'a jamais atteint nos
 * webhooks.
 *
 * La reference passe par un attribut `data-`, echappe comme le reste de la
 * page, et non par une interpolation dans le script : rien de ce qui vient du
 * client ne doit devenir du code.
 */
function blocPosition(reference: string): string {
  const style =
    `background:${ENCRE.nuit};color:#fff;border:0;border-radius:0;padding:14px 20px;`
    + 'font-size:15px;font-weight:600;cursor:pointer;width:100%';
  return (
    `<div id="pos" data-ref="${echapper(reference)}" style="margin-top:24px">`
    + `<button id="btn-pos" style="${style}">Indiquer ma position exacte</button>`
    + `<p style="font-size:13px;color:${ENCRE.gris};margin:10px 0 0">`
    + 'Le livreur ira droit à votre porte, sans vous appeler.</p></div>'
    + '<script>(function(){'
    + "var z=document.getElementById('pos'),b=document.getElementById('btn-pos');"
    + "function dire(t,c){z.innerHTML='<p style=\"margin:24px 0 0;font-size:14px;color:'+c+'\">'+t+'</p>';}"
    + 'b.onclick=function(){'
    + "if(!navigator.geolocation){dire('Votre téléphone ne partage pas sa position.',ENCRE.mangue);return;}"
    + "b.disabled=true;b.textContent='Localisation…';"
    + 'navigator.geolocation.getCurrentPosition(function(p){'
    + "fetch('/api/confirmation/position',{method:'POST',headers:{'Content-Type':'application/json'},"
    + "body:JSON.stringify({ref:z.getAttribute('data-ref'),latitude:p.coords.latitude,longitude:p.coords.longitude})})"
    + '.then(function(r){return r.json();}).then(function(j){'
    + "dire(j&&j.ok?'✅ Merci, votre position est enregistrée.':'⚠️ Position non enregistrée.',j&&j.ok?ENCRE.feuille:ENCRE.mangue);})"
    + "['catch'](function(){dire('⚠️ Position non enregistrée.',ENCRE.mangue);});"
    + "},function(){dire('Position refusée. Vous pouvez l’autoriser dans les réglages de votre navigateur.',ENCRE.mangue);},"
    + '{enableHighAccuracy:true,timeout:10000});};})();</script>'
  );
}

/**
 * Le lien de suivi, que le client n'avait JAMAIS recu.
 *
 * La page /suivi existe depuis longtemps, elle affiche l'avancement de la
 * livraison, le livreur et desormais les frais — et rien ne l'envoyait. Un
 * commentaire de cette meme page annonce pourtant « le lien envoye au client
 * porte deja sa reference » : l'intention etait ecrite, jamais realisee.
 *
 * Le cout de ce silence est paye par le marchand : c'est lui qu'on appelle pour
 * demander ou en est la commande, en plein coup de feu.
 *
 * Pose ICI parce que le client vient de confirmer et qu'il a la page sous les
 * yeux. Le lien est aussi rappele dans le message « votre commande est en
 * route », qui est l'instant ou la question se pose vraiment.
 */
function blocSuivi(reference: string): string {
  const url = `/suivi?ref=${encodeURIComponent(reference)}`;
  return (
    `<a href="${echapper(url)}" style="display:block;margin-top:14px;padding:13px;`
    + `border:1px solid ${ENCRE.filet};color:${ENCRE.nuit};text-decoration:none;`
    + `font-size:15px;font-weight:600;text-align:center">Suivre ma commande</a>`
  );
}

/**
 * Neutralise les jokers d'un motif LIKE.
 *
 * La reference vient de la query string : « ? ref=% » ferait correspondre la
 * premiere commande venue, et permettrait de confirmer ou d'annuler celle d'un
 * autre client.
 */
function motifExact(valeur: string): string {
  return valeur.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function reponseHtml(
  tampon: string,
  ton: Ton,
  titre: string,
  detail: string,
  code = 200,
  corps = '',
  entetes: Record<string, string> = {},
): Response {
  return new Response(pageHtml(tampon, ton, titre, detail, corps), {
    status: code,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...entetes },
  });
}

/**
 * Le jeton designe-t-il bien cette commande ?
 *
 * Commun au GET et au POST : les deux doivent appliquer la meme regle, et le
 * POST est le plus grave des deux — c'est lui qui ANNULE une commande.
 *
 * Rend `null` quand l'appel peut continuer, sinon la page de refus. Le refus
 * se presente comme une commande introuvable : distinguer les deux
 * confirmerait a un enumerateur que la reference existe.
 */
function refusDuJeton(
  jetonFourni: string,
  ligne: Ligne,
  appelant: string,
  route: string,
): Response | null {
  const verdict = verdictJeton(jetonFourni, ligne.jeton_suivi);

  if (jetonRefuse(verdict)) {
    console.error(`Confirmation — jeton refuse (${verdict}) sur ${route} depuis ${appelant}.`);
    return reponseHtml(
      'INTROUVABLE',
      'refus',
      'Commande introuvable',
      'Vérifiez le lien reçu.',
      404,
    );
  }

  if (verdict === 'absent') {
    journaliserAccesSansJeton({ route, appelant, ageHeures: ageEnHeures(ligne.created_at) });
  }

  return null;
}

/** Lecture de la commande, commune au GET et au POST. */
async function chargerCommande(ref: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return { sb: null, ligne: null as Ligne | null };

  const { data } = await sb
    .from('commandes')
    .select(
      'reference, jeton_suivi, created_at, confirmation_statut, boutique_id, client_nom,' +
        ' client_telephone, chat_id, client_adresse, total, canal,' +
        ' commande_items(nom_produit, quantite)',
    )
    .ilike('reference', motifExact(ref))
    .maybeSingle();

  return { sb, ligne: (data as unknown as Ligne) ?? null };
}

function dejaRepondu(ligne: Ligne): Response | null {
  if (ligne.confirmation_statut !== 'confirmee' && ligne.confirmation_statut !== 'refusee') {
    return null;
  }
  const quoi = ligne.confirmation_statut === 'confirmee' ? 'confirmée ✅' : 'annulée ❌';
  return reponseHtml('DÉJÀ RÉPONDU', 'attente', 'Déjà répondu', `Cette commande a déjà été ${quoi}.`);
}

function articlesDe(ligne: Ligne): string[] {
  return (ligne.commande_items ?? []).map(
    (i) => `${i.quantite ?? 1}× ${i.nom_produit ?? 'Article'}`,
  );
}

/** Ce que le client voit en ouvrant le lien : sa commande, et deux boutons. */
export async function GET(req: Request) {
  const refus = freinDepasse(req, LECTURES_PAR_APPELANT, 'lecture');
  if (refus) return refus;

  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get('ref') || '').trim();
  if (!ref) return reponseHtml('LIEN INVALIDE', 'refus', 'Lien invalide', 'Ce lien de confirmation est incomplet.', 400);

  const { sb, ligne } = await chargerCommande(ref);
  if (!sb) return reponseHtml('INDISPONIBLE', 'attente', 'Service indisponible', 'Réessayez dans quelques secondes.', 503);
  if (!ligne) return reponseHtml('INTROUVABLE', 'refus', 'Commande introuvable', 'Vérifiez le lien reçu.', 404);

  const jetonFourni = (searchParams.get('t') || '').trim();
  const refusJeton = refusDuJeton(jetonFourni, ligne, adresseAppelante(req), 'confirmation:lecture');
  if (refusJeton) return refusJeton;

  const repondu = dejaRepondu(ligne);
  if (repondu) return repondu;

  const bouton = (valeur: string, libelle: string, fond: string) =>
    `<form method="post" style="display:inline-block;margin:6px">` +
    `<input type="hidden" name="ref" value="${echapper(ligne.reference)}"/>` +
    `<input type="hidden" name="r" value="${valeur}"/>` +
    // Le jeton RECU, jamais celui de la base : un GET tolere sans jeton ne
    // doit pas distribuer le vrai a qui vient de le deviner.
    `<input type="hidden" name="t" value="${echapper(jetonFourni)}"/>` +
    `<button type="submit" style="border:0;border-radius:0;padding:14px 22px;font-size:16px;font-weight:600;cursor:pointer;color:#fff;background:${fond}">${libelle}</button>` +
    `</form>`;

  const articles = articlesDe(ligne).join(', ');
  const recap =
    `<div style="border-top:1px dashed ${ENCRE.perfo};margin:20px 0 14px"></div>` +
    `<p style="color:${ENCRE.nuit};margin:0 0 4px;font-weight:600">${echapper(articles) || 'Votre commande'}</p>` +
    `<p style="font-family:${MONO};color:${ENCRE.gris};margin:0 0 18px;font-size:14px">${Number(ligne.total ?? 0).toLocaleString('fr-FR')} FCFA · ${echapper(ligne.client_adresse)}</p>` +
    `<div>${bouton('oui', 'Je confirme', ENCRE.feuille)}${bouton('non', "J'annule", ENCRE.bissap)}</div>`;

  return reponseHtml('À CONFIRMER', 'attente', 'Confirmez votre commande', 'Serez-vous disponible pour la réception ?', 200, recap);
}

/** L'ecriture, declenchee par le bouton et par lui seul. */
export async function POST(req: Request) {
  const refus = freinDepasse(req, REPONSES_PAR_APPELANT, 'reponse');
  if (refus) return refus;

  let ref = '';
  let r = '';
  let jetonFourni = '';

  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    ref = String(corps.ref ?? '').trim();
    r = String(corps.r ?? '').toLowerCase();
    jetonFourni = String(corps.t ?? '').trim();
  } else {
    // Un corps tronque ou un content-type inattendu ne doit pas rendre un 500
    // brut a un client qui vient simplement de cliquer sur un bouton.
    const form = await req.formData().catch(() => null);
    ref = String(form?.get('ref') ?? '').trim();
    r = String(form?.get('r') ?? '').toLowerCase();
    jetonFourni = String(form?.get('t') ?? '').trim();
  }

  if (!ref || (r !== 'oui' && r !== 'non')) {
    return reponseHtml('LIEN INVALIDE', 'refus', 'Lien invalide', 'Ce lien de confirmation est incomplet.', 400);
  }

  const { sb, ligne } = await chargerCommande(ref);
  if (!sb) return reponseHtml('INDISPONIBLE', 'attente', 'Service indisponible', 'Réessayez dans quelques secondes.', 503);
  if (!ligne) return reponseHtml('INTROUVABLE', 'refus', 'Commande introuvable', 'Vérifiez le lien reçu.', 404);

  // C'EST ICI QUE LE JETON COMPTE LE PLUS. Ce verbe ECRIT : il confirme ou il
  // ANNULE. Deviner une reference permettait donc de detruire la commande d'un
  // inconnu. Le controle passe avant toute ecriture.
  const refusJeton = refusDuJeton(jetonFourni, ligne, adresseAppelante(req), 'confirmation:reponse');
  if (refusJeton) return refusJeton;

  const repondu = dejaRepondu(ligne);
  if (repondu) return repondu;

  const statut = r === 'oui' ? 'confirmee' : 'refusee';
  const { error: errUpd } = await sb
    .from('commandes')
    .update({ confirmation_statut: statut, confirmation_heure: new Date().toISOString() })
    .eq('reference', ligne.reference);
  if (errUpd) return reponseHtml('PANNE', 'attente', 'Erreur technique', 'Réessayez dans quelques secondes.', 503);

  const n8n = process.env.N8N_CONFIRMATION_URL;
  if (n8n) {
    try {
      const telClient = ligne.client_telephone || ligne.chat_id || '';
      await fetch(n8n, {
        method: 'POST',
        signal: delai(DELAI_WEBHOOK),
        headers: {
          'Content-Type': 'application/json',
          // Un seul secret pour tous les webhooks n8n, lu au coffre Supabase.
          // Voir `secretN8n.ts` pour la rotation.
          'x-djiguiflow-secret': await secretWebhookN8n(),
        },
        body: JSON.stringify({
          type: statut,
          reference: ligne.reference,
          boutique_id: ligne.boutique_id,
          customer_name: ligne.client_nom ?? 'Client',
          phone: telClient,
          address: ligne.client_adresse ?? '',
          items: articlesDe(ligne),
          total_price: Number(ligne.total ?? 0),
          canal: String(ligne.canal ?? 'whatsapp').toLowerCase(),
          chat_id: ligne.chat_id || telClient,
          destinataire: telClient,
        }),
      });
    } catch {
      /* non bloquant : la reponse du client est deja enregistree */
    }
  }

  // La position n'est proposee qu'apres une confirmation : demander a quelqu'un
  // qui vient d'annuler ou se trouve sa porte n'a aucun sens.
  return statut === 'confirmee'
    ? reponseHtml(
        'CONFIRMÉE',
        'ok',
        'Commande confirmée',
        'Le commerçant prépare votre commande.',
        200,
        blocPosition(ligne.reference) + blocSuivi(ligne.reference),
      )
    : reponseHtml('ANNULÉE', 'refus', 'Commande annulée', 'Le commerçant a été prévenu. Aucune somme ne sera due.');
}
