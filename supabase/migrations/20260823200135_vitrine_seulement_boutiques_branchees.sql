-- UNE BOUTIQUE NON BRANCHEE NE DOIT PAS RECEVOIR DE COMMANDE.
--
-- Le guide met « Mettez vos articles en vente » a l'etape 2 et les canaux aux
-- etapes 3 a 6. En suivant l'ordre officiel, il existe donc une fenetre ou la
-- vitrine est en ligne, vend, encaisse une commande -- et ou PERSONNE n'est
-- prevenu. Le guide le sait et se contente d'avertir : « une boutique en ligne
-- mais non branchee accepte des commandes que personne ne traite ».
--
-- Un avertissement ne protege pas un client. C'est lui qui paie l'attente.
--
-- CE QUE « BRANCHEE » VEUT DIRE, et rien de plus :
--   un canal pour parler au CLIENT   (jeton wasender ou telegram au coffre)
--   un groupe pour lancer un LIVREUR (groupe_livreurs renseigne)
--
-- Ces deux-la sont exactement les `BLOQUANTS` du diagnostic. On ne rajoute pas
-- le catalogue : une boutique sans article est deja invisible, et l'ecarter
-- ici la ferait disparaitre pendant qu'elle remplit sa vitrine.
--
-- VERIFIE AVANT D'APPLIQUER, sur les deux boutiques reelles du 23 aout 2026 :
-- toutes deux ont un canal ET un groupe. Aucune ne disparait. Cacher une
-- boutique vivante serait pire que le defaut qu'on ferme.
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
     -- LE BRANCHEMENT, ajoute le 23 aout 2026.
     and (b.wasender_secret_id is not null or b.telegram_secret_id is not null)
     and nullif(btrim(coalesce(b.groupe_livreurs, '')), '') is not null
   order by b.nom;
$function$;

grant execute on function public.vitrine_boutiques() to anon, authenticated, service_role;
