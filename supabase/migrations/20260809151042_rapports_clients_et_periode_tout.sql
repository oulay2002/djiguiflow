-- Le tableau de bord Telegram du gerant a deux besoins que les rapports ne
-- couvraient pas : le classement des clients, et un cumul depuis l'origine.

drop function if exists public.rapport_activite(text);
drop function if exists public.rapport_top_plats(text);

-- `p_periode` vaut 'jour', 'semaine' ou 'tout'.
create or replace function public.borne_periode(p_periode text)
returns timestamptz
language sql immutable
as $$
  select case p_periode
           when 'tout'    then '-infinity'::timestamptz
           when 'semaine' then now() - interval '7 days'
           else date_trunc('day', now())
         end;
$$;

create function public.rapport_activite(p_periode text default 'jour')
returns table (
  slug text, boutique_nom text, commandes int, livrees int, annulees int,
  ca numeric, panier_moyen numeric, note_moyenne numeric, avis int
)
language sql stable security definer set search_path = public
as $$
  select b.slug, b.nom,
         count(*) filter (where c.statut <> 'annulee')::int,
         count(*) filter (where c.statut =  'livree')::int,
         count(*) filter (where c.statut =  'annulee')::int,
         coalesce(sum(c.total) filter (where c.statut <> 'annulee'), 0),
         case when count(*) filter (where c.statut <> 'annulee') > 0
              then round(coalesce(sum(c.total) filter (where c.statut <> 'annulee'), 0)
                         / count(*) filter (where c.statut <> 'annulee'))
              else 0 end,
         round(avg(c.note_client) filter (where c.note_client is not null), 1),
         count(c.note_client)::int
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.created_at >= public.borne_periode(p_periode)
     and c.statut <> 'panier'
   group by b.slug, b.nom
   order by b.nom;
$$;

create function public.rapport_top_plats(p_periode text default 'jour')
returns table (slug text, boutique_nom text, produit text, quantite int)
language sql stable security definer set search_path = public
as $$
  select b.slug, b.nom, ci.nom_produit, sum(ci.quantite)::int
    from public.commande_items ci
    join public.commandes c on c.id = ci.commande_id
    join public.boutiques b on b.id = c.boutique_id
   where c.created_at >= public.borne_periode(p_periode)
     and c.statut not in ('annulee', 'panier')
   group by b.slug, b.nom, ci.nom_produit
   order by b.nom, 4 desc;
$$;

create or replace function public.rapport_clients(p_periode text default 'jour')
returns table (slug text, boutique_nom text, client text, telephone text, commandes int, total numeric)
language sql stable security definer set search_path = public
as $$
  select b.slug, b.nom,
         coalesce(nullif(trim(c.client_nom), ''), 'Client'),
         c.client_telephone,
         count(*)::int,
         coalesce(sum(c.total), 0)
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.created_at >= public.borne_periode(p_periode)
     and c.statut not in ('annulee', 'panier')
   group by b.slug, b.nom, coalesce(nullif(trim(c.client_nom), ''), 'Client'), c.client_telephone
   order by b.nom, 5 desc;
$$;

revoke all on function public.rapport_activite(text)  from public, anon, authenticated;
revoke all on function public.rapport_top_plats(text) from public, anon, authenticated;
revoke all on function public.rapport_clients(text)   from public, anon, authenticated;

grant execute on function public.rapport_activite(text)  to service_role;
grant execute on function public.rapport_top_plats(text) to service_role;
grant execute on function public.rapport_clients(text)   to service_role;
