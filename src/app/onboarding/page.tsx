'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { fetchDashboard } from '@/lib/apiClient';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { classesBouton } from '@/components/ui/Bouton';
import { etatLivraisonOfferte, etatMinimum } from '@/lib/objectifsPanier';
import { boutiqueLivre } from '@/lib/boutiquePrete';
import { TONS, type Ton } from '@/components/ui/Etat';
import { normaliserTelephone } from '@/lib/telephone';

/**
 * Le branchement d'une boutique, en quatre etapes.
 *
 * La numerotation n'est pas un ornement : l'ordre porte une contrainte reelle.
 * On ne peut pas relever son identifiant Telegram avant d'avoir connecte son
 * bot, ni creer le groupe des livreurs avant que le bot existe. Chaque etape
 * suppose la precedente, et le chiffre le dit.
 */

type Boutique = {
  id: string;
  nom: string | null;
  telephone: string | null;
  telegram_marchand: string | null;
  groupe_livreurs: string | null;
  slug?: string | null;
  // Etat de branchement des canaux. Les jetons eux-memes ne sortent jamais du
  // serveur : la page ne sait que s'ils existent.
  whatsapp_connecte?: boolean;
  whatsapp_webhook_protege?: boolean;
  telegram_connecte?: boolean;
  telegram_webhook_branche?: boolean;
  // Les deux leviers commerciaux. Ils arrivent deja dans la fiche : la route
  // rend la ligne entiere moins les secrets. On ne les ECRIT pas ici.
  commande_minimum?: number | null;
  livraison_offerte_des?: number | null;
  mode_recuperation?: string | null;
};

/** Les trois issues d'un geste : en cours, abouti, echoue. */
type TonMessage = 'ok' | 'erreur' | 'attente';

/** Ce que rend /api/dashboard/boutique/diagnostic. */
type Controle = {
  cle: string;
  /** L'etape de CETTE page a reprendre, celle que cite le message. */
  etape: number;
  /**
   * Le rang correspondant dans `/aide/brancher`, qui n'est PAS le meme nombre :
   * cette page compte cinq etapes, le guide en compte huit. Passer l'un pour
   * l'autre envoyait « Voir l'etape 4 » -- le groupe des livreurs -- sur
   * « Connectez vos messageries ».
   */
  guide?: number;
  etat: 'ok' | 'echec' | 'avertissement';
  message: string;
};

type Diagnostic = { pret: boolean; controles: Controle[]; verifie_le: string };

/**
 * Le nom court de chaque controle.
 *
 * Le marchand lit un titre, puis une phrase. Le mot-cle technique (`cle`) ne
 * lui est jamais montre : il sert aux journaux et aux tests, pas a l'ecran.
 */
const LIBELLE: Record<string, string> = {
  numero: 'votre numéro',
  whatsapp: 'whatsapp',
  telegram_bot: 'votre bot',
  telegram_gerant: 'vos alertes',
  groupe: 'vos livreurs',
  webhook_whatsapp: 'liaison signée',
  catalogue: 'vos articles',
};

/** Le ton du systeme pour chaque verdict. Aucune teinte n'est choisie ici. */
const TON_VERDICT: Record<Controle['etat'], Ton> = {
  ok: 'fait',
  echec: 'urgent',
  avertissement: 'encours',
};

/**
 * Le carre du voyant, une teinte par ton.
 *
 * TONS ne porte que les classes de texte et de surface ; ce point-ci demande
 * une nuance pleine. Les cinq sont declarees ensemble pour qu'un ton ajoute au
 * systeme ne puisse pas arriver ici sans sa couleur.
 */
const POINT: Record<Ton, string> = {
  fait: 'bg-accent-500',
  eteint: 'bg-chaux-500',
  urgent: 'bg-bissap-500',
  encours: 'bg-mangue-500',
  neutre: 'bg-nuit-500',
};

/**
 * Un voyant, pas une phrase : l'etat se lit avant de se relire.
 *
 * Sa couleur vient de TONS, jamais d'une teinte recopiee. Recopiee, la valeur
 * finit par diverger de celle des etiquettes du tableau de bord, et deux verts
 * differents pour le meme fait valent moins qu'un seul.
 *
 * IL PREND UN TON, PAS UN BOOLEEN. Il n'en connaissait que deux — branche ou
 * pas — et le diagnostic en a trois : `fait` quand le canal repond, `urgent`
 * quand il faut agir, `encours` pour ce qui est commence sans etre fini. Un
 * catalogue vide a la fin du branchement n'est pas une panne, et le peindre en
 * rouge dirait le contraire.
 */
