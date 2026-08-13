'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isMockBillingMode } from '@/lib/billing/mode';
import { BoutiqueProvider } from '@/lib/boutique';
import SelecteurBoutique from '@/components/SelecteurBoutique';
import AjouterMarchand from '@/components/AjouterMarchand';
import NavigationDashboard from '@/components/dashboard/NavigationDashboard';
import InvitationInstallation from '@/components/pwa/InvitationInstallation';

type SubscriptionState = {
  status: string;
};

type SubscriptionResponse = {
  subscription?: SubscriptionState | null;
  /** Verdict calcule par le serveur : statut ouvrant ET periode non echue. */
  actif?: boolean;
};
const ALLOWED_WITHOUT_SUBSCRIPTION = ['/dashboard/paiements'];

function needsSubscription(pathname: string): boolean {
  return !ALLOWED_WITHOUT_SUBSCRIPTION.some((allowedPath) => pathname.startsWith(allowedPath));
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const enforceAccess = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

                if (!user) {
          const loginNext = encodeURIComponent(pathname || '/dashboard');
          router.replace(`/login?next=${loginNext}`);
          return;
        }

        // L'exemption « equipe DjiguiFlow » ne se decide plus ici : la liste
        // d'emails partait dans le bundle public. C'est desormais
        // /api/billing/subscription qui la tranche a partir d'ADMIN_EMAILS et
        // renvoie un statut actif.

        if (isMockBillingMode()) {
          if (isMounted) {
            setAllowed(true);
          }
          return;
        }

        if (!needsSubscription(pathname)) {
          if (isMounted) {
            setAllowed(true);
          }
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;
        if (!accessToken) {
          const loginNext = encodeURIComponent(pathname || '/dashboard');
          router.replace(`/login?next=${loginNext}`);
          return;
        }

        const response = await fetch('/api/billing/subscription', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = (await response.json()) as SubscriptionResponse;

        // On lit le verdict du serveur, pas le statut brut : lui seul tient
        // compte de la date de fin de periode. Rejouer la regle ici, c'etait
        // se condamner a l'oublier — ce qui est arrive : le statut suffisait,
        // et un acces echu restait ouvert.
        if (!data.actif) {
          const fromPath = encodeURIComponent(pathname || '/dashboard');
          router.replace(`/dashboard/paiements?required=1&from=${fromPath}`);
          return;
        }

        if (isMounted) {
          setAllowed(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const timerId = window.setTimeout(() => {
      void enforceAccess();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [router, pathname]);

  if (loading || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f4ec] p-6">
        <div className="rounded-3xl border border-white/70 bg-white/80 px-8 py-7 text-center shadow-[0_18px_45px_rgba(49,35,20,0.1)] backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-mangue-100 text-mangue-700">
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <LockKeyhole className="h-6 w-6" />}
          </div>
          <p className="text-sm font-semibold text-nuit-700">
            {loading ? 'Verification de votre acces...' : 'Redirection vers les abonnements...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <BoutiqueProvider>
      <SelecteurBoutique />
      <AjouterMarchand />
      <NavigationDashboard>{children}</NavigationDashboard>
      {/* Proposee au marchand connecte seulement : un visiteur de la vitrine
          n'a rien a installer. */}
      <InvitationInstallation />
    </BoutiqueProvider>
  );
}
