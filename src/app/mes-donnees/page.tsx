'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
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

      {/*
        LA GRAISSE MANQUAIT, ET AVEC ELLE TOUT LE CARACTERE.
        `font-display` ne pose que la famille : le titre heritait de 400, sur
        une grotesque a contraste variable dessinee pour vivre a 800. « Vos
        données » ne se lisait pas comme un tampon mais comme une phrase un peu
        grande, et rien ne le separait du chapeau qui le suit. 800 est dans le
        fichier variable deja charge — le corriger ne coute pas un octet.
        `font-extrabold` et non `font-black` : la variable s'arrete a 800, et
        demander 900 ferait synthetiser au trait ce qu'on vient de reparer.
      */}
      <h1 className="mt-6 font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-nuit-900 sm:text-4xl">
        Vos données
      </h1>
      {/*
        `text-chapeau` ET PAS `style={{ fontSize: var(--text-chapeau) }}`.
        Le jeton porte DEUX valeurs — la taille et son interligne de 1,625. Une
        valeur litterale n'en transporte qu'une : le chapeau rendait a 1,5,
        l'interligne du corps, et perdait 2,125 px de plomb par ligne. C'est ce
        dommage-la que la regle de DESIGN.md existe pour empecher.
      */}
      <p className="mt-2 text-chapeau text-chaux-600">
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
          <h2 className="font-display text-2xl font-bold tracking-[-0.01em] text-nuit-900">
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
                className="mt-1 min-h-11 w-full border border-nuit-900/20 bg-white px-3 py-2.5 font-mono text-sm text-nuit-900"
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
                className="mt-1 min-h-11 w-full border border-nuit-900/20 bg-white px-3 py-2.5 font-mono text-sm text-nuit-900"
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
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-[-0.01em] text-nuit-900">
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
              Dossier de la personne joignable au{' '}
              {/*
                PAS DE `whitespace-nowrap` ICI, ET C'EST UN ARBITRAGE.
                « 01 •• •• •• 05 » se coupe en deux au milieu du masque a
                360 px, ce qui est laid. Le rendre insecable le repare — et
                coute 200 px de defilement lateral a 200 % de texte (382 → 583
                px mesures), parce qu'un mot de quatorze signes en mono a 28 px
                ne rentre plus nulle part. Une coupure disgracieuse pour tout
                le monde vaut mieux qu'une page qui defile de travers pour qui
                grossit son texte.
                `font-semibold` et non `<strong>` nu : celui-ci vaut 700, et
                600 suffit — le numero n'est pas le sujet de la phrase, il en
                est la preuve.
              */}
              <strong className="font-mono font-semibold">{dossier.numero}</strong>
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

            {/*
              LA DEMANDE DEJA FAITE, DITE ICI OU NULLE PART.
              `demandesAnterieures` etait collecte, type, transmis a chaque
              ouverture — et jamais affiche. Quelqu'un dont l'effacement attend
              la cloture d'une commande revenait, ne voyait aucune trace de sa
              demande, et la refaisait. On payait le reseau pour l'information
              qui aurait evite le second passage.
            */}
            {dossier.demandesAnterieures.length > 0 && (
              <p className="mt-4 text-sm text-nuit-900">
                Vous avez déjà demandé un effacement
                {dateLisible(dossier.demandesAnterieures[0].date)
                  ? ` le ${dateLisible(dossier.demandesAnterieures[0].date)}`
                  : ''}
                . Il est enregistré et s’applique dès que vos commandes en cours seront
                terminées — vous n’avez rien à redemander.
              </p>
            )}

            {/*
              LE RACCOURCI VERS LA DECISION.
              La personne qui vient POUR effacer n'a pas a traverser tout le
              registre pour trouver le bouton. Ce lien n'enleve rien a ceux qui
              lisent : il ouvre une seconde porte, plus haut.
            */}
            <p className="mt-4">
              <a
                href="#effacement"
                className="inline-flex min-h-11 items-center text-sm font-medium text-bissap-600 underline underline-offset-4 transition hover:text-bissap-700"
              >
                Aller directement à la demande d’effacement
              </a>
            </p>
          </section>

          {dossier.commandes.length > 0 && (
            <section className={`mt-6 ${CADRE}`}>
              {/* « chez ce marchand » : le traitement de la section suivante
                  s'appelle aussi « Vos commandes ». Deux entrees identiques
                  dans la navigation par titres d'un lecteur d'ecran ne
                  designent pas la meme chose — l'une est la liste, l'autre
                  la regle de conservation. */}
              <h2 className="font-display text-2xl font-bold tracking-[-0.01em] text-nuit-900">Vos commandes chez ce marchand</h2>
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
            <h2 className="font-display text-2xl font-bold tracking-[-0.01em] text-nuit-900">
              Ce que nous gardons, et pendant combien de temps
            </h2>
            {/*
              CE QU'ON MONTRE FERMÉ, ET CE QU'ON N'A PAS LE DROIT DE REPLIER.
              Les huit traitements dépliés faisaient 5 097 px et 1 114 mots à
              360 px — six écrans de défilement AVANT le bouton d'effacement.
              Conséquence mesurable : les limites qu'on a pris tant de soin à
              placer au-dessus du bouton n'étaient jamais lues, parce qu'on
              saute un mur.
              Restent visibles sans ouvrir : le nom, la DURÉE — la seule
              réponse à « pendant combien de temps ? », qui est la question du
              titre — et l'avertissement « conservé même après un effacement ».
              Ce dernier ne se replie pas : il contredit ce que la personne
              s'apprête à faire, le cacher derrière un clic le ferait manquer
              exactement à qui il s'adresse.
              Finalité, données et destinataires s'ouvrent à la demande : ils
              répondent à « pourquoi » et « qui », questions qu'on se pose
              traitement par traitement, jamais sur les huit d'un coup.
            */}
            <ul className="mt-4 space-y-3">
              {dossier.traitements.map((t) => (
                <li key={t.cle} className="border-t border-nuit-900/10 pt-3 first:border-0 first:pt-0">
                  <details className="group">
                    {/* Le nom reste un `h3` A L'INTERIEUR du `summary` : le
                        replier ne doit pas le retirer de la navigation par
                        titres, qui est la facon dont un lecteur d'ecran
                        parcourt un registre de huit entrees. */}
                    {/* `flex-wrap` : a 100 % le nom et la duree tiennent sur
                        une ligne ; a 200 % de texte, la duree et son chevron
                        descendent sous le nom au lieu de pousser le document.
                        Meme traitement que les quatre autres rangees de la
                        coque — une rangee qui ne peut pas ceder impose sa
                        largeur a toute la page. */}
                    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                      {/* 600 et pas 500 : a 14 px, 500 contre le 400 du corps
                          ne fait pas un titre — et quatre roles differents de
                          l'ecran portaient deja ce meme 14/500. */}
                      <h3 className="min-w-0 text-sm font-semibold text-nuit-900">{t.nom}</h3>
                      {/*
                        `min-w-0` ET PAS `shrink-0` — c'est un correctif de
                        regression, introduite par le repliage lui-meme.
                        `shrink-0` interdisait a la duree de ceder : a 200 % de
                        texte, « 3 ans apres la derniere commande » reclamait
                        423 px dans un `summary` qui en fait 322, ecrasait le
                        titre voisin a 26 px, et poussait le document a 554 px
                        pour une fenetre de 360. Le retrait du seul
                        `flex-shrink` le ramene a 386.
                        `font-mono` : ces durees se comparent d'une ligne a
                        l'autre — c'est la regle du chiffre en mono, et elles
                        ne s'alignaient pas.
                      */}
                      <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-chaux-600">
                        {t.conservation}
                        {/* `shrink-0` SUR L'ICONE, `min-w-0` sur le texte :
                            c'est le texte qui doit ceder, jamais le chevron.
                            Sans lui, a 200 % l'icone s'ecrasait a une largeur
                            de ZERO tandis que son trace continuait de peindre
                            12 px hors de sa boite — un debordement invisible a
                            la bissection, puisque plus aucune BOITE ne
                            depassait. */}
                        <ChevronDown
                          className="size-4 shrink-0 transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </span>
                    </summary>

                    <p className="mt-2 text-sm text-chaux-600">{t.finalite}</p>

                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-chaux-600">
                      Données
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm text-chaux-600">
                      {t.donnees.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-chaux-600">
                      <strong className="font-medium text-nuit-900">Qui y a accès :</strong>{' '}
                      {t.destinataires.join(', ')}
                    </p>
                  </details>

                  {t.effacement === 'garde' && t.pourquoi && (
                    <p className="mt-1 text-sm text-mangue-700">
                      Conservé même après un effacement — {t.pourquoi}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section
            id="effacement"
            /* `scroll-mt-6` : arriver par l'ancre ne doit pas coller le titre
               au bord haut de l'ecran — on veut voir qu'on est entre dans une
               section, pas atterrir dessus. Meme reglage que `.etape` du
               guide. */
            className="mt-6 scroll-mt-6 border border-bissap-200 bg-bissap-50 p-5"
          >
            <h2 className="font-display text-2xl font-bold tracking-[-0.01em] text-nuit-900">Demander l’effacement</h2>

            {/* `max-w-[62ch]` : a 1280 px, ce paragraphe composait 88 signes
                par ligne — bien au-dela des 75 ou l'oeil retrouve encore le
                debut de la ligne suivante. Et c'est celui qu'il faut le moins
                mal lire : il dit ce que l'effacement laisse en place. */}
            <p className="mt-2 max-w-[62ch] text-sm text-nuit-900">
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

/**
 * La tuile de comptage de la maison, enfin conforme.
 *
 * DEUX REGLES NOMMEES ETAIENT PRISES A L'ENVERS.
 *
 * 1. « LA REGLE DU CHIFFRE EN MONO ». Ces quatre nombres sont le seul endroit
 *    de l'ecran ou l'oeil compare d'une tuile a l'autre. Ils rendaient en
 *    Bricolage, une proportionnelle : le « 1 » n'y a pas la chasse du « 0 »,
 *    donc les quatre chiffres ne s'alignaient pas et dansaient quand ils
 *    changeaient. `tabular-nums` par-dessus le mono : la regle vaut aussi
 *    entre deux etats du meme compteur, pas seulement entre deux tuiles.
 *
 * 2. « LE CHIFFRE EN HAUT, L'INTITULE EN DESSOUS ». DESIGN.md declare
 *    l'inversion deliberee, et c'est bien le chiffre qu'on compare : il doit
 *    rester sur la meme ligne quelle que soit la longueur de l'intitule. Or
 *    « Paniers non validés » passe sur deux lignes a 360 px, et les quatre
 *    nombres se decalaient.
 *
 * `flex-col-reverse` fait l'inversion A L'ECRAN SEULEMENT : le `dl` garde son
 * ordre `dt` puis `dd`, qui est celui qu'un lecteur d'ecran doit entendre —
 * l'intitule avant sa valeur. Inverser la source aurait corrige l'oeil en
 * cassant l'oreille.
 *
 * `font-bold` et non `font-black` : 700 est la graisse que DESIGN.md donne au
 * role `donnee`, et desormais la plus haute face mono reellement chargee.
 */
function Compteur({ libelle, valeur }: { libelle: string; valeur: number }) {
  // `justify-end` : en `col-reverse`, le debut de l'axe est EN BAS. Sans lui,
  // les tuiles se tassaient vers le bas de leur cellule de grille, et « 2 » se
  // retrouvait 16 px sous « 12 » des que l'intitule voisin passait sur deux
  // lignes — ce que le renversement etait justement cense empecher.
  return (
    <div className="flex flex-col-reverse justify-end">
      <dt className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-chaux-600">
        {libelle}
      </dt>
      <dd className="font-mono text-3xl font-bold leading-none tracking-[-0.01em] tabular-nums text-nuit-900">
        {valeur}
      </dd>
    </div>
  );
}

function ApresEffacement({ etat }: { etat: { complet: boolean; bilan: Bilan } }) {
  const { bilan, complet } = etat;
  return (
    <section className="mt-8 border border-accent-200 bg-accent-50 p-5">
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-[-0.01em] text-nuit-900">
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
