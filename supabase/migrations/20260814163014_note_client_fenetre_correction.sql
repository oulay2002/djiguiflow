alter table public.commandes
  add column if not exists note_heure timestamptz;

comment on column public.commandes.note_heure is
  'Instant de la premiere note client. Sert de borne a la fenetre de correction ; nul pour les notes anterieures a la migration, qui sont definitives.';
