'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { classesBouton } from '@/components/ui/Bouton';
import { boutiqueLivre } from '@/lib/boutiquePrete';
import { heureRetraitLisible, ligneFraisSuivi } from '@/lib/retrait';

/**
 * Le suivi d'une commande : le double du bon, cote client.
 *
 * C'est l'ecran ou le motif de la maison tombe le plus juste — le client tient
 * son talon et regarde la commande avancer. D'ou le ticket : bord haut
 * dechire, reference en machine a ecrire, perforation avant le total.
 *
 * La numerotation des etapes n'est pas un ornement : la livraison est une
 * sequence, et le rang dit ou l'on en est.
 */

type Suivi = {
  order_id: string;
  customer_name: string;
  address: string;
  total_price: string;
  timestamp: string;
  nom_boutique?: string;
  nom_livreur: string;
  statut_livraison: string;
  /**
   * Ou en est la confirmation demandee au client.
   *
   * `demandee` veut dire QU IL DOIT REPONDRE : sa commande n'est pas lancee
   * tant qu'il ne l'a pas fait. L'ecran l'ignorait, affichait « Commande
   * recue » et laissait croire que tout suivait son cours -- pendant que la
   * boutique attendait une reponse qu'il ne savait pas devoir donner.
   */
  confirmation_statut?: string;
  heure_livraison: string;
  /**
   * `null` tant que le livreur n'a rien annonce. Jamais 0 par defaut — et
   * depuis le retrait, ZERO EXISTE : il veut dire « rien a encaisser ».
   */
  frais_livraison?: number | null;
  /** `livraison` | `retrait`. Decide des etapes et du vocabulaire. */
  mode_recuperation?: string | null;
  /** ISO. Vide veut dire « des que pret », jamais « on ne sait pas ». */
  heure_retrait?: string | null;
};

const FOND_PAGE = '#eeece5';

