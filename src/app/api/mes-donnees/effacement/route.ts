import { HORS_DE_PORTEE } from '@/lib/donneesPersonnelles';
import { effacerDossier } from '@/lib/dossierClient';
import { normaliserTelephone } from '@/lib/telephone';
import { prouverClient } from '@/lib/preuveClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * « Effacez mes données. »
 *
 * ── CE QUE CETTE ROUTE FAIT, ET DANS QUEL ORDRE ────────────────────────────
 *
 * 1. Elle exige la même preuve que la consultation — jeton, ou référence plus
 *    quatre chiffres. Aucun chemin plus faible n'existe.
 * 2. Elle anonymise les commandes CLOSES, supprime paniers et relances, retire
 *    les commentaires de livraison.
 * 3. Elle inscrit la personne sur la liste des refus de démarchage.
 * 4. Elle consigne la demande dans `demandes_droits` — la preuve qu'on a obéi.
 *
 * ── UNE COMMANDE EN COURS RESTE INTACTE ────────────────────────────────────
 *
 * Retirer le nom et l'adresse d'une commande qu'un livreur est en train de
 * porter, c'est empêcher qu'elle arrive. La demande reste alors OUVERTE, et la
 * tâche nocturne la reprend dès que ces commandes se ferment. La personne n'a
 * pas à revenir : c'est la différence entre un droit honoré et un droit
 * enregistré.
 *
 * ── L'ÉCRITURE EST CONFIRMÉE EXPLICITEMENT ─────────────────────────────────
 *
 * `confirme: true` est exigé dans le corps. Sans lui, un appel malencontreux —
 * un lien préchargé, un double envoi — effacerait des données sans que personne
 * ne l'ait voulu, et rien ne les rendrait.
 */
export async function POST(req: Request) {
  let corps: { ref?: unknown; t?: unknown; tel4?: unknown; confirme?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return Response.json({ error: 'Demande illisible.' }, { status: 400 });
  }

  if (corps.confirme !== true) {
    return Response.json(
      { error: 'Confirmation manquante : l’effacement n’a pas été demandé explicitement.' },
      { status: 400 },
    );
  }

  const preuve = await prouverClient(req, { ref: corps.ref, jeton: corps.t, tel4: corps.tel4 });
  if (!preuve.ok) {
    return Response.json({ error: preuve.message }, { status: preuve.statut, headers: preuve.entetes });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Service temporairement indisponible.' }, { status: 503 });

  // Le numéro sous sa forme normalisée : c'est lui qui figurera dans la trace
  // et dans la liste des refus, pour qu'une même personne y soit reconnaissable
  // quelle que soit la forme sous laquelle sa commande a été enregistrée.
  const norme = normaliserTelephone(preuve.telephone);
  const telephoneTrace = norme.ok ? norme.national : preuve.telephone;

  let bilan;
  try {
    bilan = await effacerDossier(sb, preuve.telephone);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Droits — effacement interrompu :', message);

    /**
     * ON CONSIGNE L'ÉCHEC, ET C'EST ESSENTIEL.
     *
     * Un effacement à moitié fait qui ne laisse aucune trace est le pire cas :
     * la personne a demandé, quelque chose est parti, le reste est resté, et
     * plus personne ne sait quoi. La ligne `refusee` permet de reprendre.
     */
    await sb.from('demandes_droits').insert({
      telephone: telephoneTrace,
      type: 'effacement',
      reference: preuve.reference,
      preuve: preuve.moyen,
      statut: 'refusee',
      detail: { erreur: message },
    });

    return Response.json(
      { error: 'L’effacement n’a pas pu être mené à son terme. Votre demande est enregistrée.' },
      { status: 503 },
    );
  }

  const complet = bilan.commandesEnCours === 0;

  const trace = await sb.from('demandes_droits').insert({
    telephone: telephoneTrace,
    type: 'effacement',
    reference: preuve.reference,
    preuve: preuve.moyen,
    statut: complet ? 'honoree' : 'recue',
    detail: bilan,
    traite_le: complet ? new Date().toISOString() : null,
  });

  if (trace.error) {
    // Les données SONT effacées ; seule la trace manque. On le dit au lieu de
    // rendre une erreur qui laisserait croire que rien n'a été fait.
    console.error('Droits — effacement fait mais trace non écrite :', trace.error.message);
  }

  return Response.json({
    ok: true,
    complet,
    bilan,
    horsDePortee: HORS_DE_PORTEE,
  });
}
