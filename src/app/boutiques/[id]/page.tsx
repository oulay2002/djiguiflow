'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Produit = {
  id: string;
  nom: string;
  categorie: string;
  prix: number;
  description: string;
  image?: string;
};

export default function Page() {
  const { id } = useParams();
  const slug = String(id);
  const commandeRef = useRef<HTMLDivElement>(null);

  // Résolu côté serveur via /api/boutiques/[id] : le registre Marchands
  // vit dans Google Sheets et ne doit jamais être lu depuis le navigateur.
  const [estMarchandSheets, setEstMarchandSheets] = useState(false);

  const [header, setHeader] = useState({ nom: 'Boutique', secteur: 'Commerce', emoji: '🏪' });
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [nom, setNom] = useState('');
  const [tel, setTel] = useState('');
  const [adresse, setAdresse] = useState('');
  const [instructions, setInstructions] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [telBoutique, setTelBoutique] = useState('');

  useEffect(() => {
    if (!slug) return;
    let annule = false;

    (async () => {
      try {
        // 1. Est-ce une boutique du registre Marchands (canal Sheets) ?
        const res = await fetch(`/api/boutiques/${slug}`);
        if (annule) return;

        if (res.ok) {
          const m = await res.json();
          if (annule) return;
          setEstMarchandSheets(true);
          setHeader({ nom: m.nom, secteur: m.secteur, emoji: m.emoji });

          const rm = await fetch(`/api/boutiques/${slug}/menu`);
          const d = rm.ok ? await rm.json() : [];
          if (annule) return;
          setProduits(Array.isArray(d) ? d : []);
          return;
        }

        // 2. Sinon, boutique Supabase (commande via lien WhatsApp).
        const { data: b } = await supabase.from('boutiques').select('*').eq('id', slug).single();
        if (annule || !b) return;

        setHeader({ nom: b.nom ?? 'Boutique', secteur: b.categorie ?? 'Commerce', emoji: '🏪' });
        setTelBoutique(String(b.telephone ?? ''));

        const { data: ps } = await supabase.from('produits').select('*').eq('boutique_id', slug);
        if (annule) return;
        setProduits((ps ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nom: String(p.nom ?? p.name ?? 'Produit'),
          categorie: String(p.categorie ?? ''),
          prix: Number(p.prix ?? p.price ?? 0),
          description: String(p.description ?? ''),
          image: String(p.image_url ?? p.image ?? ''),
        })));
      } catch (e) {
        // Règle d'or : ne jamais casser l'écran client.
        console.error('Chargement boutique', slug, e);
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => { annule = true; };
  }, [slug]);

  const ajouter = (pid: string) => setPanier(p => ({ ...p, [pid]: (p[pid] || 0) + 1 }));
  const retirer = (pid: string) =>
    setPanier(p => {
      const q = (p[pid] || 0) - 1;
      const n = { ...p };
      if (q <= 0) delete n[pid]; else n[pid] = q;
      return n;
    });

  const lignes = Object.entries(panier)
    .map(([pid, q]) => { const prod = produits.find(x => x.id === pid); return prod ? { prod, q } : null; })
    .filter(Boolean) as { prod: Produit; q: number }[];
  const total = lignes.reduce((s, l) => s + l.prod.prix * l.q, 0);

  const commander = async () => {
    if (estMarchandSheets) {
      setEnvoi(true);
      try {
        const res = await fetch(`/api/boutiques/${slug}/commander`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nom, tel, adresse, instructions,
            panier: Object.entries(panier).map(([pid, quantite]) => ({ id: pid, quantite })),
          }),
        });
        const d = await res.json();
        if (d.ok) {
          setConfirmation(d.order_id);
          setPanier({}); setNom(''); setTel(''); setAdresse(''); setInstructions('');
        }
      } finally { setEnvoi(false); }
    } else {
      const lignesTexte = lignes.map(l => `- ${l.q}x ${l.prod.nom} (${(l.q * l.prod.prix).toLocaleString('fr-FR')} FCFA)`).join('\n');
      const msg = `Bonjour ${header.nom}, je souhaite commander :\n${lignesTexte}\nTotal : ${total.toLocaleString('fr-FR')} FCFA\nNom : ${nom}\nAdresse : ${adresse}${instructions ? `\nInstructions : ${instructions}` : ''}`;
      const digits = telBoutique.replace(/\D/g, '');
      const full = digits.startsWith('225') ? digits : `225${digits}`;
      window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-gradient-to-r from-amber-600 to-orange-700 text-white p-8">
        <Link
          href="/boutiques"
          className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold hover:bg-white/25"
        >
          ← Retour aux boutiques
        </Link>
        <h1 className="text-3xl font-bold">{header.emoji} {header.nom}</h1>
        <p className="mt-2 text-amber-100">{header.secteur} — commandez, on s&apos;occupe du reste</p>
        <Link
          href="/suivi"
          className="mt-3 inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm hover:bg-white/30"
        >
          📍 Suivre ma commande
        </Link>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-8">
        {confirmation && (
          <div className="rounded-xl bg-green-100 border border-green-300 p-4 text-green-800">
            ✅ Commande reçue ! Référence : <b>{confirmation}</b>.{' '}
            <Link href={`/suivi?ref=${encodeURIComponent(confirmation)}&boutique=${encodeURIComponent(slug)}`} className="underline font-bold">
              Suivre ma commande →
            </Link>
          </div>
        )}

        {chargement ? <p>Chargement…</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {produits.map(p => (
              <div key={p.id} className="rounded-xl border bg-white p-5 shadow-sm">
                {p.image && (
                  <img src={p.image} alt={p.nom} className="mb-3 h-36 w-full rounded-lg object-cover" />
                )}
                <div className="flex justify-between">
                  <h2 className="font-bold">{p.nom}</h2>
                  <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-1">{p.categorie}</span>
                </div>
                <p className="text-sm text-stone-500 mt-1">{p.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <p className="font-semibold text-orange-700">{p.prix.toLocaleString('fr-FR')} FCFA</p>
                  {panier[p.id] ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => retirer(p.id)} className="px-2 rounded bg-stone-200">−</button>
                      <span>{panier[p.id]}</span>
                      <button onClick={() => ajouter(p.id)} className="px-2 rounded bg-amber-500 text-white">+</button>
                    </div>
                  ) : (
                    <button onClick={() => ajouter(p.id)} className="rounded-lg bg-amber-600 px-3 py-1 text-white text-sm">+ Ajouter</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {lignes.length > 0 && (
          <div ref={commandeRef} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold">🛒 Votre commande</h2>
            {lignes.map(l => (
              <div key={l.prod.id} className="flex justify-between text-sm">
                <span>{l.q}× {l.prod.nom}</span>
                <span>{(l.q * l.prod.prix).toLocaleString('fr-FR')} FCFA</span>
              </div>
            ))}
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Total</span><span>{total.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="border rounded-lg p-2" placeholder="Votre nom complet" value={nom} onChange={e => setNom(e.target.value)} />
              <input className="border rounded-lg p-2" placeholder="Votre téléphone" value={tel} onChange={e => setTel(e.target.value)} />
            </div>
            <input className="border rounded-lg p-2 w-full" placeholder="Adresse de livraison" value={adresse} onChange={e => setAdresse(e.target.value)} />
            <input className="border rounded-lg p-2 w-full" placeholder="Instructions (facultatif)" value={instructions} onChange={e => setInstructions(e.target.value)} />
            <button onClick={commander} disabled={envoi || !nom || !tel || !adresse}
              className="w-full rounded-lg bg-orange-700 py-3 text-white font-bold disabled:opacity-40">
              {envoi ? 'Envoi…' : estMarchandSheets ? '✅ Commander' : '📲 Commander via WhatsApp'}
            </button>
          </div>
        )}
      </main>

      {lignes.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <button
            onClick={() => commandeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-full bg-orange-700 px-6 py-3 font-bold text-white shadow-2xl hover:bg-orange-800"
          >
            🛒 Poursuivre la commande · {total.toLocaleString('fr-FR')} FCFA
          </button>
        </div>
      )}
    </div>
  );
}