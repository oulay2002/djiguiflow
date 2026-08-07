'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import {
  Bell, CreditCard, Gauge, LogOut, Package2, Plus, RefreshCw,
  Settings, ShoppingCart, Store, TrendingUp, Truck, Users, UtensilsCrossed, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BUCKET_IMAGES, dossierMarchand, nomFichierSain } from '@/lib/storage';
import { fetchDashboard } from '@/lib/apiClient';
import { Bouton } from '@/components/ui/Bouton';

type Prod = { id: string; nom: string; categorie: string; prix: number; description: string; disponible: boolean; image: string };

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
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState('');

  const { boutiqueId, pret } = useBoutique();

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
        body: JSON.stringify({ nom: fNom, categorie: fCat, prix: Number(fPrix) || 0, description: fDesc, disponible: fDispo, image }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Erreur serveur');
      setOuvert(false);
      setFNom(''); setFCat(''); setFPrix(''); setFDesc(''); setFUrl(''); setFFile(null); setFDispo(true);
      await charger();
    } catch (e) {
      setMsg('❌ ' + (e instanceof Error ? e.message : 'Erreur inconnue'));
    } finally { setEnvoi(false); }
  };

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
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
            </div>
          </div>
          <nav className="space-y-2">
            {sidebarItems.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  href === '/dashboard/products'
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
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
          <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-700 via-amber-600 to-orange-500 p-6 text-white shadow-xl">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-amber-100">Menu réel · feuille Google</p>
                <h1 className="mt-2 text-3xl font-black">🍽️ Produits Zahara</h1>
                <p className="mt-1 text-xs text-amber-100">{prods.length} produits · {prods.filter(p => p.disponible).length} disponibles · maj {maj}</p>
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

          <div className="flex flex-wrap gap-2">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
                  cat === c ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}>
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtrés.map(p => (
              <div key={p.id || p.nom} className={`overflow-hidden rounded-[1.5rem] border bg-white/90 shadow-sm backdrop-blur-sm ${p.disponible ? 'border-slate-200' : 'border-rose-200 opacity-70'}`}>
                {p.image ? (
                  <img src={p.image} alt={p.nom} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100">
                    <UtensilsCrossed className="h-10 w-10 text-orange-400" />
                  </div>
                )}
                <div className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-bold text-slate-900">{p.nom}</h2>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.disponible ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {p.disponible ? 'Disponible' : 'Épuisé'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{p.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{p.categorie}</span>
                    <p className="font-black text-orange-700">{p.prix.toLocaleString('fr-FR')} F</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtrés.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed bg-white/60 p-10 text-center text-slate-500">
              Aucun produit dans cette catégorie.
            </div>
          )}
        </main>
      </div>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[1.5rem] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">🍽️ Nouveau produit</h2>
              <button onClick={() => setOuvert(false)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border p-2" placeholder="Nom du plat *" value={fNom} onChange={e => setFNom(e.target.value)} />
              <input className="rounded-lg border p-2" placeholder="Catégorie (ex : Burger)" value={fCat} onChange={e => setFCat(e.target.value)} />
              <input className="rounded-lg border p-2" placeholder="Prix (FCFA) *" type="number" value={fPrix} onChange={e => setFPrix(e.target.value)} />
              <input className="rounded-lg border p-2" placeholder="Description" value={fDesc} onChange={e => setFDesc(e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">📸 Photo du plat</label>
              <input type="file" accept="image/*" onChange={e => setFFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-orange-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-200" />
              <p className="mt-2 text-xs text-slate-400">…ou colle un lien image :</p>
              <input className="mt-1 w-full rounded-lg border p-2" placeholder="https://…/photo.jpg" value={fUrl} onChange={e => setFUrl(e.target.value)} />
              {(fFile || fUrl) && (
                <img src={fFile ? URL.createObjectURL(fFile) : fUrl} alt="aperçu" className="mt-2 h-28 w-full rounded-lg object-cover" />
              )}
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={fDispo} onChange={e => setFDispo(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Disponible à la vente
            </label>

            {msg && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{msg}</p>}

            <Bouton onClick={ajouter} chargement={envoi} className="w-full">
              {!envoi && <Plus className="h-5 w-5" />}
              {envoi ? 'Ajout en cours…' : 'Ajouter au menu'}
            </Bouton>
          </div>
        </div>
      )}
    </div>
  );
}