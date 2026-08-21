'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { fetchDashboard } from '@/lib/apiClient';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { classesBouton } from '@/components/ui/Bouton';
import { TONS } from '@/components/ui/Etat';

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
  sheet_commandes: string | null;
  sheet_menu: string | null;
  sheet_notes: string | null;
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

/**
 * Un voyant, pas une phrase : l'etat se lit avant de se relire.
 *
 * Sa couleur vient de TONS, jamais d'une teinte recopiee : `fait` quand le
 * canal repond, `eteint` tant qu'il ne repond pas. Recopiee, la valeur finit
 * par diverger de celle des etiquettes du tableau de bord, et deux verts
 * differents pour le meme fait valent moins qu'un seul.
 */
function Voyant({ actif, quand, sinon }: { actif?: boolean; quand: string; sinon: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] ${
        TONS[actif ? 'fait' : 'eteint'].texte
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 ${actif ? 'bg-accent-500' : 'bg-chaux-500'}`}
      />
      {actif ? quand : sinon}
    </span>
  );
}

/** Une etape du branchement : son rang, son titre, ce qu'elle demande. */
function Etape({
  rang,
  titre,
  aide,
  children,
}: {
  rang: number;
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
        <span className="w-6 shrink-0 font-mono text-2xl font-bold leading-none tabular-nums text-nuit-900">
          {rang}
        </span>
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
   * Cree les onglets manquants de CETTE boutique.
   *
   * Une boutique creee depuis le tableau de bord ne passe jamais par le
   * provisionnement administrateur : elle n'a donc aucun onglet, et son
   * assistante ne peut ni lire une carte ni enregistrer une commande. Le
   * marchand n'a pas a savoir cela, encore moins a creer des onglets a la main.
   *
   * L'operation est sans risque : un onglet existant est laisse intact, en-tetes
   * comprises. On peut donc cliquer deux fois.
   */
  const preparerClasseur = async () => {
    annoncer('attente', 'Préparation du classeur…');
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/boutique/onglets', boutiqueId), {
        method: 'POST',
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        annoncer('erreur', j?.error || 'Préparation impossible.');
        return;
      }
      const crees: string[] = j?.crees ?? [];
      // Six secondes et non cinq : ce message nomme les onglets crees, il y a
      // plus a lire.
      annoncer(
        'ok',
        crees.length
          ? `Onglet(s) créé(s) : ${crees.join(', ')}`
          : 'Vos onglets existaient déjà, rien à créer.',
        6000,
      );
      // La fiche porte les noms retenus : on la recharge pour les afficher.
      const f = await fetchDashboard(avecBoutique('/api/onboarding', boutiqueId));
      if (f.ok) setBoutique(await f.json());
    } catch {
      annoncer('erreur', 'Connexion impossible.');
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
      <main className="flex min-h-screen items-center justify-center bg-chaux-100">
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
    <main className="min-h-screen bg-chaux-100 pb-20">
      <header className="indigo-weave relative bg-nuit-900 px-5 pb-10 pt-8 text-chaux-50 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-black leading-[1.05] sm:text-5xl">
            {boutique?.nom || 'Votre boutique'}
          </h1>
          <p className="mt-3 max-w-lg text-sm text-chaux-200">
            Cinq étapes, dans cet ordre. Vos clients écriront à votre propre numéro, et vos
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
                <p className="mt-2 text-sm leading-relaxed text-chaux-600">
                  C&apos;est nous qui ouvrons la session et la relions à votre boutique. Vous
                  n&apos;avez qu&apos;un QR code à scanner, aucune clé à manipuler.
                </p>
                <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Voyant
                    actif={boutique.whatsapp_connecte}
                    quand="numéro connecté"
                    sinon="écrivez-nous pour recevoir votre QR"
                  />
                  {boutique.whatsapp_connecte && (
                    <Voyant
                      actif={boutique.whatsapp_webhook_protege}
                      quand="réception sécurisée"
                      sinon="réception non sécurisée"
                    />
                  )}
                </span>
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
                  <Voyant
                    actif={boutique.telegram_webhook_branche}
                    quand="bot branché"
                    sinon="bot pas encore branché"
                  />
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

            <Etape
              rang={5}
              titre="Vos feuilles Google"
              aide="Le nom des onglets où sont tenus vos commandes, votre menu et vos notes."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['sheet_commandes', 'Commandes', 'Commandes_MaBoutique'],
                    ['sheet_menu', 'Menu', 'Menu_MaBoutique'],
                    ['sheet_notes', 'Notes', 'Notes_MaBoutique'],
                  ] as const
                ).map(([champ, libelle, exemple]) => (
                  <label key={champ} className="block">
                    <span className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                      {libelle}
                    </span>
                    <input
                      key={champ + (boutique[champ] || '')}
                      defaultValue={boutique[champ] || ''}
                      onBlur={(e) => enregistrer(champ, e.target.value)}
                      className={`${CHAMP} mt-1.5`}
                      placeholder={exemple}
                    />
                  </label>
                ))}
              </div>

              {/* Le marchand n'a pas a creer ses onglets a la main, ni meme a
                  savoir qu'ils existent. Un clic, et c'est pret.

                  Le systeme possede deja ce bouton : `calme`, la variante des
                  gestes secondaires. Ecrit a la main il etait arrondi au milieu
                  d'une page qui n'a pas un seul angle adouci, et haut de 36 px
                  la ou le pouce en demande 44. */}
              <button
                type="button"
                onClick={preparerClasseur}
                className={`${classesBouton('calme', 'md', 'carree')} mt-4`}
              >
                Créer mes onglets automatiquement
              </button>
              <p className="mt-2 text-sm text-chaux-600">
                Laissez les champs vides et cliquez : les onglets sont créés à votre nom.
                Si vous les avez déjà, rien n’est effacé.
              </p>
            </Etape>

            <div className="pt-2">
              <Link href="/dashboard" className={classesBouton('action', 'md', 'carree')}>
                Aller au tableau de bord
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
