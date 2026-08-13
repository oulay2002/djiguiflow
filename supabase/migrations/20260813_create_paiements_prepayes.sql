-- Registre des paiements prepayes.
--
-- Le Mobile Money ivoirien ne sait pas prelever tout seul : ni Orange, ni MTN,
-- ni Moov, ni Wave n'offrent de mandat recurrent fiable pour un petit
-- marchand. On ne vend donc pas un abonnement qui se reconduit, mais des
-- PERIODES achetees d'avance. Cette table est le journal de ces achats ;
-- `subscriptions` n'en garde que l'etat courant.

create table if not exists public.paiements (
  -- Notre identifiant de transaction, celui qu'on envoie au prestataire et
  -- qu'il nous renvoie. Cle primaire : une notification rejouee — et ils le
  -- font — ne doit ni creer une seconde ligne ni prolonger l'acces deux fois.
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

-- Postgres n'indexe pas les cles etrangeres tout seul. Ces deux index portent
-- les deux lectures reelles : l'historique d'un marchand, et la reprise des
-- paiements restes en attente.
create index if not exists paiements_user_id_idx on public.paiements (user_id);
create index if not exists paiements_statut_idx on public.paiements (statut);

alter table public.paiements enable row level security;

-- Postgres ne supporte pas « create policy if not exists » : on drop d'abord.
drop policy if exists "paiements_select_own" on public.paiements;

-- `(select auth.uid())` et non `auth.uid()` : sous cette forme Postgres evalue
-- la fonction une fois pour la requete au lieu d'une fois par ligne.
create policy "paiements_select_own"
  on public.paiements
  for select
  using ((select auth.uid()) = user_id);

-- Aucune policy d'ecriture, volontairement. Toutes les ecritures passent par
-- la cle service_role, et seulement apres verification de la transaction
-- aupres du prestataire. Une policy insert avec la cle anon publique
-- laisserait un marchand se declarer paye lui-meme.
drop policy if exists "paiements_insert_own" on public.paiements;
drop policy if exists "paiements_update_own" on public.paiements;
