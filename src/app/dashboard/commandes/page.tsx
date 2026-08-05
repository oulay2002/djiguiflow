'use client';

import { useEffect, useState } from 'react';

type Commande = Record<string, string>;

function formaterArticles(items: string): string {
  if (!items) return '—';
  try {
    const arr = JSON.parse(items);
    if (!Array.isArray(arr) || arr.length === 0) return '—';
    return arr
      .map((a: any) => `${a.quantité ?? 1}× ${a.plat ?? 'Plat'}`)
      .join(', ');
  } catch {
    return items;
  }
}

function badgeStatut(statut: string) {
  const s = (statut || '').toLowerCase();
  if (s === 'validee') return '🟢 Validée';
  if (s.includes('livraison') || s.includes('route')) return '🟠 En livraison';
  if (s.includes('annul')) return '🔴 Annulée';
  if (s.includes('livr')) return '✅ Livrée';
  return statut || '—';
}

export default function Page() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/commandes')
      .then(r => r.json())
      .then(d => { setCommandes(d); setChargement(false); })
      .catch(() => setChargement(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Commandes</h1>
      {chargement ? (
        <p>Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Client</th>
                <th className="p-3">Canal</th>
                <th className="p-3">Articles</th>
                <th className="p-3">Total</th>
                <th className="p-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {commandes.map((c, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{new Date(c.timestamp || Date.now()).toLocaleString('fr-FR')}</td>
                  <td className="p-3">{c.customer_name || '—'}</td>
                  <td className="p-3">{c.canal === 'whatsapp' ? '📲 WhatsApp' : '✈️ Telegram'}</td>
                  <td className="p-3">{formaterArticles(c.items)}</td>
                  <td className="p-3 font-semibold">{Number(c.total_price || 0).toLocaleString('fr-FR')} FCFA</td>
                  <td className="p-3">{badgeStatut(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}