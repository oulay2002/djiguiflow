-- CE QU'ON PERD EN ROUTE, ET QU'ON NE VOYAIT PAS.
--
-- Un client remplit son panier, saisit son numero… et s'arrete. Aujourd'hui il
-- ne laisse AUCUNE TRACE : le marchand ne voit que ses ventes, jamais ses
-- quasi-ventes. Il ne peut donc ni savoir combien il en perd, ni pourquoi.
--
-- Attention a ce que cette table N'EST PAS : une liste de prospects a demarcher.
-- Un panier de la vitrine vient d'un client qui n'a JAMAIS ecrit sur WhatsApp —
-- lui envoyer un message serait exactement le premier contact non sollicite qui
-- fait bannir une session. La relance n'est legitime que si ce numero est deja
-- un client WhatsApp de la boutique. Ici on MESURE ; on ne demarche pas.
create table if not exists public.paniers (
  id          uuid        primary key default gen_random_uuid(),
  boutique_id uuid        not null references public.boutiques(id) on delete cascade,
  telephone   text        not null,
  nom         text,
  lignes      jsonb       not null default '[]'::jsonb,
  articles    integer     not null default 0,
  total       numeric     not null default 0,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  -- Rempli quand le panier devient une commande. Un panier converti n'est plus
  -- un panier perdu : sans cette colonne, le compteur mesurerait le trafic.
  converti_le timestamptz,
  commande_id uuid references public.commandes(id) on delete set null,
  unique (boutique_id, telephone)
);

create index if not exists paniers_abandonnes_idx
  on public.paniers (boutique_id, maj_le desc)
  where converti_le is null;

comment on table public.paniers is
  'Paniers de la vitrine saisis mais non valides. Sert a MESURER ce qui se perd dans le tunnel, pas a constituer une liste de demarchage.';

-- Personne n'y touche depuis le navigateur : l'ecriture passe par la route
-- serveur, qui valide, et la lecture par le tableau de bord du marchand.
alter table public.paniers enable row level security;

drop policy if exists paniers_lecture_marchand on public.paniers;
create policy paniers_lecture_marchand on public.paniers
  for select to authenticated
  using (exists (select 1 from public.boutiques b where b.id = paniers.boutique_id and b.user_id = auth.uid()));
