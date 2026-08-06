'use client';

import { useEffect, useState } from 'react';

type Suivi = {
  order_id: string; customer_name: string; address: string; total_price: string;
  timestamp: string; nom_livreur: string; statut_livraison: string; heure_livraison: string;
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
      const qs = new URLSearchParams({ ref: r });
      // Sans boutique_id, l'API cherche chez le marchand par défaut :
      // un client d'une autre boutique ne retrouverait jamais sa commande.
      if (b) qs.set('boutique_id', b);
      const res = await fetch(`/api/suivi?${qs.toString()}`);
      if (!res.ok) { setSuivi(null); setErreur('Commande introuvable. Vérifie la référence.'); }
      else setSuivi(await res.json());
    } catch { setErreur('Erreur de connexion.'); }
    finally { setChargement(false); }
  };

  // Le lien « Suivre ma commande » porte ?ref= et ?boutique= : sans cette
  // lecture, la référence était ignorée et le client devait la retaper.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = (p.get('ref') || '').trim();
    const b = (p.get('boutique') || '').trim();
    if (b) setBoutique(b);
    if (r) { setRef(r); charger(r, b); }
  }, []);

  useEffect(() => {
    if (!suivi) return;
    const t = setInterval(() => charger(suivi.order_id, boutique), 15000);
    return () => clearInterval(t);
  }, [suivi?.order_id, boutique]);

  const acceptee = !!suivi?.nom_livreur;
  const enRoute = !!suivi && /part|route|cours/i.test(suivi.statut_livraison);
  const livree = !!suivi && (/livr/i.test(suivi.statut_livraison) || !!suivi.heure_livraison);

  const etapes = [
    { label: '📥 Commande reçue', ok: true, detail: '' },
    { label: '🤝 Acceptée par un livreur', ok: acceptee, detail: suivi?.nom_livreur || '' },
    { label: '🛵 En livraison', ok: enRoute || livree, detail: '' },
    { label: '✅ Livrée', ok: livree, detail: suivi?.heure_livraison || '' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <main className="mx-auto max-w-xl space-y-6">
        <header className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-700 p-6 text-white">
          <h1 className="text-2xl font-bold">📍 Suivre ma commande</h1>
          <p className="mt-1 text-amber-100">Entre ta référence (ex : APP-…) pour voir le statut en direct.</p>
        </header>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border p-3"
            placeholder="APP-…"
            value={ref}
            onChange={e => setRef(e.target.value)}
          />
          <button
            onClick={() => charger(ref)}
            disabled={chargement || !ref}
            className="rounded-lg bg-orange-700 px-5 font-bold text-white disabled:opacity-40"
          >
            {chargement ? '…' : 'Suivre'}
          </button>
        </div>

        {erreur && <p className="rounded-lg bg-rose-100 p-3 text-rose-700">{erreur}</p>}

        {suivi && (
          <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between text-sm">
              <span className="font-bold">{suivi.order_id}</span>
              <span className="text-stone-500">{Number(suivi.total_price).toLocaleString('fr-FR')} FCFA</span>
            </div>
            <p className="text-sm text-stone-500">📍 {suivi.address}</p>

            <div className="space-y-3 pt-2">
              {etapes.map((e, i) => (
                <div key={i} className={`flex items-center gap-3 ${e.ok ? '' : 'opacity-40'}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${e.ok ? 'bg-green-600 text-white' : 'bg-stone-200 text-stone-500'}`}>
                    {e.ok ? '✓' : i + 1}
                  </div>
                  <div>
                    <p className={e.ok ? 'font-semibold' : 'text-stone-500'}>{e.label}</p>
                    {e.detail && <p className="text-xs text-green-700">{e.detail}</p>}
                  </div>
                </div>
              ))}
            </div>

            <p className="pt-2 text-xs text-stone-400">Mise à jour automatique toutes les 15 s.</p>
          </div>
        )}
      </main>
    </div>
  );
}