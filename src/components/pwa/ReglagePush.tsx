'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2, TriangleAlert } from 'lucide-react';
import { fetchDashboard } from '@/lib/apiClient';
import { useBoutique } from '@/lib/boutique';

/**
 * La cle publique VAPID doit etre transmise au navigateur en octets bruts,
 * alors qu'elle voyage en base64 « URL-safe ». D'ou cette conversion : sans
 * elle, `pushManager.subscribe` rejette la cle sans message utile.
 */
function base64UrlVersOctets(base64: string): Uint8Array<ArrayBuffer> {
  const bourrage = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalise = (base64 + bourrage).replace(/-/g, '+').replace(/_/g, '/');
  const binaire = window.atob(normalise);
  // Le tampon est alloue explicitement pour que le type soit
  // `Uint8Array<ArrayBuffer>` et non `<ArrayBufferLike>` : `applicationServerKey`
  // n'accepte pas un tableau qui pourrait reposer sur un SharedArrayBuffer.
  const octets = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

type Etat = 'chargement' | 'non-supporte' | 'refuse' | 'inactif' | 'actif';

/**
 * Declare l'abonnement au serveur. Vrai s'il l'a bien enregistre.
 *
 * L'ecriture est un upsert sur l'endpoint : la rejouer sur un abonnement deja
 * connu ne cree pas de doublon. C'est ce qui permet de l'appeler aussi a
 * l'ouverture de l'ecran, pour rattraper un abonnement que le navigateur porte
 * mais que le serveur ignore.
 */
async function declarerAuServeur(
  boutiqueId: string,
  abonnement: PushSubscription,
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    const reponse = await fetchDashboard('/api/push/abonner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boutique_id: boutiqueId, abonnement: abonnement.toJSON() }),
    });

    if (reponse.ok) return { ok: true };

    const d = (await reponse.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, erreur: d?.error || `Enregistrement refusé (${reponse.status})` };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Serveur injoignable' };
  }
}

/**
 * Active les notifications push sur CET appareil.
 *
 * L'abonnement appartient au navigateur, pas au compte : le marchand qui veut
 * etre prevenu sur son telephone et sur l'ordinateur de la boutique doit
 * l'activer sur les deux. Le texte le dit explicitement, faute de quoi
 * « active » sur un appareil laisse croire que l'autre l'est aussi.
 */
