create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_boutique_id_idx
  on public.push_subscriptions (boutique_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
