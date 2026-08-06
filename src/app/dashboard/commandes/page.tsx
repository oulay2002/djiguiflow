'use client';

import { useEffect, useState } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import Link from 'next/link';
import {
  Bell, CheckCircle2, Clock, CreditCard, Gauge, LogOut,
  Package2, Phone, Settings, ShoppingCart, Store, TrendingUp,
  Truck, Users, MapPin, Handshake, Bike, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Cmd = {
  order_id: string; customer_name: string; phone: string; address: string;
  items: string; total_price: number; timestamp: string; canal: string;
  nom_livreur: string; statut_livraison: string;
  heure_prise_en_charge: string; heure_livraison: string;
};

const sidebarItems = [
  { label: "Vue d'ensemble", href: '/dashboard', icon: Gauge },
  { label: 'Ma Boutique', href: '/dashboard/ma-boutique', icon: Store },
  { label: 'Commandes', href: '/dashboard/commandes', icon: ShoppingCart },
  { label: 'Clients', href: '/dashboard/customers', icon: Users },
  { label: 'Produits', href: '/dashboard/products', icon: Package2 },
  { label: 'Analytics', href: '/dashboard/stats', icon: TrendingUp },
  { label: 'Livreurs', href: '/dashboard/livreurs', icon: Truck },
  { label: 'Paiements', href: '/dashboard/paiements', icon: CreditCard },
  { label: 'Notifications', href: '/dashboard/reglages/notifications', icon: Bell },
  { label: 'Réglages', href: '/dashboard/reglages', icon: Settings },
];

const parseItems = (s: string) => {
  try {
    const arr = JSON.parse(s || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map((it: Record<string, unknown>) => ({
      plat: String(it.plat || it.nom || 'Article'),
      q: Number(it.quantité || it.quantite || 1) || 1,
      prix: Number(it.prix_unitaire || it.prix || 0) || 0,
    }));
  } catch { return []; }
};

export default function Page() {
  const [cmds, setCmds] = useState<Cmd[]>([]);
  const [filtre, setFiltre] = useState('tous');
  const [busy, setBusy] = useState<string | null>(null);

  const { boutiqueId, pret } = useBoutique();

  const charger = async () => {
    try {
      const r = await fetch(avecBoutique('/api/dashboard/commandes', boutiqueId));
      const d = await r.json();
      // Sans ce garde-fou, une 503 (quota Sheets) vidait la liste
      // silencieusement : le gérant croyait n'avoir aucune commande.
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setCmds(d.commandes || []);
    } catch (e) {
      console.error('Chargement des commandes :', e);
    }
  };

  useEffect(() => {
    if (!pret) return;
    charger();
    const t = setInterval(charger, 10000);
    return () => clearInterval(t);
  }, [pret, boutiqueId]);

  const agir = async (order_id: string, action: 'acceptee' | 'route' | 'livree') => {
    setBusy(order_id + action);
    try {
      await fetch(avecBoutique('/api/dashboard/commandes/statut', boutiqueId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id, action }),
      });
      await charger();
    } finally { setBusy(null); }
  };

  const filtrées = cmds.filter(c =>
    filtre === 'tous' ? true :
    filtre === 'attente' ? !c.nom_livreur && !/livr|route/i.test(c.statut_livraison) :
    filtre === 'route' ? /route|part|cours/i.test(c.statut_livraison) && !!c.nom_livreur :
    filtre === 'livree' ? /livr/i.test(c.statut_livraison) || !!c.heure_livraison : true
  );

  const canalIcon = (c: string) =>
    c === 'app' ? '🌐' : c === 'whatsapp' ? '📲' : c === 'telegram' ? '✈️' : '❓';

  const badgeColor = (c: Cmd) =>
    /livr/i.test(c.statut_livraison) ? 'bg-emerald-100 text-emerald-700' :
    /route|part|cours/i.test(c.statut_livraison) ? 'bg-sky-100 text-sky-700' :
    c.nom_livreur ? 'bg-violet-100 text-violet-700' :
    'bg-amber-100 text-amber-700';

  const statutLabel = (c: Cmd) =>
    /livr/i.test(c.statut_livraison) ? 'Livrée' :
    /route|part|cours/i.test(c.statut_livraison) ? 'En route' :
    c.nom_livreur ? `Prise par ${c.nom_livreur}` :
    'En attente';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-6">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-lg font-black text-white">D</div>
            <div>
              <p className="text-lg font-black">DjiguiFlow</p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
            </div>
          </div>
          <nav className="space-y-2">
            {sidebarItems.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  href === '/dashboard/commandes'
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <button onClick={async () => { await supabase.auth.signOut(); location.href = '/login'; }}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold hover:bg-slate-100">
            <LogOut className="h-4 w-4" />Déconnexion
          </button>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Gestion</p>
              <h1 className="mt-2 text-3xl font-black">🛒 Commandes Zahara</h1>
              <p className="mt-1 text-sm text-slate-500">{cmds.length} commandes · {filtrées.length} affichées · refresh 10s</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ['tous', 'Toutes', cmds.length],
                ['attente', 'En attente', cmds.filter(c => !c.nom_livreur).length],
                ['route', 'En route', cmds.filter(c => /route|part|cours/i.test(c.statut_livraison)).length],
                ['livree', 'Livrées', cmds.filter(c => /livr/i.test(c.statut_livraison) || c.heure_livraison).length],
              ].map(([k, l, n]) => (
                <button key={k} onClick={() => setFiltre(String(k))}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filtre === k ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}>
                  {l} · {n}
                </button>
              ))}
            </div>
          </header>

          <div className="space-y-3">
            {filtrées.length === 0 && (
              <div className="rounded-[1.5rem] border border-dashed bg-white/60 p-10 text-center text-slate-500">
                Aucune commande dans cette catégorie.
              </div>
            )}
            {filtrées.map((c, i) => (
              <div key={i + '-' + c.order_id} className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-orange-700">{c.order_id}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeColor(c)}`}>{statutLabel(c)}</span>
                      <span className="text-xs text-slate-500">{canalIcon(c.canal)} {c.canal}</span>
                      <span className="text-xs text-slate-500"><Clock className="inline h-3 w-3" /> {c.timestamp ? new Date(c.timestamp).toLocaleString('fr-FR') : '—'}</span>
                    </div>
                    <p className="text-base font-bold text-slate-900">{c.customer_name}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-600"><Phone className="h-3 w-3" />{c.phone}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-3 w-3" />{c.address}</p>
                    <div className="flex flex-wrap gap-2">
                      {parseItems(c.items).length === 0 ? (
                        <p className="text-sm text-slate-500">📦 —</p>
                      ) : (
                        parseItems(c.items).map((it, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">
                            <span className="rounded-full bg-orange-700 px-2 py-0.5 text-xs font-bold text-white">{it.q}×</span>
                            {it.plat}
                            {it.prix > 0 && <span className="text-amber-600">· {(it.q * it.prix).toLocaleString('fr-FR')} F</span>}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-orange-700">{c.total_price.toLocaleString('fr-FR')} F</p>
                    {c.heure_livraison && <p className="text-xs text-emerald-700">✅ {new Date(c.heure_livraison).toLocaleTimeString('fr-FR')}</p>}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  {!c.nom_livreur && !/livr/i.test(c.statut_livraison) && (
                    <button onClick={() => agir(c.order_id, 'acceptee')} disabled={busy === c.order_id + 'acceptee'}
                      className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                      <Handshake className="h-4 w-4" />Accepter
                    </button>
                  )}
                  {c.nom_livreur && !/route|part|cours|livr/i.test(c.statut_livraison) && (
                    <button onClick={() => agir(c.order_id, 'route')} disabled={busy === c.order_id + 'route'}
                      className="flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                      <Bike className="h-4 w-4" />En route
                    </button>
                  )}
                  {!/livr/i.test(c.statut_livraison) && (
                    <button onClick={() => agir(c.order_id, 'livree')} disabled={busy === c.order_id + 'livree'}
                      className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      <Check className="h-4 w-4" />Livrée
                    </button>
                  )}
                  {/livr/i.test(c.statut_livraison) && (
                    <span className="flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />Cycle terminé
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}