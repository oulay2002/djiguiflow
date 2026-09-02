'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import { fetchDashboard } from '@/lib/apiClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, Bell, Globe2, Package2, Send, ShoppingCart, ShoppingBag,
  Smartphone, Star, Trophy, Wallet,
  Store,
} from 'lucide-react';
import { utilisateurCourant } from '@/lib/supabase';
import CompteurQuota from '@/components/dashboard/CompteurQuota';
import ReglagePush from '@/components/pwa/ReglagePush';
import BoutonPause from '@/components/dashboard/BoutonPause';

type Stats = {
  caTotal: number; caJour: number; nbCommandes: number; nbJour: number;
  livrees: number; enCours: number; parCanal: Record<string, number>;
  noteMoyenne: number; nbNotes: number; topPlats: [string, number][];
  serie7j: { jour: string; ca: number; nb: number }[];
  /** La somme des points ci-dessus. Ne jamais la recalculer ici. */
  caSerie7j: number;
  produitsVendus: number; panierMoyen: number;
  /** Paniers composes puis abandonnes sur les 7 derniers jours. */
  paniersPerdus?: { nombre: number; valeur: number };
  /** Commandes WhatsApp dont le client n'a jamais confirme la reception. */
  confirmationsAttendues?: { nombre: number; valeur: number };
  /** Ce qui manque pour que la boutique puisse reellement servir un client. */
  configuration?: {
    canalClient: boolean;
    groupeLivreurs: boolean;
    /** La boutique livre-t-elle ? Faux = retrait seul, aucun livreur attendu. */
    livre: boolean;
    catalogue: boolean;
  } | null;
  /**
   * Ce que la vitrine ne dit pas encore au CLIENT. Distinct de
   * `configuration`, qui dit ce qui empeche la boutique de servir : ici la
   * chaine tourne, mais la page ne repond a aucune question.
   */
  vitrine?: {
    posees: number;
    total: number;
    manquantes: { cle: string; question: string; sinon: string }[];
  } | null;
};