export default function ReglagePush() {
  const { boutiqueId, pret } = useBoutique();
  const [etat, setEtat] = useState<Etat>('chargement');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  // Demandee au serveur plutot que lue dans `process.env`. Une variable
  // `NEXT_PUBLIC_` est figee a la compilation : tant que le build n'avait pas
  // vu la cle, aucun reglage dans Vercel ne pouvait la faire apparaitre ici.
  const [clePublique, setClePublique] = useState<string | null>(null);

  useEffect(() => {
    if (!pret) return;
    let monte = true;

    (async () => {
      const supporte =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      if (!supporte) {
        if (monte) setEtat('non-supporte');
        return;
      }

      // Le deploiement peut ne pas avoir de cle : l'ecran doit alors le dire,
      // pas proposer un bouton qui echouerait.
      let cle = '';
      try {
        const r = await fetch('/api/push/cle');
        if (r.ok) cle = ((await r.json()) as { cle?: string }).cle ?? '';
      } catch {
        // Hors ligne : on ne peut pas savoir. On traite comme indisponible.
      }

      if (!monte) return;
      if (!cle) {
        setEtat('non-supporte');
        return;
      }
      setClePublique(cle);

      if (Notification.permission === 'denied') {
        if (monte) setEtat('refuse');
        return;
      }

      try {
        // `ready` et non `register` : l'enregistrement est fait une fois pour
        // toutes dans le layout racine.
        const enregistrement = await navigator.serviceWorker.ready;
        const abonnement = await enregistrement.pushManager.getSubscription();

        if (!abonnement) {
          if (monte) setEtat('inactif');
          return;
        }

        // Le navigateur peut porter un abonnement que le serveur ignore : un
        // enregistrement interrompu en chemin suffit. L'ecran affichait alors
        // « actif » a un marchand que personne ne pouvait joindre — la pire
        // panne possible ici, puisqu'elle rassure a tort. On redeclare donc
        // l'abonnement, et « actif » n'est dit que si le serveur confirme.
        const connu = await declarerAuServeur(boutiqueId, abonnement);
        if (monte) setEtat(connu.ok ? 'actif' : 'inactif');
      } catch {
        if (monte) setEtat('non-supporte');
      }
    })();

    return () => {
      monte = false;
    };
    // `pret` conditionne la boutique : declarer l'abonnement avant que le
    // contexte soit charge le rattacherait au marchand par defaut.
  }, [pret, boutiqueId]);

  const activer = useCallback(async () => {
    if (!clePublique) return;

    setOccupe(true);
    setErreur('');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refuse' : 'inactif');
        return;
      }

      const enregistrement = await navigator.serviceWorker.ready;

      // Un abonnement peut survivre a une rotation de cle VAPID cote serveur ;
      // il serait alors inutilisable. On repart donc de celui qui existe, et
      // `subscribe` le renvoie tel quel s'il est encore valide.
      const abonnement =
        (await enregistrement.pushManager.getSubscription()) ??
        (await enregistrement.pushManager.subscribe({
          // Obligatoire : le navigateur refuse un push silencieux.
          userVisibleOnly: true,
          applicationServerKey: base64UrlVersOctets(clePublique),
        }));

      const declare = await declarerAuServeur(boutiqueId, abonnement);

      if (!declare.ok) {
        // L'abonnement local sans ligne en base ferait croire a une activation
        // reussie, et le marchand attendrait des alertes qui ne viendront pas.
        await abonnement.unsubscribe().catch(() => {});
        throw new Error(declare.erreur);
      }

      setEtat('actif');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Activation impossible.');
    } finally {
      setOccupe(false);
    }
  }, [boutiqueId, clePublique]);

  const desactiver = useCallback(async () => {
    setOccupe(true);
    setErreur('');

    try {
      const enregistrement = await navigator.serviceWorker.ready;
      const abonnement = await enregistrement.pushManager.getSubscription();

      if (abonnement) {
        // On previent le serveur AVANT de resilier localement : l'inverse
        // laisserait une ligne morte en base si l'appel reseau echouait.
        await fetchDashboard('/api/push/desabonner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boutique_id: boutiqueId, endpoint: abonnement.endpoint }),
        }).catch(() => null);

        await abonnement.unsubscribe();
      }

      setEtat('inactif');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Désactivation impossible.');
    } finally {
      setOccupe(false);
    }
  }, [boutiqueId]);

  if (etat === 'chargement') return null;

  return (
    <div className="rounded-[1.5rem] border border-[var(--hairline)] bg-white/80 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              etat === 'actif' ? 'bg-accent-100 text-accent-700' : 'bg-chaux-100 text-chaux-600'
            }`}
          >
            {etat === 'actif' ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </span>

          <div className="min-w-0">
            <p className="font-bold text-nuit-900">Notifications sur cet appareil</p>
            <p className="mt-1 text-sm leading-snug text-chaux-600">
              {etat === 'non-supporte' &&
                "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d'abord DjiguiFlow à l'écran d'accueil."}
              {etat === 'refuse' &&
                'Les notifications sont bloquées pour ce site. Réautorisez-les dans les réglages du navigateur.'}
              {etat === 'inactif' &&
                'Soyez prévenu dès qu’une commande arrive, même application fermée. À activer sur chaque appareil.'}
              {etat === 'actif' &&
                'Cet appareil sonnera à chaque nouvelle commande. Vos autres appareils sont réglés séparément.'}
            </p>
          </div>
        </div>

        {(etat === 'inactif' || etat === 'actif') && (
          <button
            type="button"
            onClick={etat === 'actif' ? desactiver : activer}
            disabled={occupe}
            className={`inline-flex min-h-[2.75rem] shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
              etat === 'actif'
                ? 'border border-[var(--hairline)] bg-chaux-50 text-chaux-600'
                : 'bg-bissap-500 text-white active:bg-bissap-600'
            }`}
          >
            {occupe && <Loader2 className="h-4 w-4 animate-spin" />}
            {etat === 'actif' ? 'Désactiver' : 'Activer'}
          </button>
        )}
      </div>

      {erreur && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-bissap-50 px-3 py-2.5 text-sm font-semibold text-bissap-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {erreur}
        </p>
      )}
    </div>
  );
}
