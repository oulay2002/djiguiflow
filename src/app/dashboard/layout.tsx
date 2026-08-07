'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isMockBillingMode } from '@/lib/billing/mode';
import { BoutiqueProvider } from '@/lib/boutique';
import SelecteurBoutique from '@/components/SelecteurBoutique';
import AjouterMarchand from '@/components/AjouterMarchand';

type SubscriptionState = {
  status: string;
};

type SubscriptionResponse = {
  subscription?: SubscriptionState | null;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
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

        // 🔑 Le propriétaire n'est JAMAIS bloqué par son propre paywall
                const OWNER_EMAILS = new Set([
          'oulay2002@gmail.com',
        ]);

        if (OWNER_EMAILS.has((user.email ?? '').toLowerCase())) {
          if (isMounted) {
            setAllowed(true);
          }
          return;
        }

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

        const status = data.subscription?.status ?? null;
        if (!status || !ACTIVE_STATUSES.has(status)) {
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <LockKeyhole className="h-6 w-6" />}
          </div>
          <p className="text-sm font-semibold text-slate-700">
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
      {children}
    </BoutiqueProvider>
  );
}
