'use client';

import { useEffect, useState } from 'react';
import { useBoutique, avecBoutique, uuidBoutiqueCourante } from '@/lib/boutique';
import { fetchDashboard } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import NotificationToast from '@/components/NotificationToast';
import {
  CheckCircle2,
  Clock,
  Phone,
  MapPin,
  Handshake,
  Bike,
  Check,
  RefreshCw,
  Search,
} from 'lucide-react';

/**
 * L'ecran des commandes du marchand — le seul.
 *
 * Il y en avait deux, `/dashboard/commandes` et `/dashboard/orders`, pour le
 * meme sujet et avec deux mises en page. Seul celui-ci figurait au menu ;
 * l'autre n'etait atteignable que par la notification push et par un lien
 * depuis Clients — autrement dit, le marchand qui touchait l'alerte
 * « nouvelle commande » atterrissait sur l'ecran qui n'etait pas le sien.
 *
 * Et l'ecart n'etait pas cosmetique : l'autre ecran ecrivait `statut`
 * DIRECTEMENT en base depuis le navigateur, sans passer par l'API. Ni miroir
 * dans la feuille, ni `statut_livraison`, ni notification au client : le
 * marchand faisait avancer sa commande et le client n'en savait rien.
 *
 * Ce qu'il avait de bon a ete repris ici : l'alerte temps reel et la
 * recherche. Il redirige desormais vers cette page.
 */

