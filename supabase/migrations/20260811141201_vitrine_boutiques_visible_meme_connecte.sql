-- La vitrine publique ne peut pas dependre du role de celui qui la regarde.
--
-- `public_read_boutiques` n'est accordee qu'au role `anon`. Des qu'un visiteur
-- se connecte il devient `authenticated`, et la seule regle de lecture qui lui
-- reste est « Voir sa propre boutique » : la place de marche se vidait de tout
-- sauf de sa propre enseigne. Elargir la politique aux comptes connectes
-- n'etait pas une option — `authenticated` a le droit de lire les 22 colonnes
-- de la table, groupe de livreurs, onglets Sheets et empreintes de secrets
-- comprises, et chaque marchand aurait lu la configuration de ses voisins.
--
-- Cette fonction est donc la seule porte de la vitrine : elle ne rend que ce
-- qu'un passant peut voir, pour tout le monde, quel que soit le role. Elle
-- compte aussi les articles et agrege les notes, ce qui evite au navigateur de
-- telecharger tous les produits de toutes les boutiques pour en faire la somme.
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
  commandes_livrees integer
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
         (select count(*)
            from commandes c
           where c.boutique_id = b.id
             and c.statut = 'livree')::int
    from boutiques b
   where coalesce(b.actif, true)
   order by b.nom;
$function$;

grant execute on function public.vitrine_boutiques() to anon, authenticated;

-- `notes_publiques()` n'avait qu'un seul appelant, la vitrine, qui lit
-- desormais tout d'un coup. La laisser en place serait une seconde porte a
-- surveiller pour rien.
drop function if exists public.notes_publiques();
