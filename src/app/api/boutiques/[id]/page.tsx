'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { MARCHANDS } from '@/lib/marchands';

type Produit = { id: string; nom: string; categorie: string; prix: number; description: string };

export default function Page() {
  const { id } = useParams();
  const slug = String(id);
  const marchand = MARCHANDS[slug];

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

    if (marchand) {
      setHeader({ nom: marchand.nom, secteur: marchand.secteur, emoji: marchand.emoji });
      fetch(`/api/boutiques/${slug}/menu`)
        .then(r => r.json())
        .then(d => { setProduits(Array.isArray(d) ? d : []); setChargement(false); })
        .catch(() => setChargement(false));
    } else {
      (async () => {
        try {
          const { data: b } = await supabase.from('boutiques').select('*').eq('id', slug).single();
          if (b) {
            setHeader({ nom: b.nom ?? 'Boutique', secteur: b.categorie ?? 'Commerce', emoji: '🏪' });
            setTelBoutique(String(b.telephone ?? ''));
            const { data: ps } = await supabase.from('produits').select('*').eq('boutique_id', slug);
            setProduits(((ps ?? []) as any[]).map(p => ({
              id: String(p.id),
              nom: p.nom ?? p.name ?? 'Produit',
              categorie: p.categorie ?? '',
              prix: Number(p.prix ?? p.price ?? 0),
              description: p.description ?? '',
            })));
          }
        } finally {
          setChargement(false);
        }
      })();
    }
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
    if (marchand) {
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
    <div className="min-h-screen bg-stone-50">
      <header className="bg-gradient-to-r from-amber-600 to-orange-700 text-white p-8">
        <h1 className="text-3xl font-bold">{header.emoji} {header.nom}</h1>
        <p className="mt-2 text-amber-100">{header.secteur} — commandez, on s'occupe du reste</p>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-8">
        {confirmation && (
          <div className="rounded-xl bg-green-100 border border-green-300 p-4 text-green-800">
            ✅ Commande reçue ! Référence : <b>{confirmation}</b>. Vous serez notifié sur WhatsApp.
          </div>
        )}

        {chargement ? <p>Chargement…</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {produits.map(p => (
              <div key={p.id} className="rounded-xl border bg-white p-5 shadow-sm">
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
          <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
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
              {envoi ? 'Envoi…' : marchand ? '✅ Commander' : '📲 Commander via WhatsApp'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}