type Cmd = {
  order_id: string; customer_name: string; phone: string; address: string;
  items: string; total_price: number; timestamp: string; canal: string;
  /** `null` tant que le livreur n'a rien annonce. Jamais 0 par defaut. */
  frais_livraison?: number | null;
  nom_livreur: string; statut_livraison: string;
  heure_prise_en_charge: string; heure_livraison: string;
  confirmation_statut: string | null;
  confirmation_heure: string | null;
};

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
  const [recherche, setRecherche] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const { boutiqueId, boutiques, pret } = useBoutique();
  const nomBoutique = boutiques.find(b => b.id === boutiqueId)?.nom ?? 'Ma boutique';

  const charger = async () => {
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/commandes', boutiqueId));
      const d = await r.json();
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

  /**
   * Alerte immediate a l'arrivee d'une commande, son compris.
   *
   * Le rafraichissement de dix secondes finit par la montrer, mais sans rien
   * dire : un marchand qui ne regarde pas l'ecran ne voit rien venir. Cette
   * alerte n'existait que sur l'ancien ecran, celui qui n'etait pas au menu.
   *
   * Le filtre par boutique est pose explicitement. RLS interdit deja de lire
   * les commandes d'un autre — c'est verifie — mais un abonnement sans filtre
   * reveille la page pour rien des qu'un marchand quelconque vend, et un
   * compte qui tient deux boutiques verrait sonner l'une pour l'autre.
   */
  useEffect(() => {
    if (!pret) return;

    let annule = false;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const uuid = await uuidBoutiqueCourante(boutiqueId);
      if (!uuid || annule) return;

      canal = supabase
        .channel(`commandes-${uuid}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'commandes',
            filter: `boutique_id=eq.${uuid}`,
          },
          (payload) => {
            const n = payload.new as { client_nom?: string; total?: number; statut?: string };
            // Un panier n'est pas une commande : il s'ecrit des que le client
            // ajoute un article, et sonnerait a chaque geste.
            if (n.statut === 'panier') return;

            window.addNotification?.({
              id: `cmd-${Date.now()}`,
              type: 'new-order',
              title: 'Nouvelle commande !',
              message: `${n.client_nom || 'Client'} — ${Number(n.total || 0).toLocaleString('fr-FR')} FCFA`,
            });
            void charger();
          },
        )
        .subscribe();
    })();

    return () => {
      annule = true;
      if (canal) void supabase.removeChannel(canal);
    };
  }, [pret, boutiqueId]);

  const agir = async (order_id: string, action: 'acceptee' | 'route' | 'livree') => {
    setBusy(order_id + action);
    try {
      await fetchDashboard(avecBoutique('/api/dashboard/commandes/statut', boutiqueId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id, action }),
      });
      await charger();
    } finally { setBusy(null); }
  };

  const relancer = async (order_id: string) => {
    setBusy(order_id + 'relance');
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/commandes', boutiqueId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: order_id, action: 'relancer' }),
      });
      if (!r.ok) throw new Error('Relance impossible');
      await charger();
    } catch (e) {
      console.error('Relance échouée :', e);
    } finally { setBusy(null); }
  };

  // Filtres classiques (livraison) + filtres confirmation
  const filtrées = cmds.filter(c => {
    // Le marchand cherche une commande dont un client lui parle au telephone :
    // il a sa reference, ou juste son nom, ou juste son numero. Les trois
    // doivent repondre.
    const q = recherche.trim().toLowerCase();
    if (q) {
      const cible = `${c.order_id} ${c.customer_name} ${c.phone} ${c.address}`.toLowerCase();
      if (!cible.includes(q)) return false;
    }

    if (filtre === 'tous') return true;
    if (filtre === 'attente') return !c.nom_livreur && !/livr|route/i.test(c.statut_livraison);
    if (filtre === 'route') return /route|part|cours/i.test(c.statut_livraison) && !!c.nom_livreur;
    if (filtre === 'livree') return /livr/i.test(c.statut_livraison) || !!c.heure_livraison;
    if (filtre === 'aconfirmer') return c.confirmation_statut === null || c.confirmation_statut === undefined;
    if (filtre === 'confirmees') return c.confirmation_statut === 'confirmee';
    if (filtre === 'refusees') return c.confirmation_statut === 'refusee';
    return true;
  });

  const canalIcon = (c: string) =>
    c === 'app' ? '🌐' : c === 'whatsapp' ? '📲' : c === 'telegram' ? '✈️' : '❓';

  // Meme coupure que sur l'ecran Commandes : mangue tant que c'est chez le
  // commercant, indigo des que c'est en rue, feuille quand c'est arrive.
  // « Prise par » et « En route » etaient devenues de la meme couleur, alors
  // que l'une dit « un livreur a accepte » et l'autre « il est parti ».
  const badgeColor = (c: Cmd) =>
    /livr/i.test(c.statut_livraison) ? 'bg-accent-100 text-accent-700' :
    /route|part|cours/i.test(c.statut_livraison) ? 'bg-nuit-100 text-nuit-700' :
    c.nom_livreur ? 'bg-mangue-200 text-mangue-700' :
    'bg-mangue-50 text-mangue-700';

  const statutLabel = (c: Cmd) =>
    /livr/i.test(c.statut_livraison) ? 'Livrée' :
    /route|part|cours/i.test(c.statut_livraison) ? 'En route' :
    c.nom_livreur ? `Prise par ${c.nom_livreur}` :
    'En attente';

  // Badge de confirmation client
  const badgeConfirmation = (c: Cmd) => {
    if (c.confirmation_statut === 'confirmee') {
      return (
        <span className="rounded-full bg-accent-50 border border-accent-200 px-2.5 py-1 text-xs font-semibold text-accent-700">
          ✅ Confirmée
        </span>
      );
    }
    if (c.confirmation_statut === 'refusee') {
      return (
        <span className="rounded-full bg-bissap-50 border border-bissap-200 px-2.5 py-1 text-xs font-semibold text-bissap-700">
          ❌ Refusée
        </span>
      );
    }
    // Pas encore répondu (ou ancienne commande sans suivi)
    return (
      <span className="rounded-full bg-mangue-50 border border-mangue-200 px-2.5 py-1 text-xs font-semibold text-mangue-700">
        🟡 À confirmer
      </span>
    );
  };

  const nbAConfirmer = cmds.filter(c => !c.confirmation_statut).length;
  const nbConfirmees = cmds.filter(c => c.confirmation_statut === 'confirmee').length;
  const nbRefusees = cmds.filter(c => c.confirmation_statut === 'refusee').length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.15),transparent_25%),linear-gradient(180deg,#fffdf9_0%,#f7f0e7_100%)] p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <main className="min-w-0 space-y-6">
          <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-chaux-600">Gestion</p>
              <h1 className="mt-2 font-display text-3xl font-black">Commandes · {nomBoutique}</h1>
              <p className="mt-1 text-sm text-chaux-600">{cmds.length} commandes · {filtrées.length} affichées · refresh 10s</p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <label className="relative w-full md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-chaux-600" />
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Référence, nom, téléphone…"
                  className="w-full rounded-full border border-[var(--hairline)] bg-white/80 py-2 pl-9 pr-4 text-sm text-nuit-900 placeholder:text-chaux-600 focus:border-nuit-400 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-2">
              {[
                ['tous', 'Toutes', cmds.length],
                ['attente', 'En attente', cmds.filter(c => !c.nom_livreur).length],
                ['route', 'En route', cmds.filter(c => /route|part|cours/i.test(c.statut_livraison)).length],
                ['livree', 'Livrées', cmds.filter(c => /livr/i.test(c.statut_livraison) || c.heure_livraison).length],
              ].map(([k, l, n]) => (
                <button key={k} onClick={() => setFiltre(String(k))}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filtre === k ? 'bg-nuit-900 text-chaux-50' : 'bg-chaux-100 text-nuit-700 hover:bg-chaux-200'
                  }`}>
                  {l} · {n}
                </button>
              ))}
              </div>
            </div>
          </header>

          {/* Bannière confirmation anti-retours */}
          {(nbAConfirmer > 0 || nbRefusees > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mangue-200 bg-mangue-50 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-mangue-700">🛡️ Anti-retours</span>
                {nbAConfirmer > 0 && (
                  <button onClick={() => setFiltre('aconfirmer')} className="rounded-full bg-mangue-100 px-3 py-1 font-semibold text-mangue-700 hover:bg-mangue-200">
                    🟡 {nbAConfirmer} à confirmer
                  </button>
                )}
                {nbConfirmees > 0 && (
                  <button onClick={() => setFiltre('confirmees')} className="rounded-full bg-accent-100 px-3 py-1 font-semibold text-accent-800 hover:bg-accent-200">
                    ✅ {nbConfirmees} confirmées
                  </button>
                )}
                {nbRefusees > 0 && (
                  <button onClick={() => setFiltre('refusees')} className="rounded-full bg-bissap-100 px-3 py-1 font-semibold text-bissap-800 hover:bg-bissap-200">
                    ❌ {nbRefusees} refusées
                  </button>
                )}
              </div>
              {filtre !== 'tous' && (
                <button onClick={() => setFiltre('tous')} className="text-xs font-semibold text-chaux-600 hover:text-nuit-700">
                  ← Voir tout
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filtrées.length === 0 && (
              <div className="rounded-[1.5rem] border border-dashed bg-white/60 p-10 text-center text-chaux-600">
                Aucune commande dans cette catégorie.
              </div>
            )}
            {filtrées.map((c, i) => (
              <div key={i + '-' + c.order_id} className={`rounded-[1.5rem] border bg-white/90 p-5 shadow-sm backdrop-blur-sm ${
                c.confirmation_statut === 'refusee' ? 'border-bissap-200 opacity-60' :
                c.confirmation_statut === 'confirmee' ? 'border-accent-200' :
                'border-[var(--hairline)]'
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-mangue-700">{c.order_id}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeColor(c)}`}>{statutLabel(c)}</span>
                      {badgeConfirmation(c)}
                      <span className="text-xs text-chaux-600">{canalIcon(c.canal)} {c.canal}</span>
                      <span className="text-xs text-chaux-600"><Clock className="inline h-3 w-3" /> {c.timestamp ? new Date(c.timestamp).toLocaleString('fr-FR') : '—'}</span>
                    </div>
                    <p className="text-base font-bold text-nuit-900">{c.customer_name}</p>
                    <p className="flex items-center gap-1 text-sm text-chaux-600"><Phone className="h-3 w-3" />{c.phone}</p>
                    <p className="flex items-center gap-1 text-sm text-chaux-600"><MapPin className="h-3 w-3" />{c.address}</p>
                    <div className="flex flex-wrap gap-2">
                      {parseItems(c.items).length === 0 ? (
                        <p className="text-sm text-chaux-600">📦 —</p>
                      ) : (
                        parseItems(c.items).map((it, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-mangue-200 bg-mangue-50 px-3 py-1 text-sm font-semibold text-mangue-700">
                            <span className="rounded-full bg-mangue-700 px-2 py-0.5 text-xs font-bold text-white">{it.q}×</span>
                            {it.plat}
                            {it.prix > 0 && <span className="text-mangue-600">· {(it.q * it.prix).toLocaleString('fr-FR')} F</span>}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-mangue-700">{c.total_price.toLocaleString('fr-FR')} F</p>
                    {/* Les frais du livreur, SOUS le total et jamais dedans :
                        le total est ce que le marchand encaisse, les frais vont
                        au livreur. Les additionner fausserait son chiffre
                        d'affaires. La ligne ne parait que si le livreur s'est
                        prononce — un « 0 F » se lirait « livraison offerte ». */}
                    {c.frais_livraison !== null && c.frais_livraison !== undefined && (
                      <p className="text-xs text-chaux-600">
                        🛵 Livraison {Number(c.frais_livraison).toLocaleString('fr-FR')} F
                      </p>
                    )}
                    {c.heure_livraison && <p className="text-xs text-accent-700">✅ {new Date(c.heure_livraison).toLocaleTimeString('fr-FR')}</p>}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  {/* Bouton Relancer uniquement pour les commandes en attente de confirmation */}
                  {!c.confirmation_statut && !/livr/i.test(c.statut_livraison) && (
                    <button
                      onClick={() => relancer(c.order_id)}
                      disabled={busy === c.order_id + 'relance'}
                      className="flex items-center gap-2 rounded-full bg-mangue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-mangue-700 disabled:opacity-50"
                    >
                      {busy === c.order_id + 'relance' ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Relancer le client
                    </button>
                  )}

                  {/* Refusée : verrouiller les actions de livraison */}
                  {c.confirmation_statut === 'refusee' && (
                    <span className="flex items-center gap-2 rounded-full bg-bissap-100 px-4 py-2 text-sm font-semibold text-bissap-700">
                      ❌ Ne pas préparer
                    </span>
                  )}

                  {/* Actions classiques (uniquement si confirmée ou sans suivi) */}
                  {c.confirmation_statut !== 'refusee' && !c.nom_livreur && !/livr/i.test(c.statut_livraison) && (
                    <button onClick={() => agir(c.order_id, 'acceptee')} disabled={busy === c.order_id + 'acceptee'}
                      className="flex items-center gap-2 rounded-full bg-nuit-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nuit-700 disabled:opacity-50">
                      <Handshake className="h-4 w-4" />Accepter
                    </button>
                  )}
                  {c.confirmation_statut !== 'refusee' && c.nom_livreur && !/route|part|cours|livr/i.test(c.statut_livraison) && (
                    <button onClick={() => agir(c.order_id, 'route')} disabled={busy === c.order_id + 'route'}
                      className="flex items-center gap-2 rounded-full bg-nuit-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nuit-700 disabled:opacity-50">
                      <Bike className="h-4 w-4" />En route
                    </button>
                  )}
                  {c.confirmation_statut !== 'refusee' && !/livr/i.test(c.statut_livraison) && (
                    <button onClick={() => agir(c.order_id, 'livree')} disabled={busy === c.order_id + 'livree'}
                      className="flex items-center gap-2 rounded-full bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">
                      <Check className="h-4 w-4" />Livrée
                    </button>
                  )}
                  {/livr/i.test(c.statut_livraison) && (
                    <span className="flex items-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-sm font-semibold text-accent-700">
                      <CheckCircle2 className="h-4 w-4" />Cycle terminé
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Recoit les alertes posees par l'abonnement temps reel ci-dessus. */}
      <NotificationToast />
    </div>
  );
}