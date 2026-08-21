'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell, CreditCard, Gauge, LogOut, Menu, Package2, Rocket, Settings,
  ShoppingCart, Store, TrendingUp, Truck, Users, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Icone = ComponentType<{ className?: string }>;

type Entree = {
  label: string;
  href: string;
  icon: Icone;
  /** Court, pour tenir sous une icone dans la barre du bas. */
  court?: string;
};

/**
 * La liste de navigation, en un seul endroit.
 *
 * Elle vivait auparavant recopiee dans cinq pages. Les copies avaient deja
 * diverge : « Onboarding » n'existait que sur la vue d'ensemble, et l'ecran
 * Clients marquait « Vue d'ensemble » comme actif en dur. Un menu ne se
 * maintient pas a cinq exemplaires.
 */
export const ENTREES_NAV: Entree[] = [
  { label: "Vue d'ensemble", court: 'Accueil', href: '/dashboard', icon: Gauge },
  { label: 'Commandes', court: 'Commandes', href: '/dashboard/commandes', icon: ShoppingCart },
  { label: 'Produits', court: 'Produits', href: '/dashboard/products', icon: Package2 },
  { label: 'Clients', court: 'Clients', href: '/dashboard/customers', icon: Users },
  { label: 'Ma boutique', href: '/dashboard/ma-boutique', icon: Store },
  { label: 'Pilotage', href: '/dashboard/stats', icon: TrendingUp },
  { label: 'Livreurs', href: '/dashboard/livreurs', icon: Truck },
  { label: 'Paiements', href: '/dashboard/paiements', icon: CreditCard },
  { label: 'Notifications', href: '/dashboard/reglages/notifications', icon: Bell },
  { label: 'Réglages', href: '/dashboard/reglages', icon: Settings },
  { label: 'Branchement', href: '/onboarding', icon: Rocket },
];

/** Les quatre que le marchand ouvre plusieurs fois par jour. */
const RACCOURCIS_BAS = ENTREES_NAV.slice(0, 4);

/**
 * Chemin actif : le plus long prefixe qui corresponde.
 *
 * Une comparaison naive par `startsWith` allumerait « Réglages » en meme
 * temps que « Notifications », puisque /dashboard/reglages prefixe
 * /dashboard/reglages/notifications. On garde donc la correspondance la plus
 * specifique, et /dashboard n'est actif qu'exactement.
 */
function hrefActif(pathname: string): string | null {
  let meilleur: string | null = null;
  for (const { href } of ENTREES_NAV) {
    const correspond = href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    if (correspond && (meilleur === null || href.length > meilleur.length)) {
      meilleur = href;
    }
  }
  return meilleur;
}

function useDeconnexion() {
  const router = useRouter();
  return async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
}

/** Barre laterale, a partir de `lg`. Fixe : les pages gardent leur propre fond. */
function BarreLaterale({ actif }: { actif: string | null }) {
  const deconnecter = useDeconnexion();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-6 overflow-y-auto border-r border-[var(--hairline)] bg-white/80 p-5 backdrop-blur-xl lg:flex">
      <Link href="/dashboard" className="flex items-center gap-3 px-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-nuit-900 font-display text-lg font-black text-mangue-300">
          D
        </span>
        <span>
          <span className="block font-display text-lg font-black">DjiguiFlow</span>
          <span className="block font-mono text-xs uppercase tracking-[0.2em] text-chaux-600">
            Espace marchand
          </span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1.5">
        {ENTREES_NAV.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={href === actif ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
              href === actif
                ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
                : 'text-chaux-600 hover:bg-chaux-100'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <button
        onClick={deconnecter}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--hairline)] bg-chaux-50 px-4 py-3 text-sm font-semibold hover:bg-chaux-100"
      >
        <LogOut className="h-4 w-4" />
        Déconnexion
      </button>
    </aside>
  );
}

/**
 * Tiroir « Plus », sous `lg`.
 *
 * La barre du bas ne tient que quatre destinations ; les sept autres vivent
 * ici. Le tiroir monte du bas, la ou se trouve le pouce.
 */
