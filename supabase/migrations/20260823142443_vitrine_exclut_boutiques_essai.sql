-- UNE BOUTIQUE D'ESSAI N'EST PAS UNE REFERENCE CLIENT.
--
-- « Atelier Temoin » — compte de test, `actif = false` — s'affichait en page
-- d'accueil parmi les vraies enseignes, sous le titre « Vous pouvez commander
-- chez eux maintenant ». Un visiteur qui cliquait tombait sur une boutique
-- factice. C'est le pire endroit possible pour perdre sa credibilite : la
-- premiere impression, et sur la promesse elle-meme.
--
-- La cause : la page d'accueil lisait le REGISTRE des marchands, qui sert aussi
-- aux taches planifiees et doit donc contenir les boutiques inactives. Le
-- catalogue public, lui, filtrait deja sur `actif` — la page d'accueil bascule
-- dessus, et ce filtre s'etend au drapeau `essai`.
create or replace function public.vitrine_boutiques()
 returns table(
   id uuid, slug text, nom text, description text, zone text, categorie text,
   logo_url text, articles integer, note_moyenne numeric, avis integer,
   palier_livraisons integer,
   apercus text[], prix_min numeric, horaires jsonb, pause_jusqua timestamptz
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

         (select coalesce(array_agg(a.photo_url order by a.rang), '{}'::text[])
            from (select p.photo_url,
                         row_number() over (order by p.created_at nulls last, p.nom) as rang
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
         b.pause_jusqua

    from boutiques b
   where coalesce(b.actif, true)
     and coalesce(b.essai, false) is not true
   order by b.nom;
$function$;

grant execute on function public.vitrine_boutiques() to anon, authenticated, service_role;

-- Le compte de test porte enfin son nom.
update public.boutiques set essai = true where slug = 'atelier-temoin';
