'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { classesBouton } from '@/components/ui/Bouton';

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
  heure_livraison: string;
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

  const [ref, setRef] = useState(refUrl);
  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async (r: string, b: string) => {
    setChargement(true);
    setErreur('');
    try {
      const qs = new URLSearchParams({ ref: r.trim() });
      if (b) qs.set('boutique_id', b);
      const res = await fetch(`/api/suivi?${qs.toString()}`);
      if (res.ok) {
        setSuivi(await res.json());
      } else {
        setSuivi(null);
        setErreur(
          "Aucune commande sous cette référence. Recopiez-la telle qu'elle apparaît dans votre message de confirmation.",
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
    if (refUrl) void charger(refUrl, boutique);
  }, [refUrl, boutique, charger]);

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
            heure_livraison: string | null;
          };
          setSuivi((prec) =>
            prec
              ? {
                  ...prec,
                  nom_livreur: nouveau.nom_livreur ?? '',
                  statut_livraison: nouveau.statut_livraison ?? '',
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
    const t = setInterval(() => void charger(suivi.order_id, boutique), 15000);
    return () => clearInterval(t);
  }, [suivi, boutique, charger]);

  const confirmee = !!suivi && /confirm|valid|accept/i.test(suivi.statut_livraison);
  const preparation = !!suivi && /prep|cuisine|cours|fabric/i.test(suivi.statut_livraison);
  const acceptee = !!suivi?.nom_livreur;
  const enRoute =
    !!suivi && /part|route|cours|livraison/i.test(suivi.statut_livraison) && !suivi.heure_livraison;
  const livree = !!suivi && (/livr/i.test(suivi.statut_livraison) || !!suivi.heure_livraison);

  const etapes = [
    { label: 'Commande reçue', ok: !!suivi, detail: horodatage(suivi?.timestamp ?? '') },
    {
      label: 'En préparation',
      ok: preparation || confirmee || acceptee || enRoute || livree,
      detail: '',
    },
    { label: 'Prise par un livreur', ok: acceptee || enRoute || livree, detail: suivi?.nom_livreur || '' },
    { label: 'En route', ok: enRoute || livree, detail: '' },
    { label: 'Livrée', ok: livree, detail: horodatage(suivi?.heure_livraison ?? '') },
  ];
  const idxActif = etapes.map((e) => e.ok).lastIndexOf(true);

  return (
    <main className="min-h-screen bg-chaux-100">
      <header className="indigo-weave relative bg-nuit-900 px-5 pb-10 pt-10 text-chaux-50 sm:px-8">
        <div className="mx-auto max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mangue-300">
            Suivi en direct
          </p>
          <h1 className="mt-3 font-display text-3xl font-black leading-[1.05] sm:text-4xl">
            Où en est ma commande ?
          </h1>
          <p className="mt-3 text-sm text-chaux-200">
            Entrez la référence reçue dans votre message de confirmation. La page se met à jour
            toute seule.
          </p>

          <div className="mt-7 flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Référence de la commande</span>
              <input
                className="w-full border border-chaux-50/25 bg-nuit-800/70 px-4 py-3 font-mono text-sm tracking-wide text-chaux-50 placeholder:text-chaux-400 focus:border-mangue-300 focus:outline-none"
                placeholder="ZH-1234567890-…"
                value={ref}
                onChange={(e) => setRef(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && void charger(ref, boutique)}
              />
            </label>
            <button
              onClick={() => void charger(ref, boutique)}
              disabled={chargement || !ref}
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

        {suivi && (
          <article
            className="relative border border-[var(--hairline)] bg-chaux-50 p-6 soft-shadow"
            style={{ ['--tear-bg' as string]: FOND_PAGE }}
          >
            <div className="tear absolute inset-x-0 top-0" aria-hidden />

            <div className="flex items-start justify-between gap-4 pt-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-chaux-600">
                  {suivi.nom_boutique || 'Votre commande'}
                </p>
                <p className="mt-1 font-mono text-base font-bold text-nuit-900">{suivi.order_id}</p>
              </div>
              {!livree && (
                <span className="stamp shrink-0 font-mono text-[10px] uppercase text-mangue-600">
                  En cours
                </span>
              )}
            </div>

            {(suivi.customer_name || suivi.address) && (
              <dl className="mt-5 space-y-1 text-sm text-chaux-600">
                {suivi.customer_name && (
                  <div className="flex gap-2">
                    <dt className="sr-only">Client</dt>
                    <dd>{suivi.customer_name}</dd>
                  </div>
                )}
                {suivi.address && (
                  <div className="flex gap-2">
                    <dt className="sr-only">Adresse de livraison</dt>
                    <dd>{suivi.address}</dd>
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
                      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-accent-700">
                        {e.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>

            <div className="perf-line my-5 text-nuit-900" aria-hidden />

            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-chaux-600">
                Total
              </span>
              <span className="font-mono text-2xl font-black text-bissap-600">
                {Number(suivi.total_price).toLocaleString('fr-FR')}
                <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
              </span>
            </div>
          </article>
        )}

        <p className="mt-8 text-center text-sm text-chaux-600">
          Un doute sur votre commande ? Répondez au message du commerçant, il vous lit.
        </p>
      </div>
    </main>
  );
}

/** `useSearchParams` suspend au premier rendu : il lui faut une frontière. */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-chaux-100">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">Chargement…</p>
        </main>
      }
    >
      <Suivre />
    </Suspense>
  );
}
