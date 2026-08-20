'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { fetchDashboard } from '@/lib/apiClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, Bell, Globe2, Package2, Send, ShoppingCart, ShoppingBag,
  Smartphone, Star, Trophy, Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CompteurQuota from '@/components/dashboard/CompteurQuota';
import ReglagePush from '@/components/pwa/ReglagePush';
import BoutonPause from '@/components/dashboard/BoutonPause';

type Stats = {
  caTotal: number; caJour: number; nbCommandes: number; nbJour: number;
  livrees: number; enCours: number; parCanal: Record<string, number>;
  noteMoyenne: number; nbNotes: number; topPlats: [string, number][];
  serie7j: { jour: string; ca: number; nb: number }[];
  produitsVendus: number; panierMoyen: number;
  /** Paniers composes puis abandonnes sur les 7 derniers jours. */
  paniersPerdus?: { nombre: number; valeur: number };
  /** Commandes WhatsApp dont le client n'a jamais confirme la reception. */
  confirmationsAttendues?: { nombre: number; valeur: number };
  /** Ce qui manque pour que la boutique puisse reellement servir un client. */
  configuration?: { canalClient: boolean; groupeLivreurs: boolean; catalogue: boolean } | null;
};

const canalMeta: Record<string, { label: string; icon: ComponentType<{ className?: string }>; txt: string; bar: string }> = {
  whatsapp: { label: 'WhatsApp', icon: Smartphone, txt: 'text-accent-700', bar: 'bg-accent-500' },
  telegram: { label: 'Telegram', icon: Send, txt: 'text-nuit-700', bar: 'bg-nuit-500' },
  app: { label: 'Application', icon: Globe2, txt: 'text-mangue-700', bar: 'bg-mangue-500' },
};

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [s, setS] = useState<Stats | null>(null);
  const { boutiqueId, boutiques, pret } = useBoutique();
  const nomBoutique = boutiques.find(b => b.id === boutiqueId)?.nom ?? 'DjiguiFlow';

  useEffect(() => {
    if (!pret) return;
    let isMounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (!user) { router.push('/login'); return; }
      try {
        const r = await fetchDashboard(avecBoutique('/api/dashboard/stats', boutiqueId));
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        if (isMounted) setS(d);
      } catch (e) {
        console.error('Chargement des statistiques :', e);
      }
      if (isMounted) setLoading(false);
    })();
    return () => { isMounted = false; };
  }, [router, pret, boutiqueId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  const serie = s?.serie7j ?? [];
  const W = 640, H = 240, P = 36;
  const max = Math.max(...serie.map(x => x.ca), 1);
  const pts = serie.map((x, i) => [
    P + (i * (W - 2 * P)) / Math.max(serie.length - 1, 1),
    H - P - (x.ca / max) * (H - 2 * P),
  ]);
  const line = pts.reduce((acc, p, i, a) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const cx = (a[i - 1][0] + p[0]) / 2;
    return `${acc} C${cx},${a[i - 1][1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }, '');
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H - P} L${pts[0][0]},${H - P} Z` : '';
  const totalCanal = s ? Object.values(s.parCanal).reduce((a, b) => a + b, 0) || 1 : 1;

  // `s` peut encore etre nul au premier rendu : on retient la mesure une fois
  // pour toutes plutot que de la reinterroger a chaque ligne du bloc.
  const perdus = s?.paniersPerdus ?? null;
  const attendues = s?.confirmationsAttendues ?? null;

  // Ce qui empeche la boutique de servir, nomme et ordonne par gravite. Un
  // marchand ne doit pas avoir a deviner pourquoi ses commandes n'aboutissent
  // pas — ni l'apprendre par un client mecontent.
  const manques = s?.configuration
    ? [
        !s.configuration.canalClient && {
          titre: 'Aucun canal connecté',
          detail: 'Vos clients ne recevront ni confirmation, ni suivi de livraison, ni demande d’avis.',
        },
        !s.configuration.groupeLivreurs && {
          titre: 'Aucun groupe de livreurs',
          detail: 'Les commandes ne seront proposées à personne pour la livraison.',
        },
        !s.configuration.catalogue && {
          titre: 'Aucun article en vente',
          detail: 'Votre vitrine est visible mais vide.',
        },
      ].filter(Boolean as unknown as (v: unknown) => v is { titre: string; detail: string })
    : [];

  const kpis = s ? [
    { label: 'Ventes du jour', value: `${s.caJour.toLocaleString('fr-FR')} F`, sub: `${s.nbJour} commande(s) aujourd'hui`, icon: Wallet, accent: 'bg-mangue-100 text-mangue-700' },
    { label: 'Commandes', value: String(s.nbCommandes), sub: `${s.enCours} en cours · ${s.livrees} livrées`, icon: ShoppingCart, accent: 'bg-nuit-100 text-nuit-700' },
    { label: 'Produits vendus', value: String(s.produitsVendus), sub: `panier moyen ${s.panierMoyen.toLocaleString('fr-FR')} F`, icon: Package2, accent: 'bg-nuit-100 text-nuit-700' },
    { label: 'Satisfaction', value: s.noteMoyenne ? `${s.noteMoyenne}/5` : '—', sub: `${s.nbNotes} avis clients`, icon: Star, accent: 'bg-accent-100 text-accent-700' },
  ] : [];

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <main className="min-w-0 space-y-6">
          <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_20px_60px_rgba(49,35,20,0.08)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-chaux-600">Tableau de bord · données réelles</p>
              <h1 className="mt-2 font-display text-3xl font-black">Bonjour, {nomBoutique}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] bg-chaux-50 text-chaux-600 hover:text-primary-700">
                <Bell className="h-5 w-5" />
              </button>
              <Link href="/boutiques" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
                Voir ma boutique <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </header>

          {/* L'invitation aux alertes, posee sur l'ACCUEIL et non dans un
              sous-menu de reglages. Toute la mecanique existait depuis
              longtemps — zero appareil etait abonne, parce que le reglage
              vivait a trois clics de profondeur. Une fonction qu'on ne trouve
              pas n'existe pas.

              Le composant se tait de lui-meme quand il n'y a rien a demander :
              deja actif, navigateur incapable, ou « plus tard » recent. */}
          <ReglagePush variante="invitation" />

          {/* La fermeture d'urgence est ici, en haut, parce qu'on ne la cherche
              pas : on en a besoin tout de suite, four en panne ou riz fini. */}
          <BoutonPause />

          <CompteurQuota />

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="rounded-[1.5rem] border border-white/70 bg-white/80 p-5 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${k.accent}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm text-chaux-600">{k.label}</p>
                  <p className="mt-1 text-3xl font-black text-nuit-900">{k.value}</p>
                  <p className="mt-1 text-xs text-chaux-600">{k.sub}</p>
                </div>
              );
            })}
          </section>

          {/* CE QU'ON A PERDU EN ROUTE.
              Un panier compose, un numero saisi, et puis rien. Le marchand
              n'avait aucun moyen de savoir que ces clients-la avaient existe.

              Affiche seulement s'il y en a : annoncer « 0 panier perdu » a un
              marchand qui debute, c'est du bruit deguise en information. */}
          {/* CE QUI EMPECHE DE VENDRE, AVANT TOUT LE RESTE.
              Une boutique peut etre en ligne sans etre branchee : vitrine
              visible, commandes acceptees, et personne au bout. Le marchand
              voyait une commande arriver et croyait tout en ordre. */}
          {manques.length > 0 && (
            <section className="rounded-[1.5rem] border border-bissap-200 bg-bissap-50 p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bissap-100 text-bissap-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-bissap-700">
                    Votre boutique ne peut pas encore servir une commande
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {manques.map(m => (
                      <li key={m.titre} className="text-sm text-bissap-600">
                        <span className="font-semibold">{m.titre}</span> — {m.detail}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/onboarding"
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-bissap-600 px-4 py-2 text-sm font-semibold text-white hover:bg-bissap-700"
                  >
                    Terminer le branchement <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>
          )}

          {((perdus?.nombre ?? 0) > 0 || (attendues?.nombre ?? 0) > 0) && (
            <section className="rounded-[1.5rem] border border-mangue-200 bg-mangue-50/70 p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mangue-100 text-mangue-700">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-3">
                  {/* Deux façons de perdre une vente au tout dernier mètre, et
                      le marchand ne voyait ni l’une ni l’autre. */}
                  {perdus && perdus.nombre > 0 && (
                    <div>
                      <p className="font-semibold text-mangue-700">
                        {perdus.nombre} panier{perdus.nombre > 1 ? 's' : ''} laissé
                        {perdus.nombre > 1 ? 's' : ''} en route cette semaine
                        {perdus.valeur > 0 && ` — ${perdus.valeur.toLocaleString('fr-FR')} F`}
                      </p>
                      <p className="text-sm text-mangue-600">
                        Ces clients ont composé leur commande et laissé leur numéro, sans valider.
                        Un prix, un délai ou des frais de livraison peuvent expliquer l’hésitation.
                      </p>
                    </div>
                  )}
                  {attendues && attendues.nombre > 0 && (
                    <div>
                      <p className="font-semibold text-mangue-700">
                        {attendues.nombre} commande{attendues.nombre > 1 ? 's' : ''} attend
                        {attendues.nombre > 1 ? 'ent' : ''} la réponse du client
                        {attendues.valeur > 0 && ` — ${attendues.valeur.toLocaleString('fr-FR')} F`}
                      </p>
                      <p className="text-sm text-mangue-600">
                        Le panier est prêt, il ne manque que sa confirmation. Un rappel lui est
                        envoyé automatiquement ; sans réponse sous 24 h, la commande est annulée.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <div className="rounded-[1.75rem] border border-[var(--hairline)] bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-chaux-600">Performance</p>
                  <h2 className="text-2xl font-black">Évolution du CA · 7 jours</h2>
                </div>
                <span className="rounded-full bg-mangue-100 px-3 py-1.5 text-sm font-bold text-mangue-700">
                  {s ? s.caTotal.toLocaleString('fr-FR') : 0} F au total
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                <defs>
                  <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c4123f" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#c4123f" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="gradLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#d85372" />
                    <stop offset="100%" stopColor="#a50e36" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map(t => (
                  <line key={t} x1={P} x2={W - P} y1={H - P - t * (H - 2 * P)} y2={H - P - t * (H - 2 * P)} stroke="#e0ddd3" strokeDasharray="4 6" />
                ))}
                <path d={area} fill="url(#gradArea)" />
                <path d={line} fill="none" stroke="url(#gradLine)" strokeWidth="3" strokeLinecap="round" />
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p[0]} cy={p[1]} r="5" fill="#fff" stroke="#c4123f" strokeWidth="3">
                      <title>{serie[i].jour} : {serie[i].ca.toLocaleString('fr-FR')} F · {serie[i].nb} cmd</title>
                    </circle>
                    <text x={p[0]} y={H - 8} textAnchor="middle" fontSize="11" fill="#837e70">{serie[i].jour}</text>
                  </g>
                ))}
              </svg>
              <p className="mt-2 text-xs text-chaux-600">Chaque point donne le détail de sa journée.</p>
            </div>

            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-[var(--hairline)] bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <h3 className="text-xl font-black">Canaux de vente</h3>
                <div className="mt-4 space-y-4">
                  {s && Object.entries(s.parCanal).map(([canal, nb]) => {
                    const m = canalMeta[canal] || { label: canal, icon: Globe2, txt: 'text-chaux-600', bar: 'bg-chaux-400' };
                    const Icon = m.icon;
                    const pct = Math.round((nb / totalCanal) * 100);
                    return (
                      <div key={canal}>
                        <div className="flex justify-between text-sm">
                          <span className={`flex items-center gap-2 font-semibold ${m.txt}`}><Icon className="h-4 w-4" />{m.label}</span>
                          <span className="font-bold">{nb} · {pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-chaux-100">
                          <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-[var(--hairline)] bg-white/80 p-6 shadow-[0_18px_45px_rgba(48,35,20,0.08)] backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-mangue-600" />
                  <h3 className="text-xl font-black">Top produits</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {s?.topPlats.slice(0, 4).map(([nom, q], i) => (
                    <div key={nom} className="flex items-center justify-between rounded-[1rem] bg-chaux-50 p-3">
                      <span className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${i === 0 ? 'bg-mangue-400 text-white' : 'bg-chaux-200 text-chaux-600'}`}>{i + 1}</span>
                        <span className="font-semibold text-nuit-800">{nom}</span>
                      </span>
                      <span className="text-sm font-bold text-chaux-600">{q} vendus</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}