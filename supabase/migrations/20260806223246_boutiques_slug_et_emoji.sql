-- L'application adresse les boutiques par slug (/boutiques/zahara), pas par
-- uuid. Sans cette colonne, impossible de remplacer le registre Sheets
-- (onglet Marchands) par les tables Supabase.
alter table public.boutiques
  add column if not exists slug text,
  add column if not exists emoji text;

comment on column public.boutiques.slug is
  'Identifiant lisible utilise dans les URL publiques (/boutiques/<slug>) et dans le champ boutique_id des webhooks n8n.';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'boutiques_slug_unique'
                   and conrelid = 'public.boutiques'::regclass) then
    alter table public.boutiques add constraint boutiques_slug_unique unique (slug);
  end if;
end $$;

create index if not exists idx_boutiques_slug on public.boutiques (slug) where slug is not null;

update public.boutiques set slug = 'zahara', emoji = '🍕'
where id = '11111111-1111-1111-1111-111111111111' and slug is distinct from 'zahara';

update public.boutiques set slug = 'rosemonde', emoji = '🌹'
where id = 'a9ace83e-c545-4c9c-bfb5-dc29cceb5282' and slug is distinct from 'rosemonde';
