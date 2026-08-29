'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { fetchDashboard } from '@/lib/apiClient';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { classesBouton } from '@/components/ui/Bouton';
import { TONS, type Ton } from '@/components/ui/Etat';

/**
 * Le branchement d'une boutique, en cinq etapes.
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
  children,
}: {
  /** Absent = bloc facultatif, hors de la sequence annoncee. */
  rang?: number;
  titre: string;
  aide: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow">
      {/* Le rang est en indigo, pas en bissap : numeroter est un geste de
          structure, et le bissap se garde pour l'unique action de la page.
          Cinq numeros en bissap contre un bouton, et c'est le bouton qu'on ne
          voit plus. */}
      <div className="flex items-baseline gap-3">
        {rang === undefined ? (
          <span className="shrink-0 border border-chaux-300 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-chaux-600">
            Facultatif
          </span>
        ) : (
          <span className="w-6 shrink-0 font-mono text-2xl font-bold leading-none tabular-nums text-nuit-900">
            {rang}
          </span>
        )}
        <h2 className="font-display text-xl font-bold text-nuit-900">{titre}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-chaux-600">{aide}</p>
      <div className="mt-5 space-y-3">{children}</div>
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
 * (« 2250759486701 ») : au gris par defaut du navigateur il tombe sous le
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
  const [message, setMessage] = useState<{ ton: TonMessage; texte: string } | null>(null);
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
  const annoncer = useCallback((ton: TonMessage, texte: string, duree = 5000) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    setMessage({ ton, texte });
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

  const enregistrer = async (champ: string, valeur: string) => {
    annoncer('attente', 'Enregistrement…');
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
        annoncer('ok', j?.faits?.length ? j.faits.join(' · ') : 'Enregistré');
      } else {
        annoncer('erreur', j?.error || "L'enregistrement a échoué.");
      }
    } catch {
      annoncer('erreur', "L'enregistrement a échoué. Réessayez.");
    }
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

  const brancherWhatsApp = useCallback(async () => {
    if (!boutiqueId || brancheEnCours) return;
    setBrancheEnCours(true);
    annoncer('attente', 'Ouverture de votre ligne WhatsApp…');
    try {
      const r = await fetchDashboard(
        avecBoutique('/api/dashboard/canaux/whatsapp', boutiqueId),
        { method: 'POST' },
      );
      const j = await r.json().catch(() => null);

      if (!r.ok) {
        annoncer('erreur', j?.message || 'La ligne n’a pas pu être ouverte. Réessayez.');
        return;
      }

      setEtatWa(j?.etat ?? 'inconnu');
      setQrWa(j?.qr ?? null);
      annoncer(
        j?.etat === 'connectee' ? 'ok' : 'attente',
        j?.etat === 'connectee'
          ? 'Votre WhatsApp est relié.'
          : 'Scannez le code depuis WhatsApp, menu « Appareils connectés ».',
      );
    } catch {
      annoncer('erreur', 'Connexion impossible. Vérifiez que vous êtes connecté à Internet.');
    } finally {
      setBrancheEnCours(false);
    }
  }, [boutiqueId, brancheEnCours, annoncer]);

  const tester = async () => {
    setEnTest(true);
    annoncer('attente', 'Vérification…');
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
        );
        return;
      }

      setDiagnostic(j as Diagnostic);
      if ((j as Diagnostic)?.pret) {
        annoncer('ok', 'Votre boutique est branchée.', 6000);
      } else {
        annoncer('erreur', 'Votre boutique n’est pas encore prête. Le détail est ci-dessous.');
      }
    } catch {
      annoncer('erreur', 'Connexion impossible.');
    } finally {
      setEnTest(false);
    }
  };

  /** Un secret ne se reaffiche pas : le champ se vide une fois envoye. */
  const enregistrerSecret = async (champ: string, e: React.FocusEvent<HTMLInputElement>) => {
    const valeur = e.target.value.trim();
    if (!valeur) return;
    e.target.value = '';
    await enregistrer(champ, valeur);
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
        {message && (
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
              aide="Le numéro auquel vos clients écrivent. Au format international, sans le plus — par exemple 2250759486701."
            >
              <input
                key={'tel' + (boutique.telephone || '')}
                defaultValue={boutique.telephone || ''}
                onBlur={(e) => enregistrer('telephone', e.target.value)}
                className={CHAMP}
                placeholder="2250759486701"
                aria-label="Numéro WhatsApp de la boutique"
              />
            </Etape>

            <Etape
              rang={2}
              titre="Vos comptes de messagerie"
              aide="Ce sont vos propres comptes qui parlent à vos clients. Tout ce que vous collez ici part dans un coffre chiffré : rien ne réapparaîtra sur cette page, et personne d'autre ne peut le lire."
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
                {etatWa === 'connectee' ? (
                  <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                    Votre numéro est relié. Vos clients peuvent vous écrire.
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                    Nous ouvrons la ligne, vous scannez le QR depuis WhatsApp —{' '}
                    <b className="font-semibold text-nuit-800">Appareils connectés</b>. Aucune clé à
                    manipuler.
                  </p>
                )}

                {qrWa && etatWa !== 'connectee' && (
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
                  <Voyant ton={boutique.whatsapp_connecte ? 'fait' : 'eteint'}>
                    {boutique.whatsapp_connecte ? 'numéro connecté' : 'pas encore connecté'}
                  </Voyant>
                  {boutique.whatsapp_connecte && (
                    <Voyant ton={boutique.whatsapp_webhook_protege ? 'fait' : 'eteint'}>
                      {boutique.whatsapp_webhook_protege
                        ? 'réception sécurisée'
                        : 'réception non sécurisée'}
                    </Voyant>
                  )}
                </span>

                {etatWa !== 'connectee' && (
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
                  onBlur={(e) => enregistrerSecret('telegram_bot_token', e)}
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
            >
              <input
                key={'tg' + (boutique.telegram_marchand || '')}
                defaultValue={boutique.telegram_marchand || ''}
                onBlur={(e) => enregistrer('telegram_marchand', e.target.value)}
                className={CHAMP}
                placeholder="1724402569"
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
            >
              <input
                key={'gr' + (boutique.groupe_livreurs || '')}
                defaultValue={boutique.groupe_livreurs || ''}
                onBlur={(e) => enregistrer('groupe_livreurs', e.target.value)}
                className={CHAMP}
                placeholder="-1004461402565"
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
                </div>
              )}
            </section>

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
