'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { Bouton, LienRetour } from '@/components/ui/Bouton';

/**
 * L'écran des droits : ce qu'on détient sur vous, et comment le faire partir.
 *
 * ── LA DÉCISION QUI TIENT TOUT L'ÉCRAN ─────────────────────────────────────
 *
 * On ne demande PAS « entrez votre numéro ». Ce serait la forme évidente, et
 * ce serait une fuite : un numéro de téléphone n'est pas un secret, n'importe
 * qui pourrait taper celui d'un voisin et lire son adresse de domicile. On
 * demande donc la preuve qu'on demande déjà pour suivre une commande — le lien
 * reçu, ou une référence plus quatre chiffres. Le numéro, lui, est LU sur la
 * commande prouvée.
 *
 * La page l'explique au client, en une phrase : sans cela, la question « pourquoi
 * me demandez-vous une référence, je veux juste voir mes données ? » n'aurait
 * pas de réponse visible, et l'écran passerait pour tatillon au lieu de
 * prudent.
 *
 * ── CE QU'ON AFFICHE AVANT LE BOUTON ROUGE ─────────────────────────────────
 *
 * Les limites. Ce que l'effacement n'atteint pas — les messages déjà reçus sur
 * son téléphone, la copie chez le marchand — se lit AVANT de décider, pas
 * après. Une personne qui clique en croyant que tout disparaît et qui découvre
 * ensuite le contraire aurait raison de se sentir trompée.
 */

type Traitement = {
  cle: string;
  nom: string;
  donnees: string[];
  finalite: string;
  conservation: string;
  destinataires: string[];
  effacement: 'anonymise' | 'supprime' | 'garde';
  pourquoi?: string;
};

type Commande = {
  reference: string;
  date: string | null;
  boutique: string;
  total: number | null;
  statut: string | null;
  close: boolean;
  detenu: string[];
};

type Dossier = {
  /**
   * Vrai quand la commande qui a servi de preuve est DÉJÀ anonymisée.
   *
   * C'est le geste le plus probable après un effacement : la personne rouvre
   * le lien qu'elle garde dans son message. Lui répondre « réessayez dans un
   * instant » serait lui mentir sur l'état du service, et l'inviter à
   * recommencer sans fin.
   */
  efface?: boolean;
  numero: string | null;
  commandes: Commande[];
  paniers: number;
  relances: number;
  avisLivraison: number;
  refusDemarchage: string[];
  demandesAnterieures: { type: string; date: string | null; statut: string }[];
  traitements: Traitement[];
  horsDePortee: { quoi: string; pourquoi: string }[];
};

type Bilan = {
  commandesAnonymisees: number;
  paniersSupprimes: number;
  relancesSupprimees: number;
  avisRetires: number;
  commandesEnCours: number;
  refusEnregistres: number;
};

const CADRE = 'border border-nuit-900/12 bg-white/70 p-5';

/**
 * Ce que ce geste-ci va toucher, compte sur le dossier affiche.
 *
 * POURQUOI DES CHIFFRES, ET PAS UNE FORMULE. « Vos donnees seront effacees »
 * ne dit pas si cela concerne une commande ou douze. La personne qui confirme
 * doit reconnaitre SON dossier dans la phrase — sinon la confirmation ne
 * confirme rien, elle ne fait que retarder le meme clic.
 *
 * LE CAS OU IL N'Y A RIEN A EFFACER N'EST PAS UNE ERREUR. Quelqu'un dont
 * toutes les commandes sont en cours a le droit de demander l'effacement ; la
 * demande est enregistree et la tache nocturne l'applique a la fermeture. Lui
 * afficher « 0 commande » le laisserait croire que son geste n'a servi a rien.
 *
 * Les accords sont ecrits en toutes lettres. Un « commande(s) » a l'ecran est
 * un gabarit qu'on lit, pas une phrase qu'on ecrit.
 */
