create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null,
  status text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  last_checkout_session_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;

create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "subscriptions_insert_own" on public.subscriptions;
drop policy if exists "subscriptions_update_own" on public.subscriptions;

create unique index if not exists subscriptions_stripe_customer_id_uidx
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists subscriptions_stripe_subscription_id_uidx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