function Voyant({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] ${TONS[ton].texte}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 ${POINT[ton]}`} />
      {children}
    </span>
  );
}

/**
 * Une etape du branchement : son rang, son titre, ce qu'elle demande.
 *
 * SANS RANG, CE N'EST PAS UNE ETAPE. Le classeur Google portait le numero 5
 * sur 5, sous un titre annoncant « Cinq etapes, dans cet ordre » : un marchand
 * non technicien voyait un numero, le croyait obligatoire, et s'y bloquait au
 * dernier pas. On l'avait donc degrade en etape sans rang — puis retire tout a
 * fait le 28 aout 2026, quand plus rien ne lisait ces onglets.
 *
 * La regle qui reste vaut au-dela de ce cas : numeroter, c'est promettre que
 * la chose est requise. On ne numerote donc que ce qui l'est.
 */
function Etape({
  rang,
  titre,
  aide,
  etat,
  retour,
  children,
}: {
  /** Absent = bloc facultatif, hors de la sequence annoncee. */
  rang?: number;
  titre: string;
  aide: React.ReactNode;
  /**
   * OU EN EST CETTE ETAPE. Le marchand branche sa boutique en plusieurs fois,
   * debout, entre deux clients : en revenant sur la page, rien ne lui disait
   * laquelle des quatre etait faite — il fallait relire chaque champ. Le voyant
   * repond avant qu'il ait a chercher.
   */
  etat?: { ton: Ton; texte: string };
  /**
   * LA REPONSE A SON GESTE, LA OU IL L'A FAIT. « Enregistre » s'affichait en
   * haut de page : a l'etape 4, sur un telephone, c'etait trois ecrans plus
   * haut, hors de vue. Il quittait le champ sans savoir si c'etait parti.
   */
  retour?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={rang === undefined ? undefined : `etape-${rang}`}
      className="scroll-mt-4 border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow"
    >
      {/* Le rang est en indigo, pas en bissap : numeroter est un geste de
          structure, et le bissap se garde pour l'unique action de la page.
          Cinq numeros en bissap contre un bouton, et c'est le bouton qu'on ne
          voit plus. */}
      <div className="flex items-baseline gap-3">
        {rang === undefined ? (
          <span className="shrink-0 border border-chaux-300 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
            Facultatif
          </span>
        ) : (
          <span className="w-6 shrink-0 font-mono text-2xl font-bold leading-none tabular-nums text-nuit-900">
            {rang}
          </span>
        )}
        <h2 className="min-w-0 flex-1 font-display text-xl font-bold text-nuit-900">{titre}</h2>
        {etat && (
          <span className="shrink-0">
            <Voyant ton={etat.ton}>{etat.texte}</Voyant>
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-chaux-600">{aide}</p>
      <div className="mt-5 space-y-3">
        {children}
        {retour}
      </div>
    </section>
  );
}

/**
 * Le champ du branchement.
 *
 * Angle vif, comme tout ce que porte cette page : l'onboarding appartient au
 * monde de l'imprime, pas a celui de l'outil — meme silhouette que le guide
 * qu'il ouvre.
 *
 * `py-3` et non `py-2.5` : 44 px de haut, la cible se touche au pouce. Et le
 * placeholder est en chaux encre, parce qu'il porte le FORMAT attendu
 * (« 2250700000000 ») : au gris par defaut du navigateur il tombe sous le
 * seuil de contraste, et c'est justement ce qu'il faut pouvoir recopier.
 */
const CHAMP =
  'w-full border border-[var(--hairline)] bg-white px-3 py-3 text-sm ' +
  'placeholder:text-chaux-600 transition focus:border-nuit-400';

export default function OnboardingPage() {
  // La boutique du selecteur, et rien d'autre. Sans elle, la page branchait
  // « la premiere du registre » : le 19 aout, les reglages d'une nouvelle
  // enseigne sont partis chez une autre, deja en service.
  const { boutiqueId, pret } = useBoutique();
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [chargement, setChargement] = useState(true);
  // `ou` nomme l'endroit ou le message s'affiche : le rang d'une etape, ou
  // « test ». Absent, il concerne la page entiere et s'affiche en tete.
  const [message, setMessage] = useState<{ ton: TonMessage; texte: string; ou?: string } | null>(null);
  const [lienCopie, setLienCopie] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [enTest, setEnTest] = useState(false);

  // Un seul minuteur, tenu par une reference. Deux enregistrements rapproches
  // en posaient deux : celui du premier geste effacait le message du second
  // avant qu'on ait eu le temps de le lire.
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Annonce le resultat d'un geste.
   *
   * UNE ERREUR NE S'EFFACE PAS TOUTE SEULE, et c'est la regle entiere. Le
   * marchand branche sa boutique debout, entre deux clients : il quitte
   * l'ecran des yeux, et il revenait sur une page ou plus rien ne disait que
   * sa saisie n'etait pas partie — alors que le champ, lui, affichait
   * toujours ce qu'il venait de taper. Il croyait son numero enregistre.
   *
   * « Enregistrement… » ne s'efface pas non plus : il est toujours remplace
   * par son issue, et si la requete traine, le voir rester dit la verite
   * mieux que de le voir disparaitre.
   *
   * Seul un succes part tout seul. Il ne demande rien a personne.
   */
  const annoncer = useCallback((ton: TonMessage, texte: string, duree = 5000, ou?: string) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    setMessage({ ton, texte, ou });
    if (ton !== 'ok') return;
    minuteur.current = setTimeout(() => setMessage(null), duree);
  }, []);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  useEffect(() => {
    // Sans attendre le selecteur, la page chargerait « la boutique par defaut »
    // et l'on rebranche alors la mauvaise enseigne — c'est exactement ce qui
    // s'est produit le 19 aout.
    if (!pret) return;
    (async () => {
      try {
        const r = await fetchDashboard(avecBoutique('/api/onboarding', boutiqueId));
        if (r.ok) {
          setBoutique(await r.json());
        } else {
          const j = await r.json().catch(() => null);
          annoncer('erreur', j?.error || `Erreur ${r.status}`);
        }
      } catch {
        annoncer('erreur', 'Connexion impossible. Vérifiez que vous êtes connecté.');
      }
      setChargement(false);
    })();
  }, [pret, boutiqueId, annoncer]);

  const enregistrer = async (champ: string, valeur: string, ou?: string) => {
    // QUITTER UN CHAMP SANS Y TOUCHER N'EST PAS UN ENREGISTREMENT. Chaque
    // sortie de champ repartait au serveur et affichait « Enregistre » : en
    // faisant defiler la page du pouce, le marchand voyait confirmer des
    // gestes qu'il n'avait pas faits, et n'accordait plus de poids au message.
    const actuelle = (boutique as Record<string, unknown> | null)?.[champ];
    if (typeof actuelle !== 'boolean' && valeur.trim() === String(actuelle ?? '').trim()) return;

    annoncer('attente', 'Enregistrement…', 5000, ou);
    try {
      const r = await fetchDashboard(avecBoutique('/api/onboarding', boutiqueId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [champ]: valeur }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok) {
        // La fiche renvoyee fait foi : elle porte l'etat de branchement
        // recalcule, que la page ne saurait pas deviner seule.
        setBoutique((b) => (j?.boutique ? j.boutique : b ? { ...b, [champ]: valeur } : b));
        annoncer('ok', j?.faits?.length ? j.faits.join(' · ') : 'Enregistré', 5000, ou);
      } else {
        annoncer('erreur', j?.error || "L'enregistrement a échoué.", 5000, ou);
      }
    } catch {
      annoncer('erreur', "L'enregistrement a échoué. Réessayez.", 5000, ou);
    }
  };

  /**
   * LE NUMERO SE TAPE COMME ON LE DONNE.
   *
   * L'etape reclamait « le format international, sans le plus —
   * 2250700000000 » : treize chiffres a recomposer de tete par quelqu'un qui
   * dit son numero « 07 00 00 00 00 » dix fois par jour. C'est le tout premier
   * champ du branchement, et il commencait par un exercice.
   *
   * On accepte donc ce qu'il tape, et c'est NOUS qui ecrivons la forme
   * internationale : la vitrine en fait un lien wa.me, qui ne marche qu'avec
   * l'indicatif. Un numero qui n'est pas ivoirien passe tel quel s'il porte
   * deja son indicatif — on ne sait pas le verifier, on ne le refuse pas.
   */
  const enregistrerNumero = async (saisie: string) => {
    const chiffres = saisie.replace(/\D/g, '');
    if (!chiffres) return;
    const n = normaliserTelephone(saisie);
    if (n.ok) return enregistrer('telephone', n.international, '1');
    const etranger = chiffres.length >= 10 && !chiffres.startsWith('0') && !chiffres.startsWith('225');
    if (etranger) return enregistrer('telephone', chiffres, '1');
    annoncer('erreur', n.erreur, 5000, '1');
  };

  /**
   * Eprouve le branchement, et nomme l'etape en cause.
   *
   * ELLE NE PASSE AUCUNE COMMANDE. Deux messages d'essai partent — sur le
   * numero de la boutique et sur le Telegram du gerant — et le groupe des
   * livreurs est verifie sans qu'aucun message n'y soit envoye. Un livreur
   * derange pour une course qui n'existe pas apprend a ignorer le groupe.
   *
   * Le resultat vit dans son propre etat, pas dans le bandeau : le bandeau
   * s'efface quand il annonce un succes, et la liste, elle, doit rester lisible
   * le temps que le marchand reprenne l'etape qu'elle designe.
   */
  /**
   * LE BRANCHEMENT WHATSAPP, VU DE L'ECRAN.
   *
   * Trois etats seulement, parce que le marchand n'a que trois choses a
   * comprendre : ce n'est pas branche, voici le code a scanner, c'est fait.
   * Le vocabulaire du fournisseur — `need_scan`, `disconnected` — ne lui dit
   * rien et ne monte pas jusqu'ici.
   */
  const [etatWa, setEtatWa] = useState<'absente' | 'a_scanner' | 'connectee' | 'inconnu'>('absente');
  const [qrWa, setQrWa] = useState<string | null>(null);
  const [brancheEnCours, setBrancheEnCours] = useState(false);

  const lireEtatWa = useCallback(async () => {
    if (!boutiqueId) return 'absente' as const;
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/canaux/whatsapp', boutiqueId));
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) return 'inconnu' as const;
      setEtatWa(j.etat ?? 'inconnu');
      setQrWa(j.qr ?? null);
      return (j.etat ?? 'inconnu') as 'absente' | 'a_scanner' | 'connectee' | 'inconnu';
    } catch {
      // Une lecture ratee n'est pas un branchement rate : on ne touche a rien.
      return 'inconnu' as const;
    }
  }, [boutiqueId]);

  /**
   * LA RELANCE S'ARRETE TOUTE SEULE, ET C'EST LE POINT.
   *
   * Elle ne tourne QUE pendant qu'un code est affiche. Une boucle qui
   * continuerait apres la connexion appellerait wasender toutes les cinq
   * secondes, pour toujours, sur chaque onglet laisse ouvert — et personne ne
   * s'en apercevrait avant la facture.
   */
  useEffect(() => {
    if (etatWa !== 'a_scanner') return;
    const minuteur = setInterval(() => { void lireEtatWa(); }, 5000);
    return () => clearInterval(minuteur);
  }, [etatWa, lireEtatWa]);

  /**
   * UNE LECTURE A L'ARRIVEE, UNE SEULE.
   *
   * L'etat WhatsApp n'etait lu qu'apres un clic. Un marchand deja relie qui
   * revenait sur la page y lisait « Nous ouvrons la ligne, vous scannez le
   * QR » au-dessus du bouton « Connecter mon WhatsApp » : l'ecran lui
   * proposait de refaire ce qui marchait. Ce n'est pas la boucle du dessus —
   * elle ne tourne que pendant qu'un code est affiche — c'est un seul appel,
   * au chargement.
   */
  useEffect(() => {
    if (!pret || !boutiqueId) return;
    (async () => {
      await lireEtatWa();
    })();
  }, [pret, boutiqueId, lireEtatWa]);

  const brancherWhatsApp = useCallback(async () => {
    if (!boutiqueId || brancheEnCours) return;
    setBrancheEnCours(true);
    annoncer('attente', 'Ouverture de votre ligne WhatsApp…', 5000, '2');
    try {
      const r = await fetchDashboard(
        avecBoutique('/api/dashboard/canaux/whatsapp', boutiqueId),
        { method: 'POST' },
      );
      const j = await r.json().catch(() => null);

      if (!r.ok) {
        annoncer('erreur', j?.message || 'La ligne n’a pas pu être ouverte. Réessayez.', 5000, '2');
        return;
      }

      setEtatWa(j?.etat ?? 'inconnu');
      setQrWa(j?.qr ?? null);
      annoncer(
        j?.etat === 'connectee' ? 'ok' : 'attente',
        j?.etat === 'connectee'
          ? 'Votre WhatsApp est relié.'
          : 'Scannez le code depuis WhatsApp, menu « Appareils connectés ».',
        5000,
        '2',
      );
    } catch {
      annoncer('erreur', 'Connexion impossible. Vérifiez que vous êtes connecté à Internet.', 5000, '2');
    } finally {
      setBrancheEnCours(false);
    }
  }, [boutiqueId, brancheEnCours, annoncer]);

  const tester = async () => {
    setEnTest(true);
    annoncer('attente', 'Vérification…', 5000, 'test');
    try {
      const r = await fetchDashboard(
        avecBoutique('/api/dashboard/boutique/diagnostic', boutiqueId),
        { method: 'POST' },
      );
      const j = await r.json().catch(() => null);

      if (!r.ok) {
        // 429 porte le delai dans son en-tete : le dire vaut mieux que de
        // laisser le marchand cliquer a nouveau pour rien.
        const attendre = Number(r.headers.get('Retry-After') ?? 0);
        annoncer(
          'erreur',
          attendre > 0
            ? `Vous venez de tester votre boutique. Réessayez dans ${Math.ceil(attendre / 60)} min.`
            : j?.error || 'La vérification a échoué.',
          5000,
          'test',
        );
        return;
      }

      setDiagnostic(j as Diagnostic);
      // LE VERDICT SE DIT UNE FOIS. Le bandeau annoncait « Votre boutique est
      // branchee » juste au-dessus du titre qui le dit deja, a deux lignes
      // d'ecart : depuis que le message s'affiche a cote du bouton, les deux
      // se touchaient. Le titre et sa liste restent ; « Verification… » s'efface.
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = null;
      setMessage(null);
    } catch {
      annoncer('erreur', 'Connexion impossible.', 5000, 'test');
    } finally {
      setEnTest(false);
    }
  };

  /** Un secret ne se reaffiche pas : le champ se vide une fois envoye. */
  const enregistrerSecret = async (champ: string, e: React.FocusEvent<HTMLInputElement>, ou?: string) => {
    const valeur = e.target.value.trim();
    if (!valeur) return;
    e.target.value = '';
    await enregistrer(champ, valeur, ou);
  };

  if (chargement) {
    return (
      <main id="contenu" className="flex min-h-screen items-center justify-center bg-chaux-100">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">Chargement…</p>
      </main>
    );
  }

  const tons = {
    ok: 'border-accent-200 bg-accent-50 text-accent-800',
    erreur: 'border-bissap-200 bg-bissap-50 text-bissap-700',
    attente: 'border-[var(--hairline)] bg-chaux-50 text-chaux-600',
  };

  /** Le message d'un geste, rendu a l'endroit `ou` — et nulle part ailleurs. */
  const retour = (ou: string) =>
    message?.ou === ou ? (
      <p role="status" className={`border px-4 py-3 text-sm ${tons[message.ton]}`}>
        {message.texte}
      </p>
    ) : null;

  /**
   * OU EN EST LE BRANCHEMENT, LU SUR LA FICHE.
   *
   * Rien n'est memorise a part : chaque etape est « faite » parce que ce
   * qu'elle demande EXISTE. Un compteur tenu a cote finirait par dire quatre
   * sur quatre a une boutique dont le bot a ete debranche depuis.
   *
   * WhatsApp se lit sur la ligne elle-meme (`etatWa`), pas sur la presence
   * d'une cle : la cle nait a l'ouverture de la ligne, AVANT que le code soit
   * scanne. Si la ligne ne repond pas, on s'en remet a la fiche plutot que
   * d'afficher « a faire » a quelqu'un dont le WhatsApp marche.
   */
  const waRelie = etatWa === 'connectee' || (etatWa === 'inconnu' && !!boutique?.whatsapp_connecte);
  const botBranche = !!boutique?.telegram_webhook_branche;
  const faites = [
    !!boutique?.telephone,
    waRelie && botBranche,
    !!boutique?.telegram_marchand,
    !!boutique?.groupe_livreurs,
  ];
  const nbFaites = faites.filter(Boolean).length;
  const prochaine = faites.indexOf(false) + 1; // 0 = tout est fait
  const FAIT = { ton: 'fait', texte: 'fait' } as const;
  const A_FAIRE = { ton: 'eteint', texte: 'à faire' } as const;
  const etatEtape = (i: number) => (faites[i] ? FAIT : A_FAIRE);

  const lienVitrine =
    boutique?.slug && typeof window !== 'undefined'
      ? `${window.location.origin}/boutiques/${boutique.slug}`
      : '';

  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(lienVitrine);
      setLienCopie(true);
      setTimeout(() => setLienCopie(false), 3000);
    } catch {
      // Presse-papiers refuse (navigateur ancien, page non securisee) : le
      // lien reste affiche et selectionnable, on ne pretend pas l'avoir copie.
      setLienCopie(false);
    }
  };

  return (
    <main id="contenu" className="min-h-screen bg-chaux-100 pb-20">
      <header className="indigo-weave relative bg-nuit-900 px-5 pb-10 pt-8 text-chaux-50 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-black leading-[1.05] sm:text-5xl">
            {boutique?.nom || 'Votre boutique'}
          </h1>
          <p className="mt-3 max-w-lg text-sm text-chaux-200">
            Quatre étapes, dans cet ordre. Vos clients écriront à votre propre numéro, et vos
            livreurs recevront les courses par votre propre bot.
          </p>

          {/* OU IL EN EST, AVANT QU'IL AIT A CHERCHER.
              Le branchement se fait en plusieurs visites : on cree le bot un
              soir, le groupe des livreurs le lendemain. En revenant, la page
              s'ouvrait sur la meme phrase qu'au premier jour. Quatre cases,
              comme sur un bon qu'on remplit — et le lien mene droit a celle
              qui attend, plutot que de laisser retrouver sa place au pouce. */}
          {boutique && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex gap-1.5" aria-hidden>
                {faites.map((f, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 border ${
                      f ? 'border-accent-400 bg-accent-400' : 'border-chaux-50/40'
                    }`}
                  />
                ))}
              </span>
              <p className="text-sm text-chaux-50">
                {nbFaites === 4 ? (
                  'Les quatre étapes sont faites. Il reste à tester.'
                ) : (
                  <>
                    <span className="font-semibold tabular-nums">{nbFaites} sur 4</span>{' '}
                    {nbFaites > 1 ? 'faites' : 'faite'}.{' '}
                    <a
                      href={`#etape-${prochaine}`}
                      className="font-semibold underline decoration-chaux-50/40 underline-offset-4 transition hover:decoration-chaux-50"
                    >
                      {nbFaites === 0 ? 'Commencer par la 1' : `Reprendre à la ${prochaine}`}
                    </a>
                  </>
                )}
              </p>
            </div>
          )}
          {/* Le guide s'ouvre a cote, pas a la place : le marchand a les mains
              dans les champs, il ne doit pas perdre sa page pour lire comment
              les remplir. */}
          <a
            href="/aide/brancher"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center gap-2 border border-chaux-50/30 px-4 font-mono text-xs uppercase tracking-[0.16em] text-chaux-50 transition hover:border-mangue-300 hover:text-mangue-200"
          >
            Lire le guide pas à pas
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <div className="perf-line absolute inset-x-0 bottom-0 text-chaux-50" aria-hidden />
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        {message && !message.ou && (
          <p role="status" className={`mb-6 border px-4 py-3 text-sm ${tons[message.ton]}`}>
            {message.texte}
          </p>
        )}

        {!boutique && !message && (
          <p className="mb-6 border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
            Boutique introuvable. Vérifiez que vous êtes connecté au bon compte.
          </p>
        )}

        {boutique && (
          <div className="space-y-5">
            <Etape
              rang={1}
              titre="Votre numéro WhatsApp"
              aide="Le numéro auquel vos clients écrivent. Tapez-le comme vous le donnez : nous ajoutons l’indicatif 225."
              etat={etatEtape(0)}
              retour={retour('1')}
            >
              <input
                key={'tel' + (boutique.telephone || '')}
                defaultValue={boutique.telephone || ''}
                onBlur={(e) => enregistrerNumero(e.target.value)}
                className={`${CHAMP} font-mono`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="07 00 00 00 00"
                aria-label="Numéro WhatsApp de la boutique"
              />
            </Etape>

            <Etape
              rang={2}
              titre="Vos comptes de messagerie"
              aide="Ce sont vos propres comptes qui parlent à vos clients. Tout ce que vous collez ici part dans un coffre chiffré : rien ne réapparaîtra sur cette page, et personne d'autre ne peut le lire."
              etat={
                waRelie && botBranche
                  ? FAIT
                  : waRelie || botBranche
                    ? { ton: 'encours', texte: '1 sur 2' }
                    : A_FAIRE
              }
              retour={retour('2')}
            >
              <div className="border border-[var(--hairline)] bg-white p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-nuit-900">
                  WhatsApp
                </p>

                {/*
                  LE QR REMPLACE « ECRIVEZ-NOUS ».
                  Le branchement demandait cinq manoeuvres a l exploitant, pour
                  chaque marchand. La creation de session rend elle-meme la cle
                  d envoi et le secret d entree : il ne reste qu un QR a
                  scanner, et le marchand n attend plus personne.
                */}
                {waRelie ? (
                  <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                    Votre numéro est relié. Vos clients peuvent vous écrire.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                      Nous ouvrons la ligne, vous scannez le QR depuis WhatsApp —{' '}
                      <b className="font-semibold text-nuit-800">Appareils connectés</b>. Aucune clé à
                      manipuler.
                    </p>
                    {/* CE QU'IL FAUT SAVOIR AVANT D'APPUYER.
                        Le code se scanne AVEC le telephone qui porte le
                        WhatsApp — donc pas sur ce telephone-la. Le marchand
                        n'a souvent qu'un appareil : il ouvrait la ligne,
                        voyait le code sur l'ecran meme qui devait le lire, et
                        restait devant sans comprendre. Le dire ici lui evite
                        de decouvrir l'impasse le code a la main. */}
                    <p className="mt-2 text-sm leading-relaxed text-nuit-800">
                      Il vous faut un second écran pour afficher le code : ouvrez cette page sur un
                      autre téléphone ou sur un ordinateur, puis scannez avec le téléphone de la
                      boutique.
                    </p>
                  </>
                )}

                {qrWa && !waRelie && (
                  <div className="mt-4">
                    {/*
                      L image vient de wasender en `data:` : elle ne part sur
                      aucun reseau tiers, et la CSP n a donc rien a autoriser.
                      `alt` decrit l ACTION, pas l image — « QR code » ne dit
                      rien a qui ne le voit pas.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrWa}
                      alt="Code à scanner depuis WhatsApp, menu Appareils connectés"
                      className="h-48 w-48 border border-[var(--hairline)] bg-white p-2"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-chaux-600">
                      Le code change toutes les quelques secondes. Gardez cette page ouverte : elle
                      passe au vert dès que c’est fait.
                    </p>
                  </div>
                )}

                <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {/* LE VOYANT DIT CE QUE DIT LA LIGNE. Il lisait la presence
                      d'une cle, qui nait a l'ouverture de la ligne : il
                      passait au vert AVANT le scan, et restait gris apres,
                      sous une phrase qui disait le contraire. */}
                  <Voyant ton={waRelie ? 'fait' : etatWa === 'a_scanner' ? 'encours' : 'eteint'}>
                    {waRelie
                      ? 'numéro connecté'
                      : etatWa === 'a_scanner'
                        ? 'en attente du scan'
                        : 'pas encore connecté'}
                  </Voyant>
                  {waRelie && boutique.whatsapp_connecte && (
                    <Voyant ton={boutique.whatsapp_webhook_protege ? 'fait' : 'eteint'}>
                      {boutique.whatsapp_webhook_protege
                        ? 'réception sécurisée'
                        : 'réception non sécurisée'}
                    </Voyant>
                  )}
                </span>

                {!waRelie && (
                  <button
                    type="button"
                    onClick={brancherWhatsApp}
                    disabled={brancheEnCours}
                    className={`mt-3 ${classesBouton('calme', 'sm')}`}
                  >
                    {brancheEnCours
                      ? 'Ouverture de la ligne…'
                      : qrWa
                        ? 'Afficher un nouveau code'
                        : 'Connecter mon WhatsApp'}
                  </button>
                )}
              </div>
              <div className="border border-[var(--hairline)] bg-white p-4">
                <label
                  htmlFor="jeton-telegram"
                  className="font-mono text-xs uppercase tracking-[0.16em] text-nuit-900"
                >
                  Jeton du bot Telegram
                </label>
                <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                  Créez votre bot avec <b className="font-semibold text-nuit-800">@BotFather</b> sur
                  Telegram et collez son jeton. Nous le branchons pour vous.
                </p>
                <input
                  id="jeton-telegram"
                  type="password"
                  autoComplete="off"
                  onBlur={(e) => enregistrerSecret('telegram_bot_token', e, '2')}
                  className={`${CHAMP} mt-3`}
                  placeholder={
                    boutique.telegram_connecte ? '•••••• déjà connecté' : 'Collez le jeton ici'
                  }
                />
                <p className="mt-3">
                  <Voyant ton={boutique.telegram_webhook_branche ? 'fait' : 'eteint'}>
                    {boutique.telegram_webhook_branche ? 'bot branché' : 'bot pas encore branché'}
                  </Voyant>
                </p>
              </div>
            </Etape>

            <Etape
              rang={3}
              titre="Votre identifiant Telegram"
              aide={
                <>
                  {/* L'espace est explicite : quand le texte qui suit la balise
                      passe a la ligne, JSX rogne le blanc de debut de ligne et
                      la phrase se lisait « Écrivez IDen privé ». */}
                  Là où vous recevrez vos alertes. Écrivez <code className="font-mono">ID</code>{' '}
                  en privé à votre bot, puis recopiez le numéro qu&apos;il répond.
                </>
              }
              etat={etatEtape(2)}
              retour={retour('3')}
            >
              <input
                key={'tg' + (boutique.telegram_marchand || '')}
                defaultValue={boutique.telegram_marchand || ''}
                onBlur={(e) => enregistrer('telegram_marchand', e.target.value, '3')}
                className={CHAMP}
                placeholder="123456789"
                aria-label="Identifiant Telegram du gérant"
              />
            </Etape>

            <Etape
              rang={4}
              titre="Le groupe de vos livreurs"
              aide={
                <>
                  Créez le groupe sur Telegram, ajoutez votre bot comme administrateur, puis
                  envoyez <code className="font-mono">ID</code> dans le groupe.
                </>
              }
              etat={etatEtape(3)}
              retour={retour('4')}
            >
              <input
                key={'gr' + (boutique.groupe_livreurs || '')}
                defaultValue={boutique.groupe_livreurs || ''}
                onBlur={(e) => enregistrer('groupe_livreurs', e.target.value, '4')}
                className={CHAMP}
                placeholder="-1001234567890"
                aria-label="Identifiant du groupe des livreurs"
              />
            </Etape>

            {/* L'ETAPE « VOS FEUILLES GOOGLE » EST RETIREE — 28 aout 2026.
                Elle demandait au marchand trois noms d'onglets et lui offrait
                un bouton pour les creer. Plus rien ne lit ces onglets : ni
                l'assistante, decouplee depuis le 19 aout, ni les 23 workflows,
                debranches le 27. On reclamait donc un renseignement dont on ne
                faisait plus rien — le pire de ce qu'un branchement peut faire a
                quelqu'un qui n'est pas technicien. */}

            {/* LE TEST N'EST PAS UNE SIXIEME ETAPE : il ne demande rien a
                remplir, il verifie les cinq precedentes. Il porte donc un
                encadre, pas un rang. */}
            <section className="border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow">
              <h2 className="font-display text-xl font-bold text-nuit-900">Tester ma boutique</h2>
              <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                Nous écrivons sur votre WhatsApp et sur votre Telegram pour vérifier que vos
                canaux répondent, et nous vérifions votre groupe de livreurs sans rien y envoyer.
                Aucune commande n’est créée, et vos livreurs ne reçoivent rien.
              </p>

              <button
                type="button"
                onClick={tester}
                disabled={enTest}
                className={`${classesBouton(
                  diagnostic?.pret ? 'calme' : 'action',
                  'md',
                  'carree',
                )} mt-5 disabled:opacity-60`}
              >
                {enTest ? 'Vérification…' : diagnostic ? 'Tester à nouveau' : 'Tester ma boutique'}
              </button>

              {message?.ou === 'test' && <div className="mt-4">{retour('test')}</div>}

              {diagnostic && (
                <div className="mt-6">
                  {/* UN SUCCES SE LIT COMME UN SUCCES. Un decompte
                      « 5 controles sur 7 » transformerait un branchement fini
                      en bulletin de notes, alors que les deux avertissements
                      possibles ne sont pas des fautes du marchand. */}
                  <p className="font-display text-lg font-bold text-nuit-900">
                    {diagnostic.pret
                      ? 'Votre boutique est branchée.'
                      : 'Il reste une étape à reprendre.'}
                  </p>

                  <ul className="mt-4 flex flex-col divide-y divide-chaux-200 border-y border-chaux-200">
                    {diagnostic.controles.map((c) => (
                      <li key={c.cle} className="py-3">
                        <Voyant ton={TON_VERDICT[c.etat]}>{LIBELLE[c.cle] ?? c.cle}</Voyant>
                        <p className="mt-1 max-w-[62ch] text-sm leading-snug text-chaux-600">
                          {c.message}
                          {/* Le renvoi fait ce que le texte promet : il mene a
                              l'etape en cause, dans le guide, plutot que de
                              laisser le marchand la chercher. */}
                          {c.etat === 'echec' && (c.guide ?? 0) > 0 && (
                            <>
                              {' '}
                              <a
                                href={`/aide/brancher#etape-${c.guide}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-nuit-700 underline decoration-nuit-200 underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-nuit-700"
                              >
                                {/* Plus de numero dans le libelle : celui du
                                    message designe /onboarding, celui du lien
                                    designe le guide, et les afficher tous les
                                    deux ne ferait qu embrouiller. */}
                                Voir dans le guide
                              </a>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>

                  {/* ET MAINTENANT ? — CE QUE LE BRANCHEMENT NE DISAIT PAS.
                      Le parcours s'arretait sur « Votre boutique est
                      branchee » et un bouton vers le tableau de bord. Or une
                      boutique branchee ne vend rien : il lui faut des articles,
                      et des clients qui connaissent son adresse. Le marchand
                      avait fini le plus dur et ne savait pas quoi faire de sa
                      reussite.

                      Deux gestes, dans l'ordre ou ils servent : remplir la
                      carte, puis donner le lien. Le lien est celui qu'il
                      collera dans son statut WhatsApp — on le lui met dans la
                      main plutot que de le laisser le recomposer.

                      Tout reste en `calme` : l'unique `action` de l'ecran est
                      le bouton du bas, et il ne change pas de place. */}
                  {diagnostic.pret && (
                    <div className="mt-6 border border-[var(--hairline)] bg-white p-4">
                      <p className="font-display text-base font-bold text-nuit-900">
                        Il reste deux gestes pour recevoir une commande.
                      </p>
                      <ol className="mt-3 space-y-4 text-sm leading-relaxed text-nuit-800">
                        <li>
                          <p>
                            <span className="font-mono font-bold">1.</span> Mettez vos articles en
                            ligne, avec leur prix.
                          </p>
                          <Link
                            href="/dashboard/products"
                            className={`mt-2 ${classesBouton('calme', 'sm', 'carree')}`}
                          >
                            Ajouter mes articles
                          </Link>
                        </li>
                        {lienVitrine && (
                          <li>
                            <p>
                              <span className="font-mono font-bold">2.</span> Donnez l’adresse de
                              votre boutique à vos clients : dans votre statut WhatsApp, sur votre
                              page, sur votre devanture.
                            </p>
                            <p className="mt-2 break-all border border-dashed border-chaux-300 bg-chaux-50 px-3 py-2 font-mono text-sm text-nuit-900">
                              {lienVitrine}
                            </p>
                            <button
                              type="button"
                              onClick={copierLien}
                              className={`mt-2 ${classesBouton('calme', 'sm', 'carree')}`}
                            >
                              {lienCopie ? 'Adresse copiée' : 'Copier l’adresse'}
                            </button>
                            <span role="status" className="sr-only">
                              {lienCopie ? 'Adresse copiée.' : ''}
                            </span>
                          </li>
                        )}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* CE BLOC N'A PAS DE RANG, ET C'EST LE POINT.

                Numeroter, c'est promettre que la chose est requise. Une
                boutique sans minimum et sans seuil de livraison offerte est
                parfaitement complete — `vitrineComplete` les exclut d'ailleurs
                a dessein, parce qu'un indicateur qui reclame tout ne se lit
                plus. On les NOMME, on ne les impose pas.

                POURQUOI IL EXISTE. Le 3 septembre 2026, ce parcours ne parlait
                jamais de ces deux reglages : un marchand qui le terminait avait
                une boutique qui marche, sans levier, et RIEN ne l'avait invite
                a y penser. Le seuil de livraison offerte est le levier le plus
                fiable du commerce pour faire monter un panier ; le laisser
                dormir n'est pas neutre.

                POURQUOI IL N'ECRIT RIEN. `/dashboard/ma-boutique` regle deja
                ces deux colonnes, avec trois choix explicites et
                l'avertissement sur qui regle le livreur. Poser ici un second
                formulaire rejouerait ce que les PR #151 et #154 ont retire :
                la meme question sur deux ecrans. Un seul ecran ecrit, celui-ci
                montre l'etat et mene au bon endroit.

                IL RESTE EN `calme`. Un seul `action` a l'ecran a tout instant,
                et c'est le bouton du bas. */}
            <Etape
              titre="Faire monter le panier"
              aide={
                <>
                  Deux réglages facultatifs. Vos clients les voient pendant qu’ils
                  choisissent : « il vous manque 500 FCFA pour la livraison offerte »
                  s’affiche dans leur panier, avant qu’ils renoncent.
                </>
              }
            >
              <dl className="divide-y divide-[var(--hairline)] border border-[var(--hairline)] bg-white">
                {[
                  /* ON NE RECLAME PAS A UNE BOUTIQUE DE RETRAIT UN SEUIL DE
                     LIVRAISON QU'ELLE N'AURA JAMAIS. Meme soin que la vitrine
                     et que l'ecran de reglages, qui masquent la question — et
                     meme fonction, pour que les trois ne puissent pas diverger.
                     Son bloc n'existe d'ailleurs pas dans Ma boutique : le lien
                     tomberait dans le vide. */
                  ...(boutiqueLivre(boutique.mode_recuperation)
                    ? [{
                      cle: 'livraison',
                      question: 'À partir de quel montant offrez-vous la livraison ?',
                      etat: etatLivraisonOfferte(boutique.livraison_offerte_des),
                    }]
                    : []),
                  {
                    cle: 'minimum',
                    question: 'À partir de quel montant prenez-vous une commande ?',
                    etat: etatMinimum(boutique.commande_minimum),
                  },
                ].map((l) => (
                  <div key={l.cle} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
                    {/* UNE LARGEUR PLANCHER, SINON LA QUESTION SE LIT UN MOT PAR LIGNE.
                        `min-w-0 flex-1` laissait la question retrecir jusqu'a
                        son mot le plus long des que la reponse etait longue
                        (« le livreur annonce ses frais ») : sur un telephone,
                        neuf lignes d'un mot. Avec un plancher, c'est la REPONSE
                        qui passe a la ligne. */}
                    <dt className="min-w-[12rem] flex-1 text-sm text-nuit-800">{l.question}</dt>
                    {/* L'ETAT SE LIT SANS COULEUR. Peindre « pas encore pose »
                        en rouge en ferait une faute, alors que c'est un choix
                        que le marchand a le droit de ne pas faire. Le pose est
                        seulement plus appuye que le vide. */}
                    <dd
                      className={
                        l.etat.pose
                          ? 'font-mono text-sm font-semibold text-nuit-900'
                          : 'font-mono text-sm text-chaux-600'
                      }
                    >
                      {l.etat.phrase}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap gap-3">
                {boutiqueLivre(boutique.mode_recuperation) && (
                  <Link
                    href="/dashboard/ma-boutique#frais-de-livraison"
                    className={classesBouton('calme', 'sm', 'carree')}
                  >
                    Régler la livraison offerte
                  </Link>
                )}
                <Link
                  href="/dashboard/ma-boutique#commande-minimum"
                  className={classesBouton('calme', 'sm', 'carree')}
                >
                  Régler le minimum
                </Link>
              </div>
            </Etape>

            {/* LA COULEUR FORTE DESIGNE CE QU'IL RESTE A FAIRE. Un seul
                `action` a l'ecran a tout instant : le test tant que la boutique
                n'est pas prouvee branchee, le tableau de bord une fois qu'elle
                l'est. */}
            <div className="pt-2">
              <Link
                href="/dashboard"
                className={classesBouton(diagnostic?.pret ? 'action' : 'calme', 'md', 'carree')}
              >
                Aller au tableau de bord
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
