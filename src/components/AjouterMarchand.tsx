'use client';

import { useEffect, useState } from 'react';
import { Plus, Store, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Bouton } from '@/components/ui/Bouton';

type Succes = {
  slug: string;
  invite: boolean;
  sheetCommandes: string;
  sheetMenu: string;
  ongletsCrees: string[];
};

/** « ROSE MonDE » -> « rosemonde » : miroir client de genererSlug (provisioning.ts). */
function apercuSlug(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * « + Ajouter un marchand » : onboarding complet d'une boutique abonnée.
 * Visible des seuls admins (ADMIN_EMAILS).
 */
export default function AjouterMarchand() {
  const [estAdmin, setEstAdmin] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState<Succes | null>(null);

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [categorie, setCategorie] = useState('Restaurant');
  const [zone, setZone] = useState('');
  const [telephone, setTelephone] = useState('');
  const [emoji, setEmoji] = useState('🏪');
  const [groupeLivreurs, setGroupeLivreurs] = useState('');
  const [creerOnglets, setCreerOnglets] = useState(true);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const r = await fetch('/api/admin/statut', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const d = await r.json();
        if (!annule) setEstAdmin(Boolean(d?.admin));
      } catch {
        // Pas d'admin détecté : le bouton reste masqué, le dashboard fonctionne.
      }
    })();
    return () => { annule = true; };
  }, []);

  if (!estAdmin) return null;

  const slug = apercuSlug(nom);

  const soumettre = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée — reconnecte-toi.');

      const r = await fetch('/api/marchands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nom, email, categorie, zone, telephone, emoji,
          whatsapp: telephone,
          groupe_livreurs: groupeLivreurs,
          creer_onglets: creerOnglets,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);

      setSucces(d.marchand as Succes);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnvoi(false);
    }
  };

  const fermer = () => {
    // Le registre est chargé une seule fois au montage du provider : après un
    // provisioning réussi, seul un rechargement fait apparaître le marchand.
    if (succes) location.reload();
    else setOuvert(false);
  };

  return (
    <>
      <div className="border-b border-mangue-200/70 bg-[#f9f4ec]/95 px-4 py-2">
        <div className="mx-auto flex max-w-6xl justify-end">
          <Bouton
            taille="sm"
            onClick={() => { setOuvert(true); setSucces(null); setErreur(''); }}
          >
            <Plus className="h-4 w-4" /> Ajouter un marchand
          </Bouton>
        </div>
      </div>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-chaux-600/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black text-nuit-800">
                <Store className="h-5 w-5 text-mangue-600" /> Nouveau marchand
              </h2>
              <button onClick={fermer} className="rounded-full p-1 hover:bg-chaux-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {succes ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-800">
                  <p className="font-bold">✅ Marchand « {succes.slug} » provisionné.</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>
                      {succes.invite
                        ? '📧 Invitation envoyée : le marchand reçoit un lien pour activer son compte.'
                        : '👤 Compte existant rattaché à cette boutique.'}
                    </li>
                    <li>📄 Onglets : {succes.sheetCommandes} · {succes.sheetMenu}</li>
                    <li>
                      {succes.ongletsCrees.length
                        ? `🆕 Créés : ${succes.ongletsCrees.join(', ')}`
                        : '↩️ Onglets déjà présents, laissés intacts.'}
                    </li>
                  </ul>
                </div>
                <Bouton onClick={fermer} className="w-full">
                  Terminer
                </Bouton>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  value={nom} onChange={e => setNom(e.target.value)}
                  placeholder="Nom de la boutique (ex : Rose MonDE)"
                  className="w-full rounded-2xl border border-[var(--hairline)] px-4 py-3 text-sm focus:border-mangue-400 focus:outline-none"
                />
                {slug && (
                  <p className="px-1 text-xs text-chaux-600">
                    Identifiant : <span className="font-mono font-semibold">{slug}</span> · onglets{' '}
                    <span className="font-mono">Commandes_{slug.replace(/-/g, '').replace(/^./, c => c.toUpperCase())}</span>
                  </p>
                )}
                <input
                  value={email} onChange={e => setEmail(e.target.value)}
                  type="email" placeholder="Email du marchand (reçoit l'invitation)"
                  className="w-full rounded-2xl border border-[var(--hairline)] px-4 py-3 text-sm focus:border-mangue-400 focus:outline-none"
                />
                <div className="flex gap-3">
                  <input
                    value={categorie} onChange={e => setCategorie(e.target.value)}
                    placeholder="Catégorie"
                    className="flex-1 rounded-2xl border border-[var(--hairline)] px-4 py-3 text-sm focus:border-mangue-400 focus:outline-none"
                  />
                  <input
                    value={emoji} onChange={e => setEmoji(e.target.value)}
                    placeholder="Emoji" maxLength={4}
                    className="w-20 rounded-2xl border border-[var(--hairline)] px-4 py-3 text-center text-sm focus:border-mangue-400 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <input
                    value={zone} onChange={e => setZone(e.target.value)}
                    placeholder="Zone (ex : Cocody)"
                    className="flex-1 rounded-2xl border border-[var(--hairline)] px-4 py-3 text-sm focus:border-mangue-400 focus:outline-none"
                  />
                  <input
                    value={telephone} onChange={e => setTelephone(e.target.value)}
                    placeholder="WhatsApp (225…)"
                    className="flex-1 rounded-2xl border border-[var(--hairline)] px-4 py-3 text-sm focus:border-mangue-400 focus:outline-none"
                  />
                </div>
                <input
                  value={groupeLivreurs} onChange={e => setGroupeLivreurs(e.target.value)}
                  placeholder="Groupe livreurs (JID WhatsApp / chat Telegram)"
                  className="w-full rounded-2xl border border-[var(--hairline)] px-4 py-3 text-sm focus:border-mangue-400 focus:outline-none"
                />

                <label className="flex items-center gap-2 px-1 text-sm text-nuit-700">
                  <input
                    type="checkbox" checked={creerOnglets}
                    onChange={e => setCreerOnglets(e.target.checked)}
                    className="h-4 w-4 accent-mangue-600"
                  />
                  Créer les onglets Google Sheets
                </label>

                {erreur && (
                  <p className="rounded-2xl border border-bissap-200 bg-bissap-50 p-3 text-sm text-bissap-700">
                    ❌ {erreur}
                  </p>
                )}

                <Bouton
                  onClick={soumettre}
                  chargement={envoi}
                  disabled={!nom || !email}
                  className="w-full"
                >
                  {!envoi && <Plus className="h-4 w-4" />}
                  Provisionner le marchand
                </Bouton>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
