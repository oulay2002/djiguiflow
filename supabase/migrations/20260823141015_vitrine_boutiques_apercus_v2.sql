-- UNE VITRINE MONTRE CE QU'ELLE VEND.
--
-- La carte d'une boutique donnait son nom, son quartier, sa categorie, sa note
-- et le NOMBRE de ses articles. C'est une fiche d'annuaire. Un visiteur qui
-- arrive ne sait pas ce qu'on y vend, et « 5 articles » ne donne envie de
-- rien : ce qui donne envie, c'est de VOIR la marchandise.
--
-- Trois ajouts, tous tires de donnees qui existaient deja :
--   `apercus`   — jusqu'a quatre photos d'articles disponibles.
--   `prix_min`  — « a partir de 1 000 F », un repere pour se projeter.
--   `horaires` / `pause_jusqua` — pour dire OUVERT ou FERME sur la carte,
--                 plutot que de le decouvrir apres avoir clique.
--
-- Le type de retour change : il faut donc supprimer avant de recreer. La
-- migration est atomique, la fonction n'est jamais absente pour un visiteur.
drop function if exists public.vitrine_boutiques();

create function public.vitrine_boutiques()
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

         -- Quatre photos au plus, dans l'ordre du catalogue et non au hasard :
         -- le marchand a range ses articles, cet ordre est un choix. Un article
         -- sans photo est ecarte — une vignette vide dessert plus qu'un apercu
         -- plus court.
         (select coalesce(array_agg(a.photo_url order by a.rang), '{}'::text[])
            from (select p.photo_url,
                         row_number() over (order by p.created_at nulls last, p.nom) as rang
                    from produits p
                   where p.boutique_id = b.id
                     and p.disponible is distinct from false
                     and coalesce(p.photo_url, '') <> ''
                   limit 4) a),

         -- Le plancher de prix, sur ce qui est reellement achetable.
         (select min(p.prix)
            from produits p
           where p.boutique_id = b.id
             and p.disponible is distinct from false
             and coalesce(p.prix, 0) > 0),

         b.horaires,
         b.pause_jusqua

    from boutiques b
   where coalesce(b.actif, true)
   order by b.nom;
$function$;

-- Le catalogue public est LU DEPUIS LE NAVIGATEUR, avec la cle anonyme : cette
-- fonction doit rester ouverte a `anon`. On l'ecrit, plutot que de s'en
-- remettre au defaut — c'est le meme geste qui, ailleurs, aurait du etre un
-- REVOKE.
grant execute on function public.vitrine_boutiques() to anon, authenticated, service_role;