function horodatage(valeur: string): string {
  if (!valeur) return '';
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return valeur;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Le lien envoye au client porte deja sa reference : `?ref=…&boutique=…`.
 *
 * On les lit par `useSearchParams` plutot qu'en tapant dans `window` depuis un
 * effet — sinon le premier rendu part vide, puis un `setState` immediat force
 * un second rendu pour rien. C'est ce que cette page faisait.
 */
function Suivre() {
  const params = useSearchParams();
  const refUrl = (params.get('ref') || '').trim();
  const boutique = (params.get('boutique') || '').trim();

  /**
   * Le jeton du lien, quand il y en a un.
   *
   * Une reference de commande se devine : la base porte des compteurs
   * sequentiels et des formes bâties sur le telephone du client. Le lien recu
   * par le client porte donc desormais un jeton, et c'est lui qui prouve qu'il
   * s'agit bien de sa commande.
   *
   * ATTENTION AU FORMULAIRE PLUS BAS. Le client peut aussi TAPER sa reference
   * a la main, sans jeton. Cette page transmet donc le jeton quand elle en a
   * un, et rien sinon. Le jour ou la route l'exigera (phase 4), cette saisie
   * manuelle cessera de fonctionner : il faudra alors soit la retirer, soit lui
   * demander une seconde preuve — les quatre derniers chiffres du telephone,
   * par exemple.
   */
  const jetonUrl = (params.get('t') || '').trim();

  const [ref, setRef] = useState(refUrl);
  /**
   * Les quatre derniers chiffres du telephone, pour qui tape sa reference a la
   * main. Le lien recu porte un jeton et n'en a pas besoin ; ce champ ne sert
   * qu'a celui qui a perdu son message.
   */
  const [tel4, setTel4] = useState('');
  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async (r: string, b: string, jeton = '', chiffres = '') => {
    setChargement(true);
    setErreur('');
    try {
      const qs = new URLSearchParams({ ref: r.trim() });
      if (b) qs.set('boutique_id', b);
      if (jeton) qs.set('t', jeton);
      if (chiffres) qs.set('tel4', chiffres);
      const res = await fetch(`/api/suivi?${qs.toString()}`);
      if (res.ok) {
        setSuivi(await res.json());
      } else {
        setSuivi(null);
        /**
         * LE SERVEUR SAIT POURQUOI, ET ON LE JETAIT.
         *
         * Quatre situations tres differentes -- reference inconnue (404), trop
         * de consultations (429), suivi indisponible (503), preuve refusee --
         * recevaient toutes le meme texte : « recopiez la reference ». On
         * demandait au client de recopier une reference qui etait juste, et
         * s il tatonnait il consommait ses dix essais du jour.
         *
         * Le repli ne vaut plus que pour le 404 muet.
         */
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        const duServeur = String(corps?.error ?? '').trim();
        setErreur(
          duServeur && res.status !== 404
            ? duServeur
            : "Aucune commande sous cette référence. Vérifiez-la, ainsi que les quatre derniers chiffres de votre numéro.",
        );
      }
    } catch {
      setErreur('La connexion a échoué. Réessayez dans un instant.');
    } finally {
      setChargement(false);
    }
  }, []);

  // Une reference dans l'URL se charge d'elle-meme : le client a clique sur le
  // lien de son message, il n'a rien a retaper.
  useEffect(() => {
    if (refUrl) void charger(refUrl, boutique, jetonUrl);
  }, [refUrl, boutique, jetonUrl, charger]);

  // Le statut change pendant qu'on regarde : Supabase pousse la mise a jour.
  useEffect(() => {
    if (!suivi?.order_id) return;

    const canal = supabase
      .channel(`suivi-${suivi.order_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'commandes',
          filter: `reference=eq.${suivi.order_id}`,
        },
        (charge) => {
          const nouveau = charge.new as {
            nom_livreur: string | null;
            statut_livraison: string | null;
            confirmation_statut: string | null;
            heure_livraison: string | null;
          };
          setSuivi((prec) =>
            prec
              ? {
                  ...prec,
                  nom_livreur: nouveau.nom_livreur ?? '',
                  statut_livraison: nouveau.statut_livraison ?? '',
                  // Sans lui, le bandeau « repondez au message » restait
                  // affiche apres que le client a repondu -- jusqu au sondage
                  // suivant, quinze secondes plus tard.
                  confirmation_statut: nouveau.confirmation_statut ?? '',
                  heure_livraison: nouveau.heure_livraison ?? '',
                }
              : prec,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [suivi?.order_id]);

  // Filet de secours : si le temps reel ne passe pas, on redemande.
  useEffect(() => {
    if (!suivi || /livr/i.test(suivi.statut_livraison)) return;
    const t = setInterval(() => void charger(suivi.order_id, boutique, jetonUrl), 15000);
    return () => clearInterval(t);
  }, [suivi, boutique, jetonUrl, charger]);

  const confirmee = !!suivi && /confirm|valid|accept/i.test(suivi.statut_livraison);
  const preparation = !!suivi && /prep|cuisine|cours|fabric/i.test(suivi.statut_livraison);
  const acceptee = !!suivi?.nom_livreur;
  const enRoute =
    !!suivi && /part|route|cours|livraison/i.test(suivi.statut_livraison) && !suivi.heure_livraison;
  const livree = !!suivi && (/livr/i.test(suivi.statut_livraison) || !!suivi.heure_livraison);

  // La confirmation est DEMANDEE et pas encore donnee : rien n'avance tant
  // qu'il n'a pas repondu, et c'est la seule etape ou l'action lui revient.
  const aConfirmer =
    !!suivi
    && /demand/i.test(suivi.confirmation_statut ?? '')
    && !acceptee && !enRoute && !livree;

  /**
   * TROIS ETAPES QUI N'ARRIVERONT JAMAIS.
   *
   * Un client venu chercher sa commande voyait « Prise par un livreur »,
   * « En route » et « Livrée » — un parcours qui n'aura pas lieu chez lui. Sa
   * barre de progression restait figee a l'etape deux, et rien ne lui disait
   * si c'etait normal ou casse. C'est le pire etat pour quelqu'un qui doit
   * decider s'il sort de chez lui.
   *
   * `prete` est la SEULE etape que le retrait ajoute, et c'est la seule qui
   * compte pour lui : elle dit qu'il peut partir. Elle vient du marchand, qui
   * la declare depuis son ecran — rien ici ne la devine.
   */
  const livre = boutiqueLivre(suivi?.mode_recuperation);
  const prete = !!suivi && /prête|prete/i.test(suivi.statut_livraison);
  const heureRetrait = heureRetraitLisible(suivi?.heure_retrait);

  const etapes = livre
    ? [
      { label: 'Commande reçue', ok: !!suivi, detail: horodatage(suivi?.timestamp ?? '') },
      {
        label: 'En préparation',
        ok: preparation || confirmee || acceptee || enRoute || livree,
        detail: '',
      },
      { label: 'Prise par un livreur', ok: acceptee || enRoute || livree, detail: suivi?.nom_livreur || '' },
      { label: 'En route', ok: enRoute || livree, detail: '' },
      { label: 'Livrée', ok: livree, detail: horodatage(suivi?.heure_livraison ?? '') },
    ]
    : [
      { label: 'Commande reçue', ok: !!suivi, detail: horodatage(suivi?.timestamp ?? '') },
      {
        label: 'En préparation',
        ok: preparation || confirmee || prete || livree,
        // L'heure demandee se rappelle ICI, tant que la commande se prepare.
        // Elle disparait des qu'elle est prete : a cet instant, c'est PRET qui
        // est vrai, et repeter une heure prevue le contredirait.
        detail: prete || livree ? '' : heureRetrait ? `Prévue vers ${heureRetrait}` : '',
      },
      {
        label: 'Prête à retirer',
        ok: prete || livree,
        detail: prete && !livree ? 'Vous pouvez venir la chercher' : '',
      },
      { label: 'Récupérée', ok: livree, detail: horodatage(suivi?.heure_livraison ?? '') },
    ];
  const idxActif = etapes.map((e) => e.ok).lastIndexOf(true);

  return (
    <main id="contenu" className="min-h-screen bg-chaux-100">
      <header className="indigo-weave relative bg-nuit-900 px-5 pb-10 pt-10 text-chaux-50 sm:px-8">
        <div className="mx-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-mangue-300">
            Suivi en direct
          </p>
          <h1 className="mt-3 font-display text-3xl font-black leading-[1.05] sm:text-4xl">
            Où en est ma commande ?
          </h1>
          <p className="mt-3 text-sm text-chaux-200">
            Entrez la référence reçue dans votre message de confirmation, puis les quatre
            derniers chiffres de votre numéro. La page se met à jour toute seule.
          </p>

          <div className="mt-7 flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Référence de la commande</span>
              <input
                className="w-full border border-chaux-50/25 bg-nuit-800/70 px-4 py-3 font-mono text-sm tracking-wide text-chaux-50 placeholder:text-chaux-400 focus:border-mangue-300 focus:outline-none"
                placeholder="ZH-1234567890-…"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && void charger(ref, boutique, '', tel4)}
              />
            </label>

            {/* LA SECONDE PREUVE.
                Une reference se devine — la base porte des compteurs
                sequentiels et des formes batie sur le telephone du client. Le
                lien recu par le client porte un jeton ; celui qui tape sa
                reference a la main n'en a pas, et ces quatre chiffres tiennent
                sa place. Ce ne sont pas quatre chiffres secrets : c'est un
                obstacle, et il ne tient que parce que le serveur borne les
                essais a dix par jour et par commande. */}
            <label className="w-28">
              <span className="sr-only">Quatre derniers chiffres de votre numéro</span>
              <input
                className="w-full border border-chaux-50/25 bg-nuit-800/70 px-4 py-3 text-center font-mono text-sm tracking-[0.3em] text-chaux-50 placeholder:tracking-[0.3em] placeholder:text-chaux-400 focus:border-mangue-300 focus:outline-none"
                placeholder="1234"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={tel4}
                onChange={(e) => setTel4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => e.key === 'Enter' && void charger(ref, boutique, '', tel4)}
              />
            </label>

            <button
              onClick={() => void charger(ref, boutique, '', tel4)}
              // Les quatre chiffres sont EXIGES par le serveur pour qui n a pas
              // de jeton. Sans eux le bouton partait quand meme, le serveur
              // repondait 404, et le message accusait la reference -- tout en
              // consommant un des dix essais quotidiens de la commande.
              disabled={chargement || !ref || (!jetonUrl && tel4.length !== 4)}
              className={classesBouton('action', 'md', 'carree')}
            >
              {chargement ? 'Recherche…' : 'Suivre'}
            </button>
          </div>
        </div>
        <div className="perf-line absolute inset-x-0 bottom-0 text-chaux-50" aria-hidden />
      </header>

      <div className="mx-auto max-w-xl px-5 py-8 sm:px-8">
        {erreur && (
          <p role="alert" className="border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
            {erreur}
          </p>
        )}

        {!suivi && !erreur && (
          <article
            className="relative border border-dashed border-[var(--hairline)] bg-chaux-50/60 p-6"
            style={{ ['--tear-bg' as string]: FOND_PAGE }}
          >
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-chaux-600">
              Bon de suivi
            </p>

            <p className="mt-4 text-sm text-chaux-600">
              Votre référence commence par les initiales de la boutique, comme
              <span className="ml-1 font-mono font-bold text-nuit-800">ZH-1234567890</span>.
              Elle se trouve dans le message de confirmation que le commerçant vous a envoyé.
            </p>

            <ol className="mt-6 space-y-3 border-t border-[var(--hairline)] pt-5" aria-hidden>
              {etapes.map((e, i) => (
                <li key={e.label} className="flex items-center gap-3 opacity-40">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--hairline)] font-mono text-xs font-bold text-chaux-600">
                    {i + 1}
                  </span>
                  <span className="text-sm text-chaux-600">{e.label}</span>
                </li>
              ))}
            </ol>

            <div className="perf-line my-5 text-nuit-900" aria-hidden />

            <p className="text-center font-mono text-xs uppercase tracking-[0.18em] text-chaux-600">
              En attente de votre référence
            </p>
          </article>
        )}

        {/* LA SEULE ETAPE OU L ACTION REVIENT AU CLIENT.
            Sans ce bandeau, il lisait « Commande reçue ✓ » et attendait sa
            livraison, pendant que la boutique attendait une reponse qu il ne
            savait pas devoir donner. Les deux s attendaient. */}
        {aConfirmer && (
          <div
            role="status"
            className="mb-4 border border-mangue-300 bg-mangue-50 px-4 py-3"
          >
            <p className="text-sm font-bold text-nuit-900">
              Votre commande attend votre confirmation.
            </p>
            <p className="mt-1 text-sm text-chaux-600">
              Un message vous a été envoyé sur WhatsApp. Répondez-y — tant que ce
              n’est pas fait, le commerçant ne prépare pas votre commande.
            </p>
          </div>
        )}

        {suivi && (
          <article
            className="relative border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow"
            style={{ ['--tear-bg' as string]: FOND_PAGE }}
          >
            <div className="tear absolute inset-x-0 top-0" aria-hidden />

            <div className="flex items-start justify-between gap-4 pt-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">
                  {suivi.nom_boutique || 'Votre commande'}
                </p>
                <p className="mt-1 font-mono text-base font-bold text-nuit-900">{suivi.order_id}</p>
              </div>
              {!livree && (
                <span className="stamp shrink-0 font-mono text-xs uppercase text-mangue-600">
                  En cours
                </span>
              )}
            </div>

            {(suivi.customer_name || suivi.address || !livre) && (
              <dl className="mt-5 space-y-1 text-sm text-chaux-600">
                {suivi.customer_name && (
                  <div className="flex gap-2">
                    <dt className="sr-only">Client</dt>
                    <dd>{suivi.customer_name}</dd>
                  </div>
                )}
                {livre && suivi.address && (
                  <div className="flex gap-2">
                    <dt className="sr-only">Adresse de livraison</dt>
                    <dd>{suivi.address}</dd>
                  </div>
                )}
                {/* Un retrait n'a pas d'adresse, et n'en affiche donc aucune :
                    il dit OU EN EST le client, c'est-a-dire s'il doit sortir
                    de chez lui. Vide veut dire « des que pret », une reponse
                    et non une absence de reponse. */}
                {!livre && (
                  <div className="flex gap-2">
                    <dt className="sr-only">Mode de récupération</dt>
                    <dd className="font-semibold text-nuit-800">
                      À emporter
                      {heureRetrait ? ` — vers ${heureRetrait}` : ' — dès que c’est prêt'}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <ol className="mt-6 space-y-3 border-t border-[var(--hairline)] pt-5">
              {etapes.map((e, i) => (
                <li key={e.label} className={`flex items-center gap-3 ${e.ok ? '' : 'opacity-45'}`}>
                  <span
                    aria-hidden
                    className={`flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-bold ${
                      e.ok
                        ? 'bg-accent-600 text-white'
                        : 'border border-[var(--hairline)] text-chaux-600'
                    } ${i === idxActif && !livree ? 'pulse-dot' : ''}`}
                  >
                    {e.ok ? '✓' : i + 1}
                  </span>
                  <span className="flex-1">
                    <span
                      className={`block text-sm ${
                        i === idxActif ? 'font-semibold text-nuit-900' : 'text-chaux-600'
                      }`}
                    >
                      {e.label}
                    </span>
                    {e.detail && (
                      <span className="block font-mono text-xs uppercase tracking-[0.14em] text-accent-700">
                        {e.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>

            <div className="perf-line my-5 text-nuit-900" aria-hidden />

            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">
                Total
              </span>
              <span className="font-mono text-2xl font-black text-bissap-600">
                {Number(suivi.total_price).toLocaleString('fr-FR')}
                <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
              </span>
            </div>

            {/* Les frais NE SONT PAS ajoutes au total : ils vont au livreur,
                le total va au commercant. Les additionner tromperait le client
                sur ce qu'il doit a qui.

                Et la ligne ne parait QUE si le livreur a annonce un montant :
                tant qu'il ne s'est pas prononce, la valeur est nulle et un
                « 0 FCFA » ferait croire a une livraison offerte que personne
                n'a promise. */}
            {(() => {
              /* ZERO EXISTE DEPUIS LE RETRAIT, ET CET ECRAN NE LE CONNAISSAIT PAS.
                 Le test ne portait que sur `!== null`, parce qu'avant lui zero
                 n'etait jamais ecrit. Des que la route s'est mise a poser `0`
                 — en retrait, et pour une livraison offerte — le client a lu
                 « 0 FCFA — a regler au livreur » : une dette envers un livreur
                 qui, dans un cas, n'existe meme pas.

                 La regle vit dans `@/lib/retrait`, avec ses tests. */
              const ligne = ligneFraisSuivi(suivi.mode_recuperation, suivi.frais_livraison);
              if (!ligne.montrer) return null;

              return (
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">
                    Livraison
                  </span>
                  <span className="font-mono text-sm font-bold text-nuit-800">
                    {ligne.offerte ? (
                      <span className="text-accent-700">Offerte</span>
                    ) : (
                      <>
                        {ligne.montant.toLocaleString('fr-FR')}
                        <span className="ml-1 text-xs font-semibold text-chaux-600">
                          FCFA — à régler au livreur
                        </span>
                      </>
                    )}
                  </span>
                </div>
              );
            })()}
          </article>
        )}

        {suivi && (
          <>
            <p className="mt-8 text-center text-sm text-chaux-600">
              Un doute sur votre commande ? Répondez au message du commerçant, il vous lit.
            </p>
            {/*
              LE CHEMIN NATUREL VERS SES DROITS. Le client est ici, et il vient
              de prouver son identité : la même preuve ouvre son dossier. Lui
              faire retaper sa référence sur un autre écran serait lui demander
              deux fois ce qu'il a déjà donné.
            */}
            <p className="mt-3 text-center text-sm">
              <Link
                href={`/mes-donnees?ref=${encodeURIComponent(ref)}${jetonUrl ? `&t=${encodeURIComponent(jetonUrl)}` : ''}`}
                className="text-chaux-600 underline underline-offset-4 transition hover:text-nuit-800"
              >
                Voir ou effacer les données que nous gardons sur vous
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

/** `useSearchParams` suspend au premier rendu : il lui faut une frontière. */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main id="contenu" className="flex min-h-screen items-center justify-center bg-chaux-100">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">Chargement…</p>
        </main>
      }
    >
      <Suivre />
    </Suspense>
  );
}
