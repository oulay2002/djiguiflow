import { NextResponse } from 'next/server';
import { effacerDossier } from '@/lib/dossierClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CHAMPS_A_EFFACER,
  JOURS_PANIER_ABANDONNE,
  JOURS_POSITION_GPS,
  JOURS_TRACE_RELANCE,
  MOIS_AVANT_ANONYMISATION,
  NOM_ANONYME,
  STATUTS_CLOS,
} from '@/lib/conservation';

export const dynamic = 'force-dynamic';

/**
 * Applique les durées de conservation. Une fois par nuit.
 *
 * Les durées et leurs raisons vivent dans `@/lib/conservation` ; cette route ne
 * fait que les exécuter. Séparer les deux permet d'éprouver la règle sans
 * toucher à la base — et de la relire sans lire du SQL.
 *
 * ── ELLE EFFACE. DONC ELLE COMPTE ET ELLE DIT. ─────────────────────────────
 *
 * Une purge silencieuse est la plus dangereuse des tâches : le jour où elle
 * efface trop, personne ne s'en aperçoit, et ce qui est parti ne revient que
 * par la sauvegarde. Elle rend donc le détail de ce qu'elle a fait, et n8n le
 * porte au journal.
 *
 * ── `relances_stop` N'EST PAS TOUCHÉE, JAMAIS ──────────────────────────────
 *
 * Une personne qui a écrit STOP a exercé un droit. Effacer ce refus au nom de
 * la minimisation le retournerait contre elle : la liste vidée, plus rien ne
 * l'empêcherait d'être démarchée à nouveau. Aucune règle de conservation ne
 * doit effacer la trace d'un droit exercé.
 */

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });

  /**
   * `essai` permet de voir CE QUI SERAIT EFFACÉ sans rien effacer.
   *
   * Une purge qu'on ne peut pas répéter à blanc ne se relit pas : on la lance
   * en croisant les doigts, ou on ne la lance pas du tout. Ici on peut la
   * regarder autant qu'on veut avant de la laisser agir.
   */
  let essai = false;
  try {
    const corps = (await req.json()) as { essai?: unknown };
    essai = corps?.essai === true;
  } catch {
    // Corps absent : on applique pour de bon, c'est l'appel de la tâche nocturne.
  }

  const maintenant = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const seuilPanier = iso(maintenant - JOURS_PANIER_ABANDONNE * 86_400_000);
  const seuilRelance = iso(maintenant - JOURS_TRACE_RELANCE * 86_400_000);
  const seuilPosition = iso(maintenant - JOURS_POSITION_GPS * 86_400_000);

  const limiteCommande = new Date(maintenant);
  limiteCommande.setMonth(limiteCommande.getMonth() - MOIS_AVANT_ANONYMISATION);

  const fait = { paniers: 0, commandes: 0, positions: 0, relances: 0, effacements: 0 };
  const erreurs: string[] = [];

  // ── 1. Paniers jamais convertis ────────────────────────────────────────
  //
  // Le traitement le plus exposé de la plateforme : le nom et le numéro de
  // quelqu'un qui n'a JAMAIS commandé, gardés pour le démarcher. Aucune
  // comptabilité à préserver — il se supprime entièrement.
  {
    const { data, error } = await sb
      .from('paniers')
      .select('id')
      .is('converti_le', null)
      .lt('cree_le', seuilPanier)
      .limit(500);

    if (error) erreurs.push(`paniers illisibles : ${error.message}`);
    else if (data?.length) {
      fait.paniers = data.length;
      if (!essai) {
        const { error: errSuppr } = await sb
          .from('paniers')
          .delete()
          .in('id', data.map((p) => p.id));
        if (errSuppr) {
          erreurs.push(`paniers non supprimes : ${errSuppr.message}`);
          fait.paniers = 0;
        }
      }
    }
  }

  // ── 2. Commandes closes de plus de douze mois ──────────────────────────
  //
  // ANONYMISÉES, PAS SUPPRIMÉES : une commande est aussi la comptabilité du
  // marchand. Le montant, la date et les articles restent ; la personne s'en va.
  //
  // On exige un statut CLOS. Une commande de treize mois encore « en attente »
  // est une anomalie qu'il faut regarder, pas une donnée à effacer —
  // l'anonymiser ferait disparaître le moyen de la comprendre.
  {
    const { data, error } = await sb
      .from('commandes')
      .select('id')
      .in('statut', [...STATUTS_CLOS])
      .lt('created_at', limiteCommande.toISOString())
      .neq('client_nom', NOM_ANONYME)
      .limit(500);

    if (error) erreurs.push(`commandes illisibles : ${error.message}`);
    else if (data?.length) {
      fait.commandes = data.length;
      if (!essai) {
        /**
         * LES CHAMPS SONT ECRITS EN TOUTES LETTRES, PAS BOUCLES.
         *
         * Une cle calculee elargit le type de `update()` a n'importe quelle
         * colonne : le compilateur cesse alors de proteger contre une faute de
         * frappe, et sur une route qui EFFACE, une faute de frappe efface la
         * mauvaise chose.
         *
         * `CHAMPS_A_EFFACER` reste la liste de reference, et un test fige la
         * correspondance entre les deux — sans quoi elles divergeraient au
         * premier champ ajoute.
         */
        const { error: errMaj } = await sb
          .from('commandes')
          .update({
            client_nom: NOM_ANONYME,
            // NOT NULL en base, toutes les deux : on les VIDE, on ne les annule
            // pas. Verifie au schema plutot que suppose — le compilateur a
            // refuse le `null`, et il avait raison.
            client_telephone: '',
            client_adresse: '',
            chat_id: null,
            instructions: null,
            latitude: null,
            longitude: null,
            position_livreur: null,
          })
          .in('id', data.map((c) => c.id));
        if (errMaj) {
          erreurs.push(`commandes non anonymisees : ${errMaj.message}`);
          fait.commandes = 0;
        }
      }
    }
  }

  // ── 3. Traces de relance de plus de quatre-vingt-dix jours ─────────────
  //
  // Elles servent le frein « une relance par personne et par mois ». Trois mois
  // couvrent largement cette fenêtre.
  {
    const { data, error } = await sb
      .from('relances_envoyees')
      .select('id')
      .lt('envoye_le', seuilRelance)
      .limit(500);

    if (error) erreurs.push(`relances illisibles : ${error.message}`);
    else if (data?.length) {
      fait.relances = data.length;
      if (!essai) {
        const { error: errSuppr } = await sb
          .from('relances_envoyees')
          .delete()
          .in('id', data.map((r) => r.id));
        if (errSuppr) {
          erreurs.push(`relances non supprimees : ${errSuppr.message}`);
          fait.relances = 0;
        }
      }
    }
  }

  // ── 3 bis. Positions GPS de plus de trente jours ───────────────────────
  //
  // ELLES NE SUIVENT PLUS LES DOUZE MOIS DE LA COMMANDE, et c'est le point de
  // cette étape. Une position sert au livreur à trouver la porte ; le lendemain
  // elle ne sert plus à personne, et la garder onze mois de plus revient à
  // détenir le point exact du domicile de quelqu'un sans raison.
  //
  // L'ADRESSE EN TOUTES LETTRES RESTE : le marchand garde de quoi comprendre
  // une livraison contestée. Seul le point GPS s'en va.
  //
  // On exige un statut CLOS, comme pour l'anonymisation : une commande encore
  // en route a besoin de sa position.
  {
    const { data, error } = await sb
      .from('commandes')
      .select('id')
      .in('statut', [...STATUTS_CLOS])
      .lt('created_at', seuilPosition)
      .or('latitude.not.is.null,longitude.not.is.null,position_livreur.not.is.null')
      .limit(500);

    if (error) erreurs.push(`positions illisibles : ${error.message}`);
    else if (data?.length) {
      fait.positions = data.length;
      if (!essai) {
        // Écrites en toutes lettres, comme l'anonymisation : une clé calculée
        // élargirait le type de `update()` à n'importe quelle colonne, et sur
        // une route qui efface, une faute de frappe efface la mauvaise chose.
        const { error: errMaj } = await sb
          .from('commandes')
          .update({ latitude: null, longitude: null, position_livreur: null })
          .in('id', data.map((c) => c.id));
        if (errMaj) {
          erreurs.push(`positions non effacees : ${errMaj.message}`);
          fait.positions = 0;
        }
      }
    }
  }

  // ── 4. Les effacements demandés et pas encore achevés ──────────────────
  //
  // POURQUOI ILS REVIENNENT ICI. Une personne peut demander l'effacement alors
  // qu'une commande est encore en route : on ne touche pas à celle-là, sans
  // quoi le livreur n'aurait plus ni nom ni adresse. Sa demande reste donc
  // ouverte, et c'est cette tâche qui la termine — dès la nuit qui suit la
  // fermeture de la commande.
  //
  // Sans ce passage, le droit serait « enregistré » et jamais honoré : la
  // personne devrait revenir le redemander, sans savoir qu'elle le doit.
  {
    const { data, error } = await sb
      .from('demandes_droits')
      .select('id, telephone')
      .eq('type', 'effacement')
      .eq('statut', 'recue')
      .limit(100);

    if (error) erreurs.push(`demandes de droits illisibles : ${error.message}`);
    else if (data?.length) {
      for (const d of data) {
        if (essai) { fait.effacements += 1; continue; }
        try {
          const bilan = await effacerDossier(sb, String(d.telephone));
          if (bilan.commandesEnCours > 0) continue;

          const { error: errMaj } = await sb
            .from('demandes_droits')
            .update({ statut: 'honoree', traite_le: new Date().toISOString(), detail: bilan })
            .eq('id', d.id);
          if (errMaj) {
            erreurs.push(`demande ${d.id} non close : ${errMaj.message}`);
            continue;
          }
          fait.effacements += 1;
        } catch (e) {
          // Une demande qui échoue ne doit pas emporter les autres : chacune
          // concerne une personne différente.
          erreurs.push(
            `effacement differe impossible : ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  /**
   * UNE ERREUR REND 503, ET C'EST VOULU.
   *
   * Rendre 200 avec « 0 effacé » ferait passer une panne de lecture pour une
   * base déjà propre. La tâche appelante doit voir rouge : une purge qui
   * n'efface plus rien depuis des semaines, sans que personne ne le sache, est
   * exactement le défaut que cette plateforme passe son temps à fermer.
   */
  if (erreurs.length) {
    console.error('Conservation —', erreurs.join(' | '));
    return NextResponse.json({ ok: false, erreurs, fait, essai }, { status: 503 });
  }

  const total = fait.paniers + fait.commandes + fait.relances + fait.effacements;
  if (total > 0) {
    console.log(
      `Conservation${essai ? ' (essai a blanc)' : ''} — ${fait.paniers} panier(s) supprime(s), `
      + `${fait.commandes} commande(s) anonymisee(s), ${fait.relances} trace(s) de relance retiree(s).`,
    );
  }

  return NextResponse.json({
    ok: true,
    essai,
    fait,
    // Rendus pour que le journal n8n dise SUR QUOI la regle a porte, sans avoir
    // a ouvrir le code.
    regles: {
      paniersJours: JOURS_PANIER_ABANDONNE,
      commandesMois: MOIS_AVANT_ANONYMISATION,
      positionsJours: JOURS_POSITION_GPS,
      relancesJours: JOURS_TRACE_RELANCE,
      stop: 'jamais efface — un refus exerce ne se supprime pas',
    },
  });
}
