create table if not exists public.paiements (
  -- Notre identifiant de transaction, celui qu'on envoie au prestataire et
  -- qu'il nous renvoie. Unique : une notification rejouee ne doit pas creer
  -- une seconde ligne ni prolonger la periode deux fois.
  reference text primary key,

  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null,
  mois integer not null check (mois > 0),
  montant_fcfa integer not null check (montant_fcfa >= 0),

  -- en_attente -> paye | echoue. Seul « paye » prolonge l'acces.
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'paye', 'echoue')),

  -- Renseignes a la verification : par quel canal le marchand a paye.
  operateur text,
  jeton_prestataire text,

  created_at timestamptz not null default now(),
  paye_le timestamptz
);

create index if not exists paiements_user_id_idx on public.paiements (user_id);
create index if not exists paiements_statut_idx on public.paiements (statut);

alter table public.paiements enable row level security;

drop policy if exists "paiements_select_own" on public.paiements;

-- Le marchand voit ses propres paiements ; il n'en ecrit aucun.
-- `(select auth.uid())` et non `auth.uid()` : evalue une fois par requete.
create policy "paiements_select_own"
  on public.paiements
  for select
  using ((select auth.uid()) = user_id);

-- Aucune policy d'ecriture, volontairement : toutes les ecritures passent par
-- la cle service_role, apres verification de la transaction aupres du
-- prestataire. Une policy insert avec la cle anon publique laisserait un
-- marchand se declarer paye.
drop policy if exists "paiements_insert_own" on public.paiements;
drop policy if exists "paiements_update_own" on public.paiements;
