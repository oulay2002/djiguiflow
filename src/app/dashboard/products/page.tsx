'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import {
  AlertTriangle, Bell, CreditCard, Gauge, LogOut, Package2, Plus, RefreshCw,
  Settings, ShoppingCart, Store, TrendingUp, Truck, Users, UtensilsCrossed, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BUCKET_IMAGES, dossierMarchand, nomFichierSain } from '@/lib/storage';
import { fetchDashboard } from '@/lib/apiClient';
import { Bouton } from '@/components/ui/Bouton';

type Prod = {
  id: string; nom: string; categorie: string; prix: number;
  description: string; disponible: boolean; image: string;
  stock: number | null; seuil_alerte: number | null;
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

export default function Page() {
  const [prods, setProds] = useState<Prod[]>([]);
  const [maj, setMaj] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState('toutes');

  const [ouvert, setOuvert] = useState(false);
  const [fNom, setFNom] = useState('');
  const [fCat, setFCat] = useState('');
  const [fPrix, setFPrix] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fDispo, setFDispo] = useState(true);
  const [fUrl, setFUrl] = useState('');
  const [fFile, setFFile] = useState<File | null>(null);
  const [fStock, setFStock] = useState('');
  const [fSeuil, setFSeuil] = useState('5');
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState('');

  // Modal de gestion de stock
  const [editProd, setEditProd] = useState<Prod | null>(null);
  const [eStock, setEStock] = useState('');
  const [eSeuil, setESeuil] = useState('');
  const [eDispo, setEDispo] = useState(true);
  const [eMsg, setEMsg] = useState('');
  const [eEnvoi, setEEnvoi] = useState(false);

  const { boutiqueId, boutiques, pret } = useBoutique();
  const nomBoutique = boutiques.find(b => b.id === boutiqueId)?.nom ?? 'Ma boutique';

  const charger = async () => {
    setRefreshing(true);
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId));
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setProds(d.produits || []);
      setMaj(new Date().toLocaleTimeString('fr-FR'));
    } catch (e) {
      console.error('Chargement des produits :', e);
    } finally { setRefreshing(false); }
  };
  useEffect(() => { if (pret) charger(); }, [pret, boutiqueId]);

  const ajouter = async () => {
    if (!fNom || !fPrix) { setMsg('⚠️ Nom et prix sont obligatoires.'); return; }
    setEnvoi(true); setMsg('');
    try {
      let image = fUrl.trim();
      if (fFile) {
        const dossier = await dossierMarchand(boutiqueId);
        const path = `${dossier}/produits/${Date.now()}-${nomFichierSain(fFile.name)}`;
        const { error } = await supabase.storage.from(BUCKET_IMAGES).upload(path, fFile, {
          cacheControl: '3600',
          contentType: fFile.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) throw new Error(`Upload échoué — ${error.message}`);
        image = supabase.storage.from(BUCKET_IMAGES).getPublicUrl(path).data.publicUrl;
      }
      const res = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: fNom, categorie: fCat, prix: Number(fPrix) || 0,
          description: fDesc, disponible: fDispo, image,
          stock: fStock === '' ? null : Number(fStock),
          seuil_alerte: fSeuil === '' ? null : Number(fSeuil),
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Erreur serveur');
      setOuvert(false);
      setFNom(''); setFCat(''); setFPrix(''); setFDesc(''); setFUrl('');
      setFFile(null); setFDispo(true); setFStock(''); setFSeuil('5');
      await charger();
    } catch (e) {
      setMsg('❌ ' + (e instanceof Error ? e.message : 'Erreur inconnue'));
    } finally { setEnvoi(false); }
  };

  const ouvrirStock = (p: Prod) => {
    setEditProd(p);
    setEStock(p.stock === null ? '' : String(p.stock));
    setESeuil(p.seuil_alerte === null ? '' : String(p.seuil_alerte));
    setEDispo(p.disponible);
    setEMsg('');
  };

  const sauvegarderStock = async () => {
    if (!editProd) return;
    setEEnvoi(true); setEMsg('');
    try {
      const res = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: editProd.id,
          stock: eStock === '' ? null : Number(eStock),
          seuil_alerte: eSeuil === '' ? null : Number(eSeuil),
          disponible: eDispo,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Erreur serveur');
      setEditProd(null);
      await charger();
    } catch (e) {
      setEMsg('❌ ' + (e instanceof Error ? e.message : 'Erreur inconnue'));
    } finally { setEEnvoi(false); }
  };

  // Analyse des stocks pour les badges et alertes
  const statutStock = (p: Prod) => {
    if (p.stock === null) return { type: 'na', label: 'Sans suivi', color: 'bg-chaux-100 text-chaux-600' };
    if (p.stock === 0) return { type: 'rupture', label: '🔴 Rupture', color: 'bg-bissap-100 text-bissap-700' };
    if (p.seuil_alerte !== null && p.stock <= p.seuil_alerte) return { type: 'bas', label: `🟠 Bas · ${p.stock}`, color: 'bg-mangue-100 text-mangue-700' };
    return { type: 'ok', label: `🟢 Stock · ${p.stock}`, color: 'bg-accent-100 text-accent-700' };
  };

  const alertes = prods.filter(p => p.stock !== null && ((p.seuil_alerte !== null && p.stock <= p.seuil_alerte) || p.stock === 0));

  const cats = ['toutes', ...Array.from(new Set(prods.map(p => p.categorie).filter(Boolean)))];
  const filtrés = cat === 'toutes' ? prods : prods.filter(p => p.categorie === cat);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-6">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-lg font-black text-white">D</div>
            <div>
              <p className="text-lg font-black">DjiguiFlow</p>
              <p className="text-xs uppercase tracking-[0.2em] text-chaux-600">Admin</p>
            </div>
          </div>
          <nav className="space-y-2">
            {sidebarItems.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  href === '/dashboard/products'
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
                    : 'text-chaux-600 hover:bg-chaux-100'
                }`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <Bouton
            variante="calme"
            className="mt-8 w-full"
            onClick={async () => { await supabase.auth.signOut(); location.href = '/login'; }}
          >
            <LogOut className="h-4 w-4" />Déconnexion
          </Bouton>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="indigo-weave relative overflow-hidden rounded-[2rem] bg-nuit-900 p-6 text-chaux-50 shadow-xl">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-mangue-100">Menu réel · feuille Google</p>
                <h1 className="mt-2 font-display text-3xl font-black">Produits · {nomBoutique}</h1>
                <p className="mt-1 text-xs text-mangue-100">
                  {prods.length} produits · {prods.filter(p => p.disponible).length} disponibles · maj {maj}
                </p>
              </div>
              <div className="flex gap-2">
                <Bouton variante="contraste" onClick={() => setOuvert(true)}>
                  <Plus className="h-4 w-4" /> Ajouter un produit
                </Bouton>
                <Bouton variante="voile" onClick={charger} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
                </Bouton>
              </div>
            </div>
          </header>

          {alertes.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-mangue-300 bg-mangue-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-mangue-700" />
              <div className="flex-1">
                <p className="font-bold text-mangue-700">
                  ⚠️ {alertes.length} produit{alertes.length > 1 ? 's' : ''} sous le seuil d'alerte
                </p>
                <p className="mt-1 text-sm text-mangue-700">
                  {alertes.slice(0, 3).map(p => p.nom).join(', ')}
                  {alertes.length > 3 && ` et ${alertes.length - 3} autre${alertes.length - 3 > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
                  cat === c ? 'bg-nuit-900 text-chaux-50' : 'bg-chaux-100 text-nuit-700 hover:bg-chaux-200'
                }`}>
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtrés.map(p => {
              const st = statutStock(p);
              return (
                <div key={p.id || p.nom} className={`overflow-hidden rounded-[1.5rem] border bg-white/90 shadow-sm backdrop-blur-sm ${p.disponible ? 'border-[var(--hairline)]' : 'border-bissap-200 opacity-70'}`}>
                  {p.image ? (
                    <img src={p.image} alt={p.nom} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-mangue-100">
                      <UtensilsCrossed className="h-10 w-10 text-mangue-400" />
                    </div>
                  )}
                  <div className="space-y-2 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-bold text-nuit-900">{p.nom}</h2>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.disponible ? 'bg-accent-100 text-accent-700' : 'bg-bissap-100 text-bissap-700'}`}>
                        {p.disponible ? 'Disponible' : 'Épuisé'}
                      </span>
                    </div>
                    <p className="text-xs text-chaux-600">{p.description}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="rounded-full bg-mangue-100 px-2.5 py-1 text-xs font-semibold text-mangue-700">{p.categorie}</span>
                      <p className="font-black text-mangue-700">{p.prix.toLocaleString('fr-FR')} F</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t pt-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.color}`}>
                        {st.label}
                      </span>
                      <button
                        onClick={() => ouvrirStock(p)}
                        className="rounded-full bg-chaux-100 px-3 py-1 text-xs font-semibold text-nuit-700 transition hover:bg-chaux-200"
                      >
                        📦 Gérer le stock
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtrés.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed bg-white/60 p-10 text-center text-chaux-600">
              Aucun produit dans cette catégorie.
            </div>
          )}
        </main>
      </div>

      {/* Modal d'ajout */}
      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[1.5rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-nuit-900">🍽️ Nouveau produit</h2>
              <button onClick={() => setOuvert(false)} className="rounded-full p-2 hover:bg-chaux-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border p-2" placeholder="Nom du plat *" value={fNom} onChange={e => setFNom(e.target.value)} />
              <input className="rounded-lg border p-2" placeholder="Catégorie (ex : Burger)" value={fCat} onChange={e => setFCat(e.target.value)} />
              <input className="rounded-lg border p-2" placeholder="Prix (FCFA) *" type="number" value={fPrix} onChange={e => setFPrix(e.target.value)} />
              <input className="rounded-lg border p-2" placeholder="Description" value={fDesc} onChange={e => setFDesc(e.target.value)} />
            </div>

            <div className="grid gap-3 rounded-2xl border border-mangue-200 bg-mangue-50 p-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-mangue-700">📦 Stock actuel</label>
                <input type="number" min="0" placeholder="ex : 12 (laisser vide = sans suivi)" value={fStock} onChange={e => setFStock(e.target.value)} className="w-full rounded-lg border border-mangue-300 bg-white p-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-mangue-700">🔔 Alerte à</label>
                <input type="number" min="0" placeholder="ex : 5" value={fSeuil} onChange={e => setFSeuil(e.target.value)} className="w-full rounded-lg border border-mangue-300 bg-white p-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-chaux-600">📸 Photo du plat</label>
              <input type="file" accept="image/*" onChange={e => setFFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-chaux-600 file:mr-3 file:rounded-full file:border-0 file:bg-mangue-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-mangue-700 hover:file:bg-mangue-200" />
              <p className="mt-2 text-xs text-chaux-600">…ou colle un lien image :</p>
              <input className="mt-1 w-full rounded-lg border p-2" placeholder="https://…/photo.jpg" value={fUrl} onChange={e => setFUrl(e.target.value)} />
              {(fFile || fUrl) && (
                <img src={fFile ? URL.createObjectURL(fFile) : fUrl} alt="aperçu" className="mt-2 h-28 w-full rounded-lg object-cover" />
              )}
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-nuit-700">
              <input type="checkbox" checked={fDispo} onChange={e => setFDispo(e.target.checked)} className="h-4 w-4 accent-accent-600" />
              Disponible à la vente
            </label>

            {msg && <p className="rounded-lg bg-bissap-50 p-3 text-sm text-bissap-700">{msg}</p>}

            <Bouton onClick={ajouter} chargement={envoi} className="w-full">
              {!envoi && <Plus className="h-5 w-5" />}
              {envoi ? 'Ajout en cours…' : 'Ajouter au menu'}
            </Bouton>
          </div>
        </div>
      )}

      {/* Modal de gestion de stock */}
      {editProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-[1.5rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-nuit-900">📦 Gérer le stock</h2>
                <p className="text-sm text-chaux-600">{editProd.nom}</p>
              </div>
              <button onClick={() => setEditProd(null)} className="rounded-full p-2 hover:bg-chaux-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-nuit-700">Stock actuel</label>
                <input type="number" min="0" placeholder="ex : 12" value={eStock} onChange={x => setEStock(x.target.value)} className="w-full rounded-lg border p-2" />
                <p className="mt-1 text-xs text-chaux-600">Vide = pas de suivi</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-nuit-700">Seuil d'alerte</label>
                <input type="number" min="0" placeholder="ex : 5" value={eSeuil} onChange={x => setESeuil(x.target.value)} className="w-full rounded-lg border p-2" />
                <p className="mt-1 text-xs text-chaux-600">Alerte quand stock ≤ ce nombre</p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-nuit-700">
              <input type="checkbox" checked={eDispo} onChange={x => setEDispo(x.target.checked)} className="h-4 w-4 accent-accent-600" />
              Disponible à la vente
            </label>

            {eMsg && <p className="rounded-lg bg-bissap-50 p-3 text-sm text-bissap-700">{eMsg}</p>}

            <div className="flex gap-2">
              <Bouton variante="calme" onClick={() => setEditProd(null)} className="flex-1">Annuler</Bouton>
              <Bouton onClick={sauvegarderStock} chargement={eEnvoi} className="flex-1">
                {eEnvoi ? 'Sauvegarde…' : '💾 Sauvegarder'}
              </Bouton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}