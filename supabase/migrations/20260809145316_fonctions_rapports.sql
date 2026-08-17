-- Les workflows de reporting calculaient leurs chiffres depuis Google Sheets,
-- devenu un miroir best-effort depuis que Supabase fait foi : un rapport
-- pouvait sous-declarer le chiffre d'affaires sans que rien ne le signale.
--
-- Les calculs vivent desormais ici, versionnes, et sont exposes a n8n par
-- l'application — n8n Cloud ne pouvant pas ouvrir de connexion Postgres.
-- Tout est groupe par boutique : un rapport par marchand devient possible.

create or replace function public.rapport_retards()
returns table (
  slug             text,
  boutique_nom     text,
  order_id         text,
  client_nom       text,
  client_telephone text,
  client_adresse   text,
  nom_livreur      text,
  statut           text,
  statut_livraison text,
  minutes          int
)
language sql stable security definer set search_path = public
as $$
  select b.slug, b.nom, c.reference, c.client_nom, c.client_telephone,
         c.client_adresse, c.nom_livreur, c.statut, c.statut_livraison,
         round(extract(epoch from (now() - c.created_at)) / 60)::int
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.statut not in ('livree', 'annulee', 'panier')
     and c.created_at <  now() - interval '45 minutes'
     and c.created_at >  now() - interval '24 hours'
   order by b.nom, c.created_at;
$$;

-- Le stock restant part de stock_initial moins les ventes du jour, comme le
-- faisait le calcul precedent. Abidjan etant a UTC+0, date_trunc suffit.
create or replace function public.rapport_stocks()
returns table (
  slug          text,
  boutique_nom  text,
  produit       text,
  stock_initial int,
  seuil         int,
  vendus        int,
  restant       int,
  niveau        text
)
language sql stable security definer set search_path = public
as $$
  with v as (
    select b.slug, b.nom as boutique_nom, p.nom as produit,
           coalesce(p.stock_initial, 0)::int as stock_initial,
           coalesce(p.seuil_alerte, 0)::int  as seuil,
           coalesce(sum(ci.quantite) filter (
             where c.created_at >= date_trunc('day', now())
               and c.statut <> 'annulee'
           ), 0)::int as vendus
      from public.produits p
      join public.boutiques b on b.id = p.boutique_id
      left join public.commande_items ci on ci.produit_id = p.id
      left join public.commandes c on c.id = ci.commande_id
     where p.disponible is true
       and coalesce(p.stock_initial, 0) > 0
       and coalesce(p.seuil_alerte, 0)  > 0
     group by b.slug, b.nom, p.nom, p.stock_initial, p.seuil_alerte
  )
  select v.*, (v.stock_initial - v.vendus) as restant,
         case
           when (v.stock_initial - v.vendus) <= ceil(v.seuil / 2.0) then 'critique'
           when (v.stock_initial - v.vendus) <= v.seuil             then 'attention'
           else 'ok'
         end
    from v
   order by v.boutique_nom, v.produit;
$$;

-- `p_periode` vaut 'jour' ou 'semaine'. Un panier encore en collecte
-- (statut 'panier') n'est pas une commande et ne compte nulle part.
create or replace function public.rapport_activite(p_periode text default 'jour')
returns table (
  slug          text,
  boutique_nom  text,
  commandes     int,
  livrees       int,
  annulees      int,
  ca            numeric,
  panier_moyen  numeric,
  note_moyenne  numeric,
  avis          int
)
language sql stable security definer set search_path = public
as $$
  with borne as (
    select case when p_periode = 'semaine'
                then now() - interval '7 days'
                else date_trunc('day', now())
           end as depuis
  )
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
   cross join borne
   where c.created_at >= borne.depuis
     and c.statut <> 'panier'
   group by b.slug, b.nom
   order by b.nom;
$$;

create or replace function public.rapport_top_plats(p_periode text default 'jour')
returns table (slug text, boutique_nom text, produit text, quantite int)
language sql stable security definer set search_path = public
as $$
  with borne as (
    select case when p_periode = 'semaine'
                then now() - interval '7 days'
                else date_trunc('day', now())
           end as depuis
  )
  select b.slug, b.nom, ci.nom_produit, sum(ci.quantite)::int
    from public.commande_items ci
    join public.commandes c on c.id = ci.commande_id
    join public.boutiques b on b.id = c.boutique_id
   cross join borne
   where c.created_at >= borne.depuis
     and c.statut <> 'annulee'
     and c.statut <> 'panier'
   group by b.slug, b.nom, ci.nom_produit
   order by b.nom, 4 desc;
$$;

revoke all on function public.rapport_retards()          from public, anon, authenticated;
revoke all on function public.rapport_stocks()           from public, anon, authenticated;
revoke all on function public.rapport_activite(text)     from public, anon, authenticated;
revoke all on function public.rapport_top_plats(text)    from public, anon, authenticated;

grant execute on function public.rapport_retards()       to service_role;
grant execute on function public.rapport_stocks()        to service_role;
grant execute on function public.rapport_activite(text)  to service_role;
grant execute on function public.rapport_top_plats(text) to service_role;
