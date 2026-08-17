-- Resolution du contexte a partir d'une commande : les workflows de
-- notification connaissent la commande, pas toujours la boutique.
-- Comme les autres fonctions de contexte, elle ne renvoie aucun jeton.

create or replace function public.canaux_par_commande(p_commande text)
returns table (
  boutique_id     uuid,
  slug            text,
  nom             text,
  sheet_commandes text,
  sheet_menu      text,
  groupe_livreurs text,
  telephone       text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.id::text = p_commande or c.reference = p_commande
   limit 1;
$$;

revoke all on function public.canaux_par_commande(text) from public, anon, authenticated;
grant execute on function public.canaux_par_commande(text) to service_role;
