'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { BILLING_PLANS, getBillingPlan, type PlanKey } from '@/lib/billing/plans';

type SubscriptionState = {
  user_id: string;
  plan_key: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  last_checkout_session_id: string;
  updated_at: string;
};

type ConfirmResponse = {
  persisted?: boolean;
  warning?: string;
  details?: string;
  subscription?: SubscriptionState;
};

type SubscriptionResponse = {
  subscription?: SubscriptionState | null;
  warning?: string;
  details?: string;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function formatDate(value: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getPlanLabel(planKey: string): string {
  return getBillingPlan(planKey)?.name ?? planKey;
}

export default function PaiementsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<PlanKey | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const confirmedSessionRef = useRef<string | null>(null);

  const selectedPlanFromQuery = useMemo(() => {
    const rawPlan = (searchParams.get('plan') ?? '').toLowerCase();
    const found = getBillingPlan(rawPlan);
    return found?.key ?? null;
  }, [searchParams]);

  const successParam = searchParams.get('success');
  const canceledParam = searchParams.get('canceled');
  const sessionIdParam = searchParams.get('session_id');
  const requiredParam = searchParams.get('required');
  const mockParam = searchParams.get('mock');
  const portalParam = searchParams.get('portal');

  const loadSubscription = async (accessToken: string) => {
    const response = await fetch('/api/billing/subscription', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = (await response.json()) as SubscriptionResponse;

    if (!response.ok) {
      throw new Error('Impossible de charger votre abonnement.');
    }

    if (data.warning) {
      setNotice((currentNotice) => currentNotice || data.warning || '');
    }

    setSubscription(data.subscription ?? null);
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?next=/dashboard/paiements');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;
        if (!accessToken) {
          router.push('/login?next=/dashboard/paiements');
          return;
        }

        if (requiredParam === '1' && isMounted) {
          setNotice('Votre abonnement est requis pour acceder a cette page. Choisissez une formule ci-dessous.');
        }

        if (mockParam === '1' && isMounted) {
          setNotice((currentNotice) =>
            currentNotice || 'Mode demo actif: aucun paiement reel ne sera effectue.',
          );
        }

        if (portalParam === '1' && isMounted) {
          setNotice((currentNotice) =>
            currentNotice || 'Portail de facturation simule ouvert (mode demo).',
          );
        }

        if (
          successParam === '1' &&
          sessionIdParam &&
          confirmedSessionRef.current !== sessionIdParam
        ) {
          confirmedSessionRef.current = sessionIdParam;

          const confirmResponse = await fetch('/api/billing/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ sessionId: sessionIdParam }),
          });

          const confirmData = (await confirmResponse.json()) as ConfirmResponse;

          if (!confirmResponse.ok) {
            throw new Error(confirmData.details || confirmData.warning || 'Verification du paiement echouee.');
          }

          if (confirmData.warning && isMounted) {
            setNotice(confirmData.warning);
          }

          if (isMounted) {
            setNotice((currentNotice) =>
              currentNotice || 'Paiement confirme. Votre abonnement est en cours de mise a jour.',
            );
          }
        }

        if (canceledParam === '1' && isMounted) {
          setNotice('Paiement annule. Vous pouvez reprendre quand vous voulez.');
        }

        await loadSubscription(accessToken);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : 'Une erreur est survenue.';
        if (isMounted) {
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const timerId = window.setTimeout(() => {
      void initialize();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [router, successParam, canceledParam, sessionIdParam, requiredParam, mockParam, portalParam]);

  const startCheckout = async (planKey: PlanKey) => {
    setProcessingPlan(planKey);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        router.push('/login?next=/dashboard/paiements');
        return;
      }

      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan: planKey }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Impossible de demarrer le paiement.');
      }

      window.location.assign(data.url);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Une erreur est survenue.';
      setError(message);
      setProcessingPlan(null);
    }
  };

  const openBillingPortal = async () => {
    setLoadingPortal(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        router.push('/login?next=/dashboard/paiements');
        return;
      }

      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Impossible d ouvrir le portail de facturation.');
      }

      window.location.assign(data.url);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Une erreur est survenue.';
      setError(message);
      setLoadingPortal(false);
    }
  };

  const isSubscriptionActive = subscription
    ? ACTIVE_STATUSES.has(subscription.status)
    : false;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(219,149,52,0.12),transparent_26%),linear-gradient(180deg,#fffdf9_0%,#f5efe5_100%)] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="stub group mb-3 inline-flex min-h-9 items-center gap-2 rounded-r-full bg-chaux-50/70 py-1.5 pl-3.5 pr-5 text-sm font-semibold text-nuit-600 hover:bg-chaux-50 hover:text-nuit-900"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
              Retour au dashboard
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-nuit-900">Abonnements et facturation</h1>
            <p className="mt-2 text-chaux-600">Activez votre formule, securisez vos paiements et gerez votre abonnement.</p>
          </div>
          <div className="hidden rounded-2xl border border-primary-200 bg-white/70 px-4 py-3 shadow-sm md:flex md:items-center md:gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-700" />
            <span className="text-sm font-semibold text-nuit-700">Paiement securise avec Stripe</span>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center rounded-[2rem] border border-white/70 bg-white/75 shadow-[0_18px_45px_rgba(49,35,20,0.1)]">
            <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-6 rounded-2xl border border-bissap-200 bg-bissap-50 px-5 py-4 text-sm font-medium text-bissap-700">
                {error}
              </div>
            )}

            {notice && (
              <div className="mb-6 rounded-2xl border border-mangue-200 bg-mangue-50 px-5 py-4 text-sm font-medium text-mangue-700">
                {notice}
              </div>
            )}

            <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_18px_45px_rgba(49,35,20,0.1)] backdrop-blur-xl">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-chaux-600">Votre abonnement</p>
                  <h2 className="mt-1 text-2xl font-black text-nuit-900">
                    {subscription ? getPlanLabel(subscription.plan_key) : 'Aucun abonnement actif'}
                  </h2>
                </div>
                {subscription && isSubscriptionActive && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-3 py-1.5 text-sm font-semibold text-accent-700">
                    <CheckCircle className="h-4 w-4" />
                    Actif
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-[var(--hairline)] bg-chaux-50 p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-chaux-600">Statut</p>
                  <p className="mt-2 text-lg font-bold capitalize text-nuit-900">{subscription?.status ?? '-'}</p>
                </div>
                <div className="rounded-2xl border border-[var(--hairline)] bg-chaux-50 p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-chaux-600">Debut periode</p>
                  <p className="mt-2 text-lg font-bold text-nuit-900">{formatDate(subscription?.current_period_start ?? null)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--hairline)] bg-chaux-50 p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-chaux-600">Fin periode</p>
                  <p className="mt-2 text-lg font-bold text-nuit-900">{formatDate(subscription?.current_period_end ?? null)}</p>
                </div>
              </div>

              {subscription?.stripe_customer_id && (
                <button
                  type="button"
                  onClick={openBillingPortal}
                  disabled={loadingPortal}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-white px-5 py-2.5 text-sm font-semibold text-nuit-700 transition hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Gerer ma facturation
                </button>
              )}
            </section>

            <section>
              <div className="mb-6 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary-700" />
                <h3 className="text-xl font-black text-nuit-900">Choisir une formule</h3>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {BILLING_PLANS.map((plan) => {
                  const isCurrentPlan = subscription?.plan_key === plan.key && isSubscriptionActive;
                  const isHighlighted = selectedPlanFromQuery === plan.key;

                  return (
                    <div
                      key={plan.key}
                      className={`rounded-[2rem] border p-6 ${
                        plan.popular
                          ? 'border-primary-500 bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-2xl shadow-primary-500/20'
                          : 'border-[var(--hairline)] bg-white/85 shadow-lg shadow-nuit-100'
                      } ${isHighlighted ? 'ring-2 ring-mangue-300' : ''}`}
                    >
                      {plan.popular && (
                        <p className="mb-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">
                          Plus populaire
                        </p>
                      )}

                      <h4 className="text-2xl font-black">{plan.name}</h4>
                      <p className={`${plan.popular ? 'mt-2 text-primary-100' : 'mt-2 text-chaux-600'}`}>
                        {plan.description}
                      </p>

                      <div className="mt-5 flex items-end gap-2">
                        <span className="text-4xl font-black">{plan.priceLabel}</span>
                        <span className={`${plan.popular ? 'text-primary-100' : 'text-chaux-600'} pb-1`}>
                          FCFA/mois
                        </span>
                      </div>

                      <ul className="mt-6 space-y-2.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2.5">
                            <CheckCircle className={`h-4.5 w-4.5 ${plan.popular ? 'text-mangue-200' : 'text-accent-600'}`} />
                            <span className={plan.popular ? 'text-white/90' : 'text-nuit-700'}>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        onClick={() => startCheckout(plan.key)}
                        disabled={processingPlan !== null || isCurrentPlan}
                        className={`mt-7 w-full rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          plan.popular
                            ? 'bg-white text-primary-700 hover:bg-primary-50'
                            : 'bg-primary-600 text-white hover:bg-primary-700'
                        }`}
                      >
                        {isCurrentPlan
                          ? 'Plan actif'
                          : processingPlan === plan.key
                            ? 'Redirection...'
                            : 'S abonner'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}