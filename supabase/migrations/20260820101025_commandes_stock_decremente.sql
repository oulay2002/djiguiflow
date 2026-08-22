-- LE STOCK NE SE DECOMPTAIT QUE SUR LA VITRINE.
--
-- Une commande prise par l'assistante — c'est-a-dire la majorite d'entre elles
-- — ne touchait pas au stock. Rose Monde a vendu 3 ensembles enfant : son stock
-- affichait toujours 12 sur 12. Le marchand devait refaire son inventaire a la
-- main apres chaque vente, ce qui vide de son sens le suivi de stock.
--
-- LE MARQUEUR EST LA CONDITION DU CORRECTIF. Le decompte doit se produire UNE
-- SEULE FOIS par commande, quel que soit le chemin qui l'a prise et quel que
-- soit le nombre de fois qu'on rejoue l'appel. Sans cette colonne, un reessai
-- de n8n — ou simplement deux clics du livreur — viderait le stock du marchand.
alter table public.commandes
  add column if not exists stock_decremente_le timestamptz;

comment on column public.commandes.stock_decremente_le is
  'Instant du decompte de stock. NULL = jamais decompte. Sert de verrou : le decompte se reserve par une ecriture conditionnelle sur cette colonne, jamais par une lecture prealable.';

-- La tache ne lit que ce qui la concerne.
create index if not exists commandes_stock_a_decompter_idx
  on public.commandes (boutique_id, created_at)
  where stock_decremente_le is null;
