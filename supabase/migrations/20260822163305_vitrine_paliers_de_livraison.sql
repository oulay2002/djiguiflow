-- L'annuaire public dit qu'une boutique livre, pas COMBIEN elle livre.
--
-- CE QUI ETAIT PUBLIE. `vitrine_boutiques()` rendait le compte exact des
-- commandes livrees de chaque boutique, a tout visiteur, sans authentification.
-- La page l'utilise dans `ligneConfiance()` : avis d'abord, commandes livrees
-- en repli, « Nouvelle boutique » sinon. Le signal est donc utile — c'est sa
-- PRECISION qui ne sert personne.
--
-- POURQUOI UN PALIER. Un client n'a pas besoin de « 7 » plutot que « 12 » : il a
-- besoin de savoir que cette boutique livre vraiment. Un concurrent, lui, tire
-- d'un nombre exact releve chaque jour un taux de croissance — sur une place de
-- marche ou les marchands sont voisins dans la meme ville, c'est du
-- renseignement offert. Un palier qui bouge deux fois par an ne se derive pas.
--
-- ET IL CORRIGE UNE ASYMETRIE. « 3 commandes livrees » se lit plus mal que
-- « Nouvelle boutique » : le nombre qui rassure le leader dessert le nouveau.
-- Une plateforme dont la croissance depend de l'arrivee de marchands ne peut pas
-- publier une mesure qui punit les arrivants. Le premier palier ne porte donc
-- AUCUN chiffre.
--
-- POURQUOI EN SQL ET NON DANS LA PAGE. Arrondir a l'affichage laisserait le
-- nombre exact voyager jusqu'au navigateur, lisible dans l'onglet reseau en
-- deux clics. Ce qui n'est pas envoye ne fuit pas.
--
-- `avis` reste exact : un compte d'avis est publie partout, il ne dit rien du
-- volume d'affaires, et c'est le signal que le client cherche en premier.

-- Le type de retour change : Postgres exige un DROP, `create or replace` ne
-- sait pas remplacer une signature de sortie.
drop function if exists public.vitrine_boutiques();

create or replace function public.vitrine_boutiques()
returns table(
  id uuid,
  slug text,
  nom text,
  description text,
  zone text,
  categorie text,
  logo_url text,
  articles integer,
  note_moyenne numeric,
  avis integer,
  -- 0 = aucune livraison. 1 = « les premieres », sans chiffre. Au-dela, le
  -- plancher du palier atteint : la page affiche « plus de N ».
  palier_livraisons integer
)
language sql
stable
security definer
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
             and c.statut = 'livree')::int
    from boutiques b
   where coalesce(b.actif, true)
   order by b.nom;
$function$;

-- L'annuaire est PUBLIC a dessein : c'est la vitrine de la plateforme. On le
-- redit explicitement plutot que de s'en remettre au defaut de Postgres, qui
-- accorde EXECUTE a PUBLIC sans qu'on l'ait demande.
revoke all on function public.vitrine_boutiques() from public;
grant execute on function public.vitrine_boutiques() to anon;
grant execute on function public.vitrine_boutiques() to authenticated;
grant execute on function public.vitrine_boutiques() to service_role;
