-- Abonnements aux notifications push du navigateur.
--
-- Une ligne = un navigateur, pas un marchand : le meme marchand qui ouvre
-- DjiguiFlow sur son telephone et sur l'ordinateur de la boutique produit
-- deux abonnements, et une nouvelle commande doit sonner sur les deux.
--
-- La cle primaire est l'endpoint parce que c'est le navigateur qui la
-- fabrique et qui l'impose : reabonner un appareil deja connu doit mettre a
-- jour la ligne existante, pas en creer une seconde qui ferait sonner deux
-- fois le meme appareil.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- La boutique visee : c'est par elle que n8n choisit qui prevenir quand une
  -- commande tombe. Un compte peut posseder plusieurs boutiques, l'abonnement
  -- ne peut donc pas se contenter du user_id.
  boutique_id uuid not null references public.boutiques(id) on delete cascade,

  -- Les deux secrets de chiffrement fournis par le navigateur. Sans eux le
  -- message push ne peut pas etre scelle, et le navigateur le rejette.
  p256dh text not null,
  auth_secret text not null,

  -- Sert a nommer l'appareil dans les reglages : « Chrome sur Android ».
  user_agent text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Postgres n'indexe pas les cles etrangeres tout seul. Ces deux index
-- portent les deux seules lectures reelles : « les appareils de ce marchand »
-- et « les appareils a prevenir pour cette boutique ».
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_boutique_id_idx
  on public.push_subscriptions (boutique_id);

alter table public.push_subscriptions enable row level security;

-- Postgres ne supporte pas « create policy if not exists » : on drop d'abord.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;

-- `(select auth.uid())` et non `auth.uid()` : sous cette forme Postgres
-- evalue la fonction une fois pour la requete au lieu d'une fois par ligne.
create policy "push_subscriptions_select_own"
  on public.push_subscriptions
  for select
  using ((select auth.uid()) = user_id);

-- Aucune policy d'ecriture, volontairement. Toutes les ecritures passent par
-- /api/push/*, qui verifie avec la cle service_role que l'appelant possede
-- bien la boutique. Une policy insert avec la cle anon publique laisserait
-- n'importe qui s'abonner aux commandes d'une boutique qui n'est pas la
-- sienne — c'est-a-dire lire son activite en temps reel.
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