const canalMeta: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  whatsapp: { label: 'WhatsApp', icon: Smartphone },
  telegram: { label: 'Telegram', icon: Send },
  app: { label: 'Application', icon: Globe2 },
};

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [s, setS] = useState<Stats | null>(null);
  /** La lecture des statistiques a-t-elle echoue ? Distinct de « pas encore de boutique ». */
  const [panne, setPanne] = useState(false);
  const { boutiqueId, boutiques, pret } = useBoutique();
  const nomBoutique = boutiques.find(b => b.id === boutiqueId)?.nom ?? 'DjiguiFlow';

  useEffect(() => {
    if (!pret) return;
    let isMounted = true;
    (async () => {
      const user = await utilisateurCourant();
      if (!isMounted) return;
      if (!user) { router.push('/login'); return; }
      try {
        const r = await fetchDashboard(avecBoutique('/api/dashboard/stats', boutiqueId));
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        if (isMounted) setS(d);
      } catch (e) {
        /**
         * UN TABLEAU DE BORD VIDE N EST PAS UN TABLEAU DE BORD A ZERO.
         *
         * `s` restait `null` : KPIs vides, courbe plate, « 0 F au total » -- et
         * AUCUN message. Pire, le bandeau rouge « votre boutique ne peut pas
         * encore servir une commande » est calcule sur `s.configuration` :
         * il s eteignait precisement quand le diagnostic devenait illisible.
         *
         * L absence de boutique, elle, reste couverte par `SansBoutique`.
         */
        console.error('Chargement des statistiques :', e);
        if (isMounted) setPanne(true);
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
  const W = 360, H = 200, P = 28;
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
        // ON NE RECLAME UN LIVREUR QU'A QUI LIVRE. Une boutique de retrait
        // n'aura jamais de groupe : ce bandeau rouge lui aurait annonce une
        // panne permanente, pour un champ qui n'a aucun sens chez elle.
        s.configuration.livre && !s.configuration.groupeLivreurs && {
          titre: 'Aucun groupe de livreurs',
          detail: 'Les commandes ne seront proposées à personne pour la livraison.',
        },
        !s.configuration.catalogue && {
          titre: 'Aucun article en vente',
          detail: 'Votre vitrine est visible mais vide.',
        },
      ].filter(Boolean as unknown as (v: unknown) => v is { titre: string; detail: string })
    : [];

  /**
   * CE QUI EMPECHE DE VENDRE, A COTE DE CE QUI EMPECHE DE SERVIR.
   *
   * `manques` ci-dessus liste ce qui casse la chaine : sans canal, sans
   * livreur, sans article, rien n'aboutit. Celui-ci est d'une autre nature —
   * la boutique fonctionne, mais elle ne repond a aucune question du client.
   *
   * DEUX BLOCS ET NON UN SEUL, parce que la gravite n'est pas la meme. Les
   * melanger ferait lire « il manque quatre choses » a un marchand dont la
   * chaine tourne : il cesserait de distinguer l'urgent du souhaitable, et
   * finirait par ne plus lire ni l'un ni l'autre.
   */
  const aCompleter = s?.vitrine?.manquantes ?? [];

  const kpis = s ? [
    { label: 'Ventes du jour', value: `${s.caJour.toLocaleString('fr-FR')} F`, sub: `${s.nbJour} commande(s) aujourd'hui`, icon: Wallet },
    { label: 'Commandes', value: String(s.nbCommandes), sub: `${s.enCours} en cours · ${s.livrees} livrées`, icon: ShoppingCart },
    { label: 'Produits vendus', value: String(s.produitsVendus), sub: `panier moyen ${s.panierMoyen.toLocaleString('fr-FR')} F`, icon: Package2 },
    { label: 'Satisfaction', value: s.noteMoyenne ? `${s.noteMoyenne}/5` : '—', sub: `${s.nbNotes} avis clients`, icon: Star },
  ] : [];

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 lg:p-6">
      {/* Sans ce bandeau, une lecture en echec donnait un tableau de bord a zero
          -- indiscernable d une journee sans vente -- et faisait DISPARAITRE
          l alerte de configuration, qui se calcule sur les memes donnees. */}
      {panne && (
        <div role="alert" className="mb-4 border border-bissap-300 bg-bissap-50 px-4 py-3">
          <p className="text-sm font-bold text-nuit-900">
            Vos chiffres n’ont pas pu être chargés.
          </p>
          <p className="mt-1 text-sm text-chaux-600">
            Ce que vous voyez ci-dessous est incomplet — ce ne sont pas vos vrais
            résultats. Rafraîchissez la page dans un instant.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-[1600px]">
        <main id="contenu" className="min-w-0 space-y-6">
          <header className="flex flex-col gap-4 border border-[var(--hairline)] bg-white p-5 soft-shadow md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-chaux-600">Votre boutique aujourd’hui</p>
              <h1 className="mt-2 font-display text-3xl font-black">Bonjour, {nomBoutique}</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/reglages/notifications"
                aria-label="Reglages des notifications"
                className="flex h-11 w-11 items-center justify-center border border-[var(--hairline)] bg-chaux-50 text-chaux-600 hover:text-primary-700"
              >
                <Bell aria-hidden className="h-5 w-5" />
              </Link>
              <Link href="/boutiques" className="inline-flex items-center gap-2 bg-nuit-900 px-4 py-2.5 text-sm font-semibold text-white soft-shadow hover:bg-nuit-800">
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
            {/* LA TUILE NE PORTE PLUS DE TEINTE, et ce n'est pas une question
                de gout. La palette de la maison est SEMANTIQUE : mangue veut
                dire « en cours, a surveiller », feuille veut dire « confirme,
                encaisse ». Ces quatre tuiles les depensaient en decoration, et
                deux disaient quelque chose de FAUX — mangue sur les ventes du
                jour lisait « a surveiller » tous les jours, feuille sur la
                satisfaction lisait « encaisse ».

                Et surtout : la couleur d'alerte ne fonctionne que si elle est
                RARE. Quatre tuiles teintees en permanence, juste au-dessus d'un
                bandeau bissap qui signale une boutique mal branchee, diluent
                exactement le signal qu'on veut voir. C'est un argument de
                fonctionnement, pas d'esthetique.

                Le releve se hierarchise par la typographie — la valeur est en
                `text-3xl font-black` — et la couleur reste disponible pour
                quand il y a quelque chose a dire. */}
            {kpis.map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className=" border border-[var(--hairline)] bg-white p-5 soft-shadow">
                  <div className="flex h-12 w-12 items-center justify-center bg-chaux-100 text-nuit-700">
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
          {/* CALME, PAS ROUGE. Le bandeau bissap au-dessus annonce une panne :
              la chaine ne sert pas. Celui-ci annonce un manque a gagner — la
              boutique tourne, mais elle ne repond pas au client. Lui donner la
              meme couleur ferait lire deux urgences la ou il n'y en a qu'une,
              et le marchand finirait par n'en lire aucune. */}
          {aCompleter.length > 0 && (
            <section className="border border-chaux-200 bg-chaux-100 p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-chaux-200 text-nuit-700">
                  <Store className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-nuit-800">
                    Votre vitrine ne répond pas encore à {aCompleter.length === 1
                      ? 'une question'
                      : `${aCompleter.length} questions`} que se pose le client
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {aCompleter.map(m => (
                      <li key={m.cle} className="text-sm text-chaux-600">
                        {/* La QUESTION en avant, jamais le nom du champ : le
                            marchand ne remplit pas « delai_livraison », il
                            repond a « en combien de temps livrez-vous ? ». */}
                        <span className="font-semibold text-nuit-700">{m.question}</span>
                        {' '}{m.sinon}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/dashboard/ma-boutique"
                    className="mt-3 inline-flex items-center gap-2 bg-nuit-800 px-4 py-2 text-sm font-semibold text-chaux-50 hover:bg-nuit-700"
                  >
                    Compléter ma vitrine <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>
          )}

          {manques.length > 0 && (
            <section className=" border border-bissap-200 bg-bissap-50 p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-bissap-100 text-bissap-700">
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
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 bg-bissap-600 px-4 py-2 text-sm font-semibold text-white hover:bg-bissap-700"
                  >
                    Terminer le branchement <ArrowRight className="h-4 w-4" />
                  </Link>
                  {/* Certains veulent agir, d'autres veulent d'abord comprendre.
                      Ne proposer que le formulaire laisse les seconds bloques. */}
                  <a
                    href="/aide/brancher"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-bissap-800 underline underline-offset-4 hover:text-bissap-900"
                  >
                    Lire le guide
                  </a>
                  </div>
                </div>
              </div>
            </section>
          )}

          {((perdus?.nombre ?? 0) > 0 || (attendues?.nombre ?? 0) > 0) && (
            <section className=" border border-mangue-200 bg-mangue-50/70 p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-mangue-100 text-mangue-700">
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
            <div className=" border border-[var(--hairline)] bg-white p-6 soft-shadow">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-chaux-600">Performance</p>
                  <h2 className="text-2xl font-black">Évolution du CA · 7 jours</h2>
                </div>
                {/* IL DISAIT « AU TOTAL » ET MONTRAIT `caTotal` — toutes les
                    commandes depuis l'ouverture — au-dessus d'une courbe de
                    sept jours. Mesure du 2 septembre 2026 : bandeau a
                    29 500 F, courbe plate a zero. Le marchand lisait deux
                    nombres contradictoires dans la meme carte.

                    C'est le chiffre sur lequel un commercant juge sa semaine :
                    gonfle par son historique, il masque une semaine creuse —
                    exactement le moment ou il faudrait qu'il s'en apercoive.

                    Le total vient desormais de la SOMME DES POINTS DESSINES,
                    et ne peut donc plus diverger de la courbe. Le CA depuis le
                    debut reste lisible sur l'ecran Statistiques, ou il porte
                    son vrai nom. */}
                <span className=" bg-mangue-100 px-3 py-1.5 text-sm font-bold text-mangue-700">
                  {s ? s.caSerie7j.toLocaleString('fr-FR') : 0} F sur 7 jours
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                <defs>
                  <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-bissap-500)" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="var(--color-bissap-500)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map(t => (
                  <line key={t} x1={P} x2={W - P} y1={H - P - t * (H - 2 * P)} y2={H - P - t * (H - 2 * P)} stroke="var(--color-chaux-200)" strokeDasharray="4 6" />
                ))}
                <path d={area} fill="url(#gradArea)" />
                <path d={line} fill="none" stroke="var(--color-bissap-500)" strokeWidth="3" strokeLinecap="butt" />
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p[0]} cy={p[1]} r="5" fill="#fff" stroke="var(--color-bissap-500)" strokeWidth="3">
                      <title>{serie[i].jour} : {serie[i].ca.toLocaleString('fr-FR')} F · {serie[i].nb} cmd</title>
                    </circle>
                    <text x={p[0]} y={H - 8} textAnchor="middle" fontSize="13" fill="var(--color-chaux-500)">{serie[i].jour}</text>
                  </g>
                ))}
              </svg>
              <p className="mt-2 text-xs text-chaux-600">Chaque point donne le détail de sa journée.</p>
            </div>

            <div className="space-y-6">
              <div className=" border border-[var(--hairline)] bg-white p-6 soft-shadow">
                <h3 className="text-xl font-black">Canaux de vente</h3>
                <div className="mt-4 space-y-4">
                  {/* Le reste de la page gere tres bien le vide ; ces deux
                      cadres rendaient un titre et une boite blanche. */}
                  {s && Object.keys(s.parCanal).length === 0 && (
                    <p className="text-sm text-chaux-600">
                      Vos canaux apparaîtront ici après votre première commande.
                    </p>
                  )}
                  {s && Object.entries(s.parCanal).map(([canal, nb]) => {
                    const m = canalMeta[canal] || { label: canal, icon: Globe2 };
                    const Icon = m.icon;
                    const pct = Math.round((nb / totalCanal) * 100);
                    return (
                      <div key={canal}>
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2 font-semibold text-nuit-800"><Icon className="h-4 w-4 text-chaux-600" aria-hidden />{m.label}</span>
                          <span className="font-bold">{nb} · {pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2.5 overflow-hidden bg-chaux-100">
                          <div className="h-full bg-bissap-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className=" border border-[var(--hairline)] bg-white p-6 soft-shadow">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-mangue-600" />
                  <h3 className="text-xl font-black">Top produits</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {s && s.topPlats.length === 0 && (
                    <p className="text-sm text-chaux-600">
                      Vos meilleures ventes apparaîtront ici dès les premières commandes.
                    </p>
                  )}
                  {s?.topPlats.slice(0, 4).map(([nom, q], i) => (
                    <div key={nom} className="flex items-center justify-between bg-chaux-50 p-3">
                      <span className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 items-center justify-center text-xs font-black ${i === 0 ? 'bg-mangue-400 text-white' : 'bg-chaux-200 text-chaux-600'}`}>{i + 1}</span>
                        <span className="font-semibold text-nuit-800">{nom}</span>
                      </span>
                      <span className="text-sm font-bold text-chaux-600">{q} vendu{q > 1 ? 's' : ''}</span>
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