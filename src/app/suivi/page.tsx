'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

export default function Page() {
  const [ref, setRef] = useState('');
  const [boutique, setBoutique] = useState('');
  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const charger = async (r: string, b = boutique) => {
    setChargement(true); setErreur('');
    try {
      const qs = new URLSearchParams({ ref: r.trim().toUpperCase() });
      if (b) qs.set('boutique_id', b);
      const res = await fetch(`/api/suivi?${qs.toString()}`);
      if (!res.ok) { setSuivi(null); setErreur('Commande introuvable. Vérifie la référence (ex : ZH-…, BO-…, APP-…).'); }
      else setSuivi(await res.json());
    } catch { setErreur('Erreur de connexion.'); }
    finally { setChargement(false); }
  };

  // Lecture des params URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = (p.get('ref') || '').trim();
    const b = (p.get('boutique') || '').trim();
    if (b) setBoutique(b);
    if (r) { setRef(r.toUpperCase()); charger(r, b); }
  }, []);

  // ⚡ REALTIME : écoute les changements en direct
  useEffect(() => {
    if (!suivi?.order_id) return;

    const channel = supabase
      .channel(`suivi-${suivi.order_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'commandes',
          filter: `reference=eq.${suivi.order_id}`,
        },
        (payload) => {
          const nouveau = payload.new as {
            reference: string;
            nom_livreur: string | null;
            statut_livraison: string | null;
            heure_livraison: string | null;
          };
          setSuivi(prev => prev ? {
            ...prev,
            nom_livreur: nouveau.nom_livreur ?? '',
            statut_livraison: nouveau.statut_livraison ?? '',
            heure_livraison: nouveau.heure_livraison ?? '',
          } : prev);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [suivi?.order_id]);

  // 🔄 FALLBACK : polling toutes les 15s
  useEffect(() => {
    if (!suivi || suivi.statut_livraison === 'livree') return;
    const t = setInterval(() => charger(suivi.order_id, boutique), 15000);
    return () => clearInterval(t);
  }, [suivi?.order_id, boutique]);

  // Logique d'étapes enrichie (5 étapes au lieu de 4)
  const recue = !!suivi;
  const confirmee = !!suivi && /confirm|valid|accept/i.test(suivi.statut_livraison);
  const preparation = !!suivi && /prep|cuisine|cours|fabric/i.test(suivi.statut_livraison);
  const acceptee = !!suivi?.nom_livreur;
  const enRoute = !!suivi && /part|route|cours|livraison/i.test(suivi.statut_livraison) && !suivi.heure_livraison;
  const livree = !!suivi && (/livr/i.test(suivi.statut_livraison) || !!suivi.heure_livraison);

  const etapes = [
    { label: '📥 Commande reçue', ok: recue, detail: suivi?.timestamp || '' },
    { label: '👩🏾‍🍳 En préparation', ok: preparation || confirmee || acceptee || enRoute || livree, detail: '' },
    { label: '🛵 Pris en charge', ok: acceptee || enRoute || livree, detail: suivi?.nom_livreur || '' },
    { label: '🏁 En route', ok: enRoute || livree, detail: '' },
    { label: '✅ Livrée', ok: livree, detail: suivi?.heure_livraison || '' },
  ];
  const idxActif = etapes.map(e => e.ok).lastIndexOf(true);

  return (
    <div className="min-h-screen bg-chaux-50 p-6">
      <main className="mx-auto max-w-xl space-y-6">
        <header className="rounded-xl bg-gradient-to-r from-mangue-600 to-mangue-700 p-6 text-white shadow-md">
          <p className="text-xs uppercase tracking-widest text-mangue-200">DjiguiFlow · suivi en direct</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Suivre ma commande</h1>
          <p className="mt-1 text-mangue-100">Entre ta référence (ex : ZH-…, BO-…, APP-…) pour voir le statut en direct.</p>
        </header>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-chaux-200 bg-white p-3 font-mono text-sm tracking-wide outline-none focus:border-mangue-600 focus:ring-2 focus:ring-mangue-100"
            placeholder="ZH-… · BO-… · APP-…"
            value={ref}
            onChange={e => setRef(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && charger(ref)}
          />
          <button
            onClick={() => charger(ref)}
            disabled={chargement || !ref}
            className="rounded-lg bg-mangue-700 px-5 font-bold text-white transition hover:bg-mangue-800 disabled:opacity-40"
          >
            {chargement ? '…' : 'Suivre'}
          </button>
        </div>

        {erreur && (
          <p className="rounded-lg border border-bissap-200 bg-bissap-50 p-3 text-sm text-bissap-700">{erreur}</p>
        )}

        {suivi && (
          <div className="space-y-4 rounded-xl border border-chaux-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-chaux-500">{suivi.nom_boutique || 'Commande'}</p>
                <p className="font-mono text-base font-bold text-chaux-800">{suivi.order_id}</p>
              </div>
              <span className="rounded-full bg-mangue-100 px-3 py-1 text-xs font-semibold text-mangue-800">
                ⚡ Temps réel
              </span>
            </div>

            {suivi.customer_name && (
              <p className="text-sm text-chaux-600">👤 {suivi.customer_name}</p>
            )}
            {suivi.address && (
              <p className="text-sm text-chaux-600">📍 {suivi.address}</p>
            )}

            <div className="space-y-3 border-t border-chaux-100 pt-4">
              {etapes.map((e, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 transition ${
                    e.ok ? '' : 'opacity-40'
                  } ${i === idxActif ? 'font-semibold' : ''}`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      e.ok
                        ? i === idxActif && !livree
                          ? 'bg-accent-600 text-white ring-4 ring-accent-100 animate-pulse'
                          : 'bg-accent-600 text-white'
                        : 'bg-chaux-200 text-chaux-600'
                    }`}
                  >
                    {e.ok ? '✓' : i + 1}
                  </div>
                  <div className="flex-1">
                    <p className={e.ok ? 'text-chaux-800' : 'text-chaux-500'}>{e.label}</p>
                    {e.detail && <p className="text-xs text-accent-700">{e.detail}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-chaux-100 pt-3 text-sm font-bold">
              <span>Total</span>
              <span className="text-mangue-700">
                {Number(suivi.total_price).toLocaleString('fr-FR')} FCFA
              </span>
            </div>

            <p className="pt-1 text-center text-xs text-chaux-500">
              ⚡ Mise à jour en temps réel (+ fallback toutes les 15 s)
            </p>
          </div>
        )}

        <p className="text-center text-xs text-chaux-500">
          Un souci ? Écris directement au marchand sur WhatsApp.
        </p>
      </main>
    </div>
  );
}