function porteeDuGeste(dossier: Dossier): string {
  const closes = dossier.commandes.filter((c) => c.close).length;
  const parties: string[] = [];

  if (closes > 0) {
    parties.push(
      closes === 1
        ? '1 commande terminée perdra votre nom, votre téléphone et votre adresse'
        : `${closes} commandes terminées perdront votre nom, votre téléphone et votre adresse`,
    );
  }
  if (dossier.paniers > 0) {
    parties.push(
      dossier.paniers === 1 ? '1 panier sera supprimé' : `${dossier.paniers} paniers seront supprimés`,
    );
  }
  if (dossier.relances > 0) {
    parties.push(
      dossier.relances === 1
        ? '1 relance sera supprimée'
        : `${dossier.relances} relances seront supprimées`,
    );
  }
  if (dossier.avisLivraison > 0) {
    parties.push(
      dossier.avisLivraison === 1
        ? '1 avis de livraison sera retiré'
        : `${dossier.avisLivraison} avis de livraison seront retirés`,
    );
  }

  // Les espaces qui precedent « : » et « ; » sont INSECABLES (U+00A0), ici et
  // dans le `join` plus bas. Invisible a la relecture du source, d'ou cette
  // note : la regle typographique francaise l'exige, et a 360 px c'est elle
  // qui empeche la ponctuation de tomber seule en tete de ligne.
  if (parties.length === 0) {
    return (
      'Vos commandes sont toutes en cours : rien ne peut être effacé aujourd’hui. '
      + 'Nous enregistrons votre demande et l’appliquons dès qu’elles seront terminées.'
    );
  }

  return `C’est définitif, et voici ce que cela touche : ${parties.join(' ; ')}.`;
}