function Tiroir({ actif, ouvert, fermer }: { actif: string | null; ouvert: boolean; fermer: () => void }) {
  const deconnecter = useDeconnexion();

  // Un tiroir ouvert laissait la page defiler derriere lui.
  useEffect(() => {
    if (!ouvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = precedent;
    };
  }, [ouvert]);

  // La touche Echap ferme, comme n'importe quelle surface modale.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert, fermer]);

  if (!ouvert) return null;

  const reste = ENTREES_NAV.filter((e) => !RACCOURCIS_BAS.includes(e));

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Fermer le menu"
        onClick={fermer}
        className="absolute inset-0 h-full w-full bg-nuit-900/50 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[2rem] border-t border-[var(--hairline)] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(12,18,41,0.25)]"
      >
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-chaux-200" />

        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-black">Menu</p>
          <button
            onClick={fermer}
            aria-label="Fermer le menu"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] bg-chaux-50 text-chaux-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="grid grid-cols-2 gap-2.5">
          {reste.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={fermer}
              aria-current={href === actif ? 'page' : undefined}
              className={`flex min-h-[3.5rem] items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition ${
                href === actif
                  ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg'
                  : 'bg-chaux-50 text-chaux-600 active:bg-chaux-100'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="leading-tight">{label}</span>
            </Link>
          ))}
        </nav>

        <button
          onClick={deconnecter}
          className="mt-4 flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-2xl border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm font-semibold text-bissap-700"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </div>
  );
}

/** Barre du bas, sous `lg` : quatre raccourcis et l'acces au reste. */
function BarreBas({ actif, ouvrir }: { actif: string | null; ouvrir: () => void }) {
  const dansLeTiroir = actif !== null && !RACCOURCIS_BAS.some((e) => e.href === actif);

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--hairline)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {RACCOURCIS_BAS.map(({ court, label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={href === actif ? 'page' : undefined}
          // 3.5rem de haut : au-dessus du seuil de 44px sous lequel une cible
          // se rate au pouce.
          className={`flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.65rem] font-semibold transition ${
            href === actif ? 'text-primary-700' : 'text-chaux-500'
          }`}
        >
          <Icon className="h-5 w-5" />
          <span className="leading-none">{court ?? label}</span>
        </Link>
      ))}

      <button
        onClick={ouvrir}
        aria-label="Ouvrir le menu"
        className={`flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.65rem] font-semibold transition ${
          dansLeTiroir ? 'text-primary-700' : 'text-chaux-500'
        }`}
      >
        <Menu className="h-5 w-5" />
        <span className="leading-none">Plus</span>
      </button>
    </nav>
  );
}

/**
 * Coque de navigation du tableau de bord.
 *
 * Montee une fois dans `dashboard/layout.tsx`. La barre laterale est `fixed`
 * a dessein : chaque page porte son propre fond et son `min-h-screen`, et
 * les laisser tels quels evitait de reecrire quatorze racines de page.
 */
export default function NavigationDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const actif = hrefActif(pathname ?? '');

  // On memorise la page depuis laquelle le tiroir a ete ouvert, plutot qu'un
  // simple booleen remis a false par un effet sur `pathname`. Le tiroir se
  // referme alors de lui-meme des que la page change — y compris sur un retour
  // navigateur — sans effet de synchronisation ni rendu en cascade.
  const [ouvertDepuis, setOuvertDepuis] = useState<string | null>(null);
  const tiroirOuvert = ouvertDepuis !== null && ouvertDepuis === pathname;

  const fermerTiroir = useCallback(() => setOuvertDepuis(null), []);

  return (
    <>
      <BarreLaterale actif={actif} />
      {/* `coque-dashboard` reserve la place de la barre du bas sans creer de
          defilement vide — voir globals.css. */}
      <div className="coque-dashboard lg:pl-72">{children}</div>
      <BarreBas actif={actif} ouvrir={() => setOuvertDepuis(pathname ?? '')} />
      <Tiroir actif={actif} ouvert={tiroirOuvert} fermer={fermerTiroir} />
    </>
  );
}
