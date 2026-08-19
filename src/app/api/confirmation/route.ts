import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { secretWebhookN8n } from '@/lib/secretN8n';

export const dynamic = 'force-dynamic';

type LigneItem = { nom_produit: string | null; quantite: number | null };

type Ligne = {
  reference: string;
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
function pageHtml(emoji: string, titre: string, detail: string, corps = ''): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${titre}</title></head><body style="font-family:system-ui,sans-serif;background:#f7f0e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="background:#fff;border-radius:24px;padding:40px;max-width:420px;text-align:center;box-shadow:0 20px 60px rgba(49,35,20,.12)"><div style="font-size:48px">${emoji}</div><h1 style="font-size:22px;margin:16px 0 8px;color:#0f172a">${titre}</h1><p style="color:#64748b;margin:0">${detail}</p>${corps}<p style="margin-top:24px;font-size:13px;color:#94a3b8">DjiguiFlow 🍽️</p></div></body></html>`;
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
    'background:#0f172a;color:#fff;border:0;border-radius:12px;padding:14px 20px;'
    + 'font-size:15px;font-weight:600;cursor:pointer;width:100%';
  return (
    `<div id="pos" data-ref="${echapper(reference)}" style="margin-top:24px">`
    + `<button id="btn-pos" style="${style}">📍 Indiquer ma position exacte</button>`
    + '<p style="font-size:13px;color:#94a3b8;margin:10px 0 0">'
    + 'Le livreur ira droit à votre porte, sans vous appeler.</p></div>'
    + '<script>(function(){'
    + "var z=document.getElementById('pos'),b=document.getElementById('btn-pos');"
    + "function dire(t,c){z.innerHTML='<p style=\"margin:24px 0 0;font-size:14px;color:'+c+'\">'+t+'</p>';}"
    + 'b.onclick=function(){'
    + "if(!navigator.geolocation){dire('Votre téléphone ne partage pas sa position.','#b45309');return;}"
    + "b.disabled=true;b.textContent='Localisation…';"
    + 'navigator.geolocation.getCurrentPosition(function(p){'
    + "fetch('/api/confirmation/position',{method:'POST',headers:{'Content-Type':'application/json'},"
    + "body:JSON.stringify({ref:z.getAttribute('data-ref'),latitude:p.coords.latitude,longitude:p.coords.longitude})})"
    + '.then(function(r){return r.json();}).then(function(j){'
    + "dire(j&&j.ok?'✅ Merci, votre position est enregistrée.':'⚠️ Position non enregistrée.',j&&j.ok?'#15803d':'#b45309');})"
    + "['catch'](function(){dire('⚠️ Position non enregistrée.','#b45309');});"
    + "},function(){dire('Position refusée. Vous pouvez l’autoriser dans les réglages de votre navigateur.','#b45309');},"
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
    + 'border:1px solid #e2e8f0;border-radius:12px;color:#0f172a;text-decoration:none;'
    + 'font-size:15px;font-weight:600">🚚 Suivre ma commande</a>'
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

function reponseHtml(emoji: string, titre: string, detail: string, code = 200, corps = ''): Response {
  return new Response(pageHtml(emoji, titre, detail, corps), {
    status: code,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Lecture de la commande, commune au GET et au POST. */
async function chargerCommande(ref: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return { sb: null, ligne: null as Ligne | null };

  const { data } = await sb
    .from('commandes')
    .select(
      'reference, confirmation_statut, boutique_id, client_nom, client_telephone, chat_id,' +
        ' client_adresse, total, canal, commande_items(nom_produit, quantite)',
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
  return reponseHtml('ℹ️', 'Déjà répondu', `Cette commande a déjà été ${quoi}.`);
}

function articlesDe(ligne: Ligne): string[] {
  return (ligne.commande_items ?? []).map(
    (i) => `${i.quantite ?? 1}× ${i.nom_produit ?? 'Article'}`,
  );
}

/** Ce que le client voit en ouvrant le lien : sa commande, et deux boutons. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = (searchParams.get('ref') || '').trim();
  if (!ref) return reponseHtml('❌', 'Lien invalide', 'Ce lien de confirmation est incomplet.', 400);

  const { sb, ligne } = await chargerCommande(ref);
  if (!sb) return reponseHtml('⏳', 'Service indisponible', 'Réessayez dans quelques secondes.', 503);
  if (!ligne) return reponseHtml('❌', 'Commande introuvable', 'Vérifiez le lien reçu.', 404);

  const repondu = dejaRepondu(ligne);
  if (repondu) return repondu;

  const bouton = (valeur: string, libelle: string, fond: string) =>
    `<form method="post" style="display:inline-block;margin:6px">` +
    `<input type="hidden" name="ref" value="${echapper(ligne.reference)}"/>` +
    `<input type="hidden" name="r" value="${valeur}"/>` +
    `<button type="submit" style="border:0;border-radius:12px;padding:14px 22px;font-size:16px;cursor:pointer;color:#fff;background:${fond}">${libelle}</button>` +
    `</form>`;

  const articles = articlesDe(ligne).join(', ');
  const recap =
    `<p style="color:#0f172a;margin:18px 0 4px;font-weight:600">${echapper(articles) || 'Votre commande'}</p>` +
    `<p style="color:#64748b;margin:0 0 18px">${Number(ligne.total ?? 0).toLocaleString('fr-FR')} FCFA · ${echapper(ligne.client_adresse)}</p>` +
    `<div>${bouton('oui', '✅ Je confirme', '#16a34a')}${bouton('non', "❌ J'annule", '#dc2626')}</div>`;

  return reponseHtml('🍽️', 'Confirmez votre commande', 'Serez-vous disponible pour la réception ?', 200, recap);
}

/** L'ecriture, declenchee par le bouton et par lui seul. */
export async function POST(req: Request) {
  let ref = '';
  let r = '';

  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    ref = String(corps.ref ?? '').trim();
    r = String(corps.r ?? '').toLowerCase();
  } else {
    // Un corps tronque ou un content-type inattendu ne doit pas rendre un 500
    // brut a un client qui vient simplement de cliquer sur un bouton.
    const form = await req.formData().catch(() => null);
    ref = String(form?.get('ref') ?? '').trim();
    r = String(form?.get('r') ?? '').toLowerCase();
  }

  if (!ref || (r !== 'oui' && r !== 'non')) {
    return reponseHtml('❌', 'Lien invalide', 'Ce lien de confirmation est incomplet.', 400);
  }

  const { sb, ligne } = await chargerCommande(ref);
  if (!sb) return reponseHtml('⏳', 'Service indisponible', 'Réessayez dans quelques secondes.', 503);
  if (!ligne) return reponseHtml('❌', 'Commande introuvable', 'Vérifiez le lien reçu.', 404);

  const repondu = dejaRepondu(ligne);
  if (repondu) return repondu;

  const statut = r === 'oui' ? 'confirmee' : 'refusee';
  const { error: errUpd } = await sb
    .from('commandes')
    .update({ confirmation_statut: statut, confirmation_heure: new Date().toISOString() })
    .eq('reference', ligne.reference);
  if (errUpd) return reponseHtml('⏳', 'Erreur technique', 'Réessayez dans quelques secondes.', 503);

  const n8n = process.env.N8N_CONFIRMATION_URL;
  if (n8n) {
    try {
      const telClient = ligne.client_telephone || ligne.chat_id || '';
      await fetch(n8n, {
        method: 'POST',
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
        '✅',
        'Commande confirmée !',
        'Le commerçant prépare votre commande. Merci !',
        200,
        blocPosition(ligne.reference) + blocSuivi(ligne.reference),
      )
    : reponseHtml('❌', 'Commande annulée', 'Le commerçant a été prévenu. Aucune somme ne sera due.');
}