function dateLisible(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function Ecran() {
  const params = useSearchParams();
  const refUrl = (params.get('ref') || '').trim();
  const jetonUrl = (params.get('t') || '').trim();

  const [ref, setRef] = useState(refUrl);
  const [tel4, setTel4] = useState('');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  /**
   * Vrai quand c'est l'ouverture AUTOMATIQUE par le lien qui a echoue.
   *
   * Sans cette distinction, on ne peut pas parler juste : le meme refus veut
   * dire « votre lien n'a pas marche » a celui qui n'a rien tape, et
   * « verifiez votre saisie » a celui qui vient de taper. Le drapeau retombe
   * des que la personne envoie le formulaire elle-meme.
   */
  const [lienEchoue, setLienEchoue] = useState(false);

  const [demandeEffacement, setDemandeEffacement] = useState(false);
  const [efface, setEfface] = useState<{ complet: boolean; bilan: Bilan } | null>(null);
  const [effacementEnCours, setEffacementEnCours] = useState(false);

  const zoneConfirmation = useRef<HTMLDivElement | null>(null);

  /**
   * LE VERROU QUI NE DEPEND PAS DU RENDU.
   *
   * `disabled={effacementEnCours}` ne ferme la porte qu'au repaint suivant.
   * Deux touchers separes de quelques millisecondes — le reflexe exact sur un
   * telephone lent — passent tous les deux avant lui. Une ref est posee dans
   * le meme tour de boucle que l'appel, donc avant le second.
   */
  const effacementLance = useRef(false);

  /**
   * LE FOCUS VA SUR L'AVERTISSEMENT, PAS SUR LE BOUTON ROUGE.
   *
   * Avant, les deux boutons occupaient la meme position dans le meme `div` :
   * React reutilisait le noeud, donc « Oui, effacer definitivement » naissait
   * sous le doigt ET heritait du focus. Un second toucher impatient, ou une
   * seconde frappe sur Entree, effacait.
   *
   * Poser le focus sur le bloc d'avertissement fait lire la portee reelle au
   * lecteur d'ecran, et laisse « Annuler » en premiere tabulation.
   */
  useEffect(() => {
    if (demandeEffacement) zoneConfirmation.current?.focus();
  }, [demandeEffacement]);

  /**
   * LE DOSSIER S'OUVRE : ON LE DIT, ET ON Y EMMENE LE FOCUS.
   *
   * C'est le geste central de l'ecran, et il etait muet. Le bouton se
   * desactive pendant l'appel, donc il perd le focus : mesure, `activeElement`
   * retombait sur `<body>`. Quatre sections apparaissaient sans que rien ne
   * l'annonce, et l'utilisateur au lecteur d'ecran avait perdu sa place.
   *
   * Le focus va sur l'en-tete du dossier plutot que sur une region `aria-live`
   * : il annonce ET replace le curseur au debut de ce qui vient d'arriver, si
   * bien que la lecture continue naturellement dans les sections suivantes.
   * Une region live aurait lu une phrase, puis laisse la personne sur `<body>`.
   *
   * `ouvertureDeja` empeche de reprendre le focus a chaque re-rendu du
   * dossier — on ne le vole qu'une fois, a l'arrivee.
   */
  const enteteDossier = useRef<HTMLParagraphElement | null>(null);
  const ouvertureDeja = useRef(false);
  useEffect(() => {
    if (!dossier) { ouvertureDeja.current = false; return; }
    if (ouvertureDeja.current) return;
    ouvertureDeja.current = true;
    enteteDossier.current?.focus();
  }, [dossier]);

  const charger = useCallback(async (
    r: string,
    jeton: string,
    chiffres: string,
    viaLien = false,
  ) => {
    setChargement(true);
    setErreur('');
    setLienEchoue(false);
    try {
      const res = await fetch('/api/mes-donnees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: r.trim(), t: jeton || undefined, tel4: chiffres || undefined }),
      });
      const corps = (await res.json().catch(() => null)) as (Dossier & { error?: string }) | null;
      if (res.ok && corps) {
        setDossier(corps);
      } else {
        setDossier(null);
        setLienEchoue(viaLien);
        setErreur(
          String(corps?.error ?? '')
          || 'Nous n’avons pas pu vérifier qu’il s’agit bien de vous.',
        );
      }
    } catch {
      setLienEchoue(viaLien);
      setErreur('La connexion a échoué. Réessayez dans un instant.');
    } finally {
      setChargement(false);
    }
  }, []);

  // Le lien reçu dans le message porte déjà la référence et le jeton : on ouvre
  // le dossier sans rien demander. Celui qui arrive les mains vides voit le
  // formulaire.
  useEffect(() => {
    if (refUrl && jetonUrl) void charger(refUrl, jetonUrl, '', true);
  }, [refUrl, jetonUrl, charger]);

  const effacer = useCallback(async () => {
    if (effacementLance.current) return;
    effacementLance.current = true;
    setEffacementEnCours(true);
    setErreur('');
    try {
      const res = await fetch('/api/mes-donnees/effacement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: ref.trim() || refUrl,
          t: jetonUrl || undefined,
          tel4: tel4 || undefined,
          confirme: true,
        }),
      });
      const corps = (await res.json().catch(() => null)) as
        | { ok?: boolean; complet?: boolean; bilan?: Bilan; error?: string }
        | null;
      if (res.ok && corps?.bilan) {
        setEfface({ complet: corps.complet === true, bilan: corps.bilan });
        setDossier(null);
        setDemandeEffacement(false);
      } else {
        // LE VERROU SE ROUVRE SUR L'ECHEC, ET SUR LUI SEUL. Sans cela, un
        // refus temporaire condamnerait la personne a recharger la page pour
        // exercer un droit. Le reessai ne peut pas doubler l'effacement : une
        // seconde demande sur un dossier deja anonymise sort par `dejaEfface`
        // et n'inscrit rien au registre.
        effacementLance.current = false;
        setErreur(String(corps?.error ?? '') || 'L’effacement n’a pas abouti.');
      }
    } catch {
      effacementLance.current = false;
      setErreur('La connexion a échoué. Vos données n’ont pas été touchées.');
    } finally {
      setEffacementEnCours(false);
    }
  }, [ref, refUrl, jetonUrl, tel4]);

  // L'ouverture automatique est en cours : la porte n'a rien a demander.
  const ouvertureParLien = Boolean(refUrl && jetonUrl) && chargement && !dossier && !efface;

  /**
   * LES DEUX PREUVES SONT-ELLES LA ?
   *
   * Une seule condition, lue par le bouton ET par la soumission du formulaire.
   * Ecrite deux fois, elle aurait diverge : la touche « OK » du clavier serait
   * partie sans les quatre chiffres alors que le bouton les exigeait.
   *
   * Le serveur les reclame TOUJOURS a qui n'a pas de jeton valide
   * (`preuveClient.ts` : verdictDuTelephone === 'absent' → refus). Et apres un
   * lien refuse, le jeton de l'URL ne vaut plus rien : le serveur traite un
   * jeton FAUX comme une tentative et refuse sans meme regarder les chiffres.
   *
   * Chaque envoi voue a l'echec consomme un des vingt appels par tranche de
   * dix minutes ET PAR ADRESSE — or les operateurs mobiles d'ici partagent
   * massivement leurs IP : ce budget n'appartient pas a une personne, mais a
   * un quartier.
   */
  const envoiPossible = !chargement
    && ref.trim() !== ''
    && !((!jetonUrl || lienEchoue) && tel4.length !== 4);

  return (
    <main id="contenu" className="mx-auto max-w-3xl px-5 py-10">
      <LienRetour href="/">Retour à l’accueil</LienRetour>

      <h1 className="mt-6 font-display text-3xl text-nuit-900">Vos données</h1>
      <p className="mt-2 text-chaux-600" style={{ fontSize: 'var(--text-chapeau)' }}>
        Voyez ce que DjiguiFlow détient à votre sujet, pourquoi, et pendant combien de
        temps. Vous pouvez en demander l’effacement.
      </p>
      {/*
        L'ECRAN MONTRE, LA POLITIQUE ENGAGE. L'un dit ce qu'on detient sur VOUS,
        l'autre ce a quoi la plateforme s'oblige envers tout le monde. Renvoyer
        de l'un a l'autre evite que le second ne soit qu'une page que personne
        n'ouvre.
      */}
      <p className="mt-2 text-sm">
        <Link
          href="/legal/confidentialite"
          className="text-chaux-600 underline underline-offset-4 transition hover:text-nuit-800"
        >
          Lire la politique de confidentialité
        </Link>
      </p>

      {efface && <ApresEffacement etat={efface} />}

      {/*
        L'ARRIVEE PAR LIEN A SON PROPRE ECRAN.
        La porte s'affichait pendant tout le chargement : celui qui venait de
        toucher son lien dans WhatsApp lisait « Prouvez que c'est bien vous »,
        avec une reference pre-remplie qu'il n'avait jamais tapee, plusieurs
        secondes durant en 3G. On lui reclamait a l'ecran ce qu'il venait
        justement de fournir.
      */}
      {ouvertureParLien && (
        <section className={`mt-8 ${CADRE}`} aria-busy>
          <p className="flex items-center gap-2 text-sm text-chaux-600">
            <Loader2 className="size-4 animate-spin text-nuit-700" aria-hidden />
            Nous ouvrons votre dossier…
          </p>
        </section>
      )}

      {!dossier && !efface && !ouvertureParLien && (
        <section className={`mt-8 ${CADRE}`}>
          <h2 className="font-display text-xl text-nuit-900">
            {lienEchoue ? 'Ouvrons-le autrement' : 'Prouvez que c’est bien vous'}
          </h2>
          {/*
            POURQUOI CETTE EXPLICATION EST OBLIGATOIRE À L'ÉCRAN. Sans elle, le
            client se demande pourquoi on lui réclame une référence alors qu'il
            veut « juste voir ses données », et l'écran passe pour tatillon. La
            vraie raison le rassure : c'est SA protection qu'on applique.
          */}
          <p className="mt-2 text-sm text-chaux-600">
            Nous ne demandons pas seulement votre numéro : n’importe qui pourrait taper
            celui d’un voisin et lire son adresse. Utilisez le lien reçu dans votre message
            de commande — ou, si vous l’avez perdu, la référence d’une de vos commandes et
            les quatre derniers chiffres du numéro qui l’a passée.
          </p>

          {/*
            UN VRAI <form>, ET PAS DEUX `onKeyDown`.
            La touche « OK » du clavier Android ne faisait rien : sans element
            de formulaire, il n'y a pas de soumission implicite, et la personne
            cherchait un bouton qu'elle venait de depasser. `/suivi` avait
            colle un `onKeyDown` sur chacun de ses champs — ca marche, mais ca
            se reoublie au champ suivant. Le `<form>` le tient une fois pour
            toutes, et il donne en prime le bon libelle de touche au clavier
            virtuel.
            `noValidate` : la validation est la notre, et ses messages sont
            ecrits en francais pour cette page — pas ceux du navigateur.
          */}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (envoiPossible) void charger(ref, lienEchoue ? '' : jetonUrl, tel4);
            }}
          >
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-nuit-900">Référence de commande</span>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                /*
                  L'EXEMPLE A LA LONGUEUR DES VRAIES REFERENCES.
                  Il portait « ZH-1042 ». Le prefixe est juste — c'est le plus
                  repandu en base — mais sept caracteres quand les vraies en
                  font seize a vingt-huit. La cliente comparait sa longue
                  reference a ce court exemple et concluait qu'elle n'avait pas
                  la bonne chose. Un exemple faux a la porte renvoie chez elle
                  quelqu'un qui tenait la cle.
                */
                placeholder="ZH-1234567890-0000"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="ou-trouver-reference"
                className="mt-1 w-full border border-nuit-900/20 bg-white px-3 py-2 font-mono text-sm text-nuit-900"
              />
              <span id="ou-trouver-reference" className="mt-1 block text-xs text-chaux-600">
                Elle est en haut du message que la boutique vous a envoyé.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-nuit-900">
                4 derniers chiffres du numéro qui a commandé
              </span>
              <input
                value={tel4}
                onChange={(e) => setTel4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                placeholder="0405"
                aria-describedby="pourquoi-quatre-chiffres"
                className="mt-1 w-full border border-nuit-900/20 bg-white px-3 py-2 font-mono text-sm text-nuit-900"
              />
              {/*
                « DU NUMERO QUI A COMMANDE », ET PAS « DE VOTRE NUMERO ».
                Une commande passee depuis le telephone d'un proche, ou depuis
                un second numero, se refusait sans que rien ne dise pourquoi :
                la personne tapait les chiffres du seul numero qu'elle
                considere comme le sien. C'est la commande qui designe le
                numero, pas la personne.
              */}
              {/*
                L'AIDE AJOUTE, ELLE NE REPETE PAS. Elle disait « les deux sont
                necessaires » — ce que le chapeau explique deja deux paragraphes
                plus haut, et mieux, avec la raison. Ici, la seule question
                ouverte est « quel numero ? », et c'est a elle de repondre.
              */}
              <span id="pourquoi-quatre-chiffres" className="mt-1 block text-xs text-chaux-600">
                Ceux du numéro qui a servi à commander, même si ce n’est pas le vôtre.
              </span>
            </label>
          </div>

          <div className="mt-5">
            <Bouton
              type="submit"
              variante="action"
              // Pas d'`onClick` : le bouton soumet le formulaire, et la
              // condition d'envoi vit a un seul endroit (`envoiPossible`).
              // Deux chemins d'envoi, c'est deux requetes au premier clic.
              disabled={!envoiPossible}
              chargement={chargement}
            >
              Voir mes données
            </Bouton>
          </div>

          {/*
            NE PAS REPROCHER UNE SAISIE QU'ON N'A PAS FAITE.
            Le refus du serveur est le meme pour tous les cas, et c'est
            volontaire : le distinguer dirait a celui qui devine qu'il a trouve
            une vraie commande. Mais son texte invite a « verifier la
            reference » — ce qui n'a aucun sens pour quelqu'un qui a seulement
            touche un lien. On ne change donc pas le verdict, on change a QUI
            on parle : ce qui a echoue, et par ou passer maintenant. Aucune
            cause n'est affirmee, parce qu'aucune n'est connue d'ici.
          */}
          {erreur && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-bissap-600">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {lienEchoue
                  ? 'Ce lien ne nous a pas permis d’ouvrir votre dossier. Saisissez la '
                    + 'référence de votre commande et les quatre derniers chiffres du numéro '
                    + 'qui a commandé : c’est le même chemin, sans le lien.'
                  : erreur}
              </span>
            </p>
          )}
          </form>
        </section>
      )}

      {dossier?.efface && (
        <section className="mt-8 border border-accent-200 bg-accent-50 p-5">
          <h2 className="flex items-center gap-2 font-display text-xl text-nuit-900">
            <ShieldCheck className="size-5 text-accent-600" aria-hidden />
            Ces données ont déjà été effacées
          </h2>
          <p className="mt-2 text-sm text-nuit-900">
            Cette commande ne porte plus ni nom, ni téléphone, ni adresse. Seuls le montant
            et la date subsistent, sans lien avec vous, pour la comptabilité du marchand.
          </p>
        </section>
      )}

      {dossier && !dossier.efface && (
        <>
          <section className={`mt-8 ${CADRE}`}>
            <p
              ref={enteteDossier}
              tabIndex={-1}
              className="flex items-center gap-2 text-sm text-chaux-600"
            >
              <ShieldCheck className="size-4 text-accent-600" aria-hidden />
              Dossier de la personne joignable au <strong className="font-mono">{dossier.numero}</strong>
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Compteur libelle="Commandes" valeur={dossier.commandes.length} />
              <Compteur libelle="Paniers non validés" valeur={dossier.paniers} />
              <Compteur libelle="Relances reçues" valeur={dossier.relances} />
              <Compteur libelle="Avis de livraison" valeur={dossier.avisLivraison} />
            </dl>

            {dossier.refusDemarchage.length > 0 && (
              <p className="mt-4 text-sm text-chaux-600">
                Vous avez demandé à ne plus être démarché chez{' '}
                {dossier.refusDemarchage.join(', ')}. Ce refus est conservé, et il le
                restera : c’est lui qui nous empêche de vous écrire à nouveau.
              </p>
            )}
          </section>

          {dossier.commandes.length > 0 && (
            <section className={`mt-6 ${CADRE}`}>
              <h2 className="font-display text-xl text-nuit-900">Vos commandes</h2>
              <ul className="mt-4 divide-y divide-nuit-900/10">
                {dossier.commandes.map((c) => (
                  <li key={c.reference} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-sm text-nuit-900">{c.reference}</span>
                      <span className="text-sm text-chaux-600">
                        {c.boutique} · {dateLisible(c.date)}
                        {!c.close && ' · en cours'}
                      </span>
                    </div>
                    {c.detenu.length > 0 && (
                      <p className="mt-1 text-sm text-chaux-600">
                        Nous y conservons {c.detenu.join(', ')}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`mt-6 ${CADRE}`}>
            <h2 className="font-display text-xl text-nuit-900">
              Ce que nous gardons, et pendant combien de temps
            </h2>
            <ul className="mt-4 space-y-5">
              {dossier.traitements.map((t) => (
                <li key={t.cle}>
                  <h3 className="font-medium text-nuit-900">{t.nom}</h3>
                  <p className="mt-1 text-sm text-chaux-600">{t.finalite}</p>
                  <p className="mt-1 text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">Données :</strong>{' '}
                    {t.donnees.join(' · ')}
                  </p>
                  <p className="mt-1 text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">Durée :</strong>{' '}
                    {t.conservation}
                  </p>
                  <p className="mt-1 text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">Qui y a accès :</strong>{' '}
                    {t.destinataires.join(' · ')}
                  </p>
                  {t.effacement === 'garde' && t.pourquoi && (
                    <p className="mt-1 text-sm text-mangue-700">
                      Conservé même après un effacement — {t.pourquoi}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 border border-bissap-200 bg-bissap-50 p-5">
            <h2 className="font-display text-xl text-nuit-900">Demander l’effacement</h2>

            <p className="mt-2 text-sm text-nuit-900">
              Vos commandes terminées perdent votre nom, votre téléphone et votre adresse.
              Le montant et la date restent, sans vous : c’est la comptabilité du marchand,
              qu’il doit conserver.
            </p>

            <div className="mt-4 border-t border-bissap-200 pt-4">
              <h3 className="text-sm font-medium text-nuit-900">
                Ce que cet effacement ne peut pas atteindre
              </h3>
              <ul className="mt-2 space-y-2">
                {dossier.horsDePortee.map((h) => (
                  <li key={h.quoi} className="text-sm text-chaux-600">
                    <strong className="font-medium text-nuit-900">{h.quoi}</strong> —{' '}
                    {h.pourquoi}
                  </li>
                ))}
              </ul>
            </div>

            {dossier.commandes.some((c) => !c.close) && (
              <p className="mt-4 text-sm text-mangue-700">
                Une de vos commandes est encore en cours : elle n’est pas touchée, sans quoi
                le livreur n’aurait plus ni nom ni adresse. Elle sera effacée d’elle-même dès
                qu’elle sera terminée — vous n’aurez rien à redemander.
              </p>
            )}

            {/*
              LES DEUX ETATS PORTENT UNE CLE DISTINCTE, ET C'EST LE CORRECTIF.
              Sans elle, les deux `div` occupent la meme position dans le meme
              parent : React reutilise le noeud, le bouton de confirmation
              naissait donc aux coordonnees exactes de celui qu'on venait de
              toucher (verifie : left 41px, height 44px, a l'identique) et
              gardait le focus. Un second toucher impatient sur un telephone
              lent tombait sur un effacement definitif. La cle force le
              remontage ; l'avertissement intercale deplace la cible.
            */}
            {!demandeEffacement ? (
              <div key="demande" className="mt-5">
                <Bouton variante="calme" onClick={() => setDemandeEffacement(true)}>
                  Je veux effacer mes données
                </Bouton>
              </div>
            ) : (
              <div
                key="confirmation"
                ref={zoneConfirmation}
                tabIndex={-1}
                role="group"
                aria-label="Confirmer l’effacement"
                className="mt-4 border-t border-bissap-200 pt-4"
              >
                <p className="text-sm font-medium text-nuit-900">{porteeDuGeste(dossier)}</p>

                {/*
                  ANNULER EN PREMIER, ET EMPILE A DESSEIN SUR TELEPHONE.
                  Dans le DOM, la premiere tabulation — et le premier element
                  qu'annonce un lecteur d'ecran apres l'avertissement — est la
                  sortie, pas le geste irreversible.
                  Cote a cote, les deux libelles depassent 360 px : le retour a
                  la ligne mettait « Annuler » seul sur une ligne, reduit a un
                  mot maigre, et posait le geste irreversible en bas — la ou le
                  pouce tombe. Empiles pleine largeur, la sortie devient une
                  cible de 44 px qu'un toucher imprecis rencontre AVANT le
                  bouton rouge.
                */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Bouton
                    variante="fantome"
                    className="w-full sm:w-auto"
                    onClick={() => setDemandeEffacement(false)}
                  >
                    Annuler
                  </Bouton>
                  <Bouton
                    variante="action"
                    className="w-full sm:w-auto"
                    onClick={() => void effacer()}
                    chargement={effacementEnCours}
                    disabled={effacementEnCours}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Oui, effacer définitivement
                  </Bouton>
                </div>
              </div>
            )}

            {/*
              ANNONCE : LE VERROU A ROUVERT, DONC CE MESSAGE EST ACTIONNABLE.
              Tant qu'un echec d'effacement etait sans reessai, ce paragraphe
              n'etait qu'un constat. Il porte desormais une consigne — reessayez
              — et un lecteur d'ecran ne l'entendait pas : le focus est reste
              sur le bouton, et rien n'a change dans l'arbre qu'il annonce.
              Le jumeau de la porte reste muet ; il releve de la passe
              d'accessibilite, pas de ce chemin-ci.
            */}
            {erreur && (
              <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-bissap-600">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{erreur}</span>
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Compteur({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div>
      <dt className="text-sm text-chaux-600">{libelle}</dt>
      <dd className="font-display text-2xl text-nuit-900">{valeur}</dd>
    </div>
  );
}

function ApresEffacement({ etat }: { etat: { complet: boolean; bilan: Bilan } }) {
  const { bilan, complet } = etat;
  return (
    <section className="mt-8 border border-accent-200 bg-accent-50 p-5">
      <h2 className="flex items-center gap-2 font-display text-xl text-nuit-900">
        <ShieldCheck className="size-5 text-accent-600" aria-hidden />
        C’est fait
      </h2>
      <ul className="mt-3 space-y-1 text-sm text-nuit-900">
        <li>{bilan.commandesAnonymisees} commande(s) : votre identité en a été retirée.</li>
        <li>{bilan.paniersSupprimes} panier(s) supprimé(s).</li>
        <li>{bilan.relancesSupprimees} trace(s) de relance supprimée(s).</li>
        {bilan.avisRetires > 0 && <li>{bilan.avisRetires} commentaire(s) de livraison retiré(s).</li>}
      </ul>

      {!complet && (
        <p className="mt-3 text-sm text-mangue-700">
          {bilan.commandesEnCours} commande(s) sont encore en cours et n’ont pas été
          touchées. Elles le seront automatiquement dès qu’elles seront terminées.
        </p>
      )}

      <p className="mt-3 text-sm text-chaux-600">
        Nous gardons uniquement votre numéro sur une liste de refus, pour ne plus jamais
        vous démarcher. C’est le strict nécessaire pour tenir cette promesse.
      </p>
    </section>
  );
}

export default function PageMesDonnees() {
  return (
    <Suspense fallback={<main id="contenu" className="mx-auto max-w-3xl px-5 py-10" />}>
      <Ecran />
    </Suspense>
  );
}
