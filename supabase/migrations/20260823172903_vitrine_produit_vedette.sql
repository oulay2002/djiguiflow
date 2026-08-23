-- LE PRODUIT QUI PORTE LA BOUTIQUE PASSE DEVANT.
--
-- La photo dominante de la carte etait la premiere du catalogue — l'ordre de
-- saisie du marchand, qui ne dit rien de ce qui se vend. Or c'est cette image
-- qui decide si un visiteur entre. Autant qu'elle montre ce que les clients
-- choisissent reellement.
--
-- ON COMPTE LES COMMANDES DISTINCTES, PAS LES UNITES. Un client qui prend cinq
-- burgers ne fait pas un best-seller ; cinq clients qui en prennent un, si.
-- C'est la difference entre « plusieurs personnes l'ont choisi » — ce que le
-- libelle promet — et « quelqu'un en a pris beaucoup ».
--
-- TROIS COMMANDES AU MINIMUM, SINON RIEN. Avec deux ventes, « le plus
-- commande » n'est pas une information, c'est du bruit habille en donnee. La
-- carte retombe alors silencieusement sur l'ordre du catalogue. On a deja paye
-- pour avoir affiche une note calculee au lieu d'une note vraie.
--
-- Trente jours : un plat qui marchait il y a six mois ne dit plus rien de ce
-- qu'on sert aujourd'hui.
drop function if exists public.vitrine_boutiques();

create function public.vitrine_boutiques()
 returns table(
   id uuid, slug text, nom text, description text, zone text, categorie text,
   logo_url text, articles integer, note_moyenne numeric, avis integer,
   palier_livraisons integer,
   apercus text[], prix_min numeric, horaires jsonb, pause_jusqua timestamptz,
   vedette text, vedette_commandes integer
 )
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select b.id, b.slug, b.nom, b.description, b.zone, b.categorie, b.logo_url,
         (select count(*)
            from produits p
           where p.boutique_id = b.id
             and p.disponible is distinct from false)::int,
         (select round(avg(c.note_client), 1)
            from commandes c
           where c.boutique_id = b.id
             and c.note_client is not null),
         (select count(c.note_client)
            from commandes c
           where c.boutique_id = b.id)::int,
         (select case
                   when count(*) = 0   then 0
                   when count(*) < 10  then 1
                   when count(*) < 25  then 10
                   when count(*) < 50  then 25
                   when count(*) < 100 then 50
                   when count(*) < 250 then 100
                   when count(*) < 500 then 250
                   when count(*) < 1000 then 500
                   else 1000
                 end
            from commandes c
           where c.boutique_id = b.id
             and c.statut = 'livree')::int,

         -- Trois photos au plus, LA VEDETTE EN TETE quand il y en a une.
         -- L'ordre est le seul endroit ou la vedette agit : la carte se
         -- contente ensuite de nommer sa premiere image.
         (select coalesce(array_agg(a.photo_url order by a.rang), '{}'::text[])
            from (select p.photo_url,
                         row_number() over (
                           order by (v.nom_produit is not null and p.nom = v.nom_produit) desc,
                                    p.created_at nulls last, p.nom
                         ) as rang
                    from produits p
                   where p.boutique_id = b.id
                     and p.disponible is distinct from false
                     and coalesce(p.photo_url, '') <> ''
                   limit 4) a),

         (select min(p.prix)
            from produits p
           where p.boutique_id = b.id
             and p.disponible is distinct from false
             and coalesce(p.prix, 0) > 0),

         b.horaires,
         b.pause_jusqua,

         v.nom_produit,
         v.commandes::int

    from boutiques b

    -- La vedette : le produit que le plus de CLIENTS DIFFERENTS ont commande
    -- ces trente jours, et seulement s'ils sont au moins trois.
    left join lateral (
      select i.nom_produit, count(distinct c.id) as commandes
        from commande_items i
        join commandes c on c.id = i.commande_id
       where c.boutique_id = b.id
         and c.statut not in ('panier', 'abandonnee', 'annulee')
         and c.created_at > now() - interval '30 days'
       group by i.nom_produit
      having count(distinct c.id) >= 3
       order by count(distinct c.id) desc, sum(i.quantite) desc, i.nom_produit
       limit 1
    ) v on true

   where coalesce(b.actif, true)
     and coalesce(b.essai, false) is not true
   order by b.nom;
$function$;

grant execute on function public.vitrine_boutiques() to anon, authenticated, service_role;
