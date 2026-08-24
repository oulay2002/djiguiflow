-- La caracteristique doit atteindre AUSSI les boutiques hors registre.
--
-- `vitrine_produits` sert les enseignes qui commandent par message WhatsApp
-- pre-rempli. Sans ce rappel, la pointure aurait paru fonctionner chez un
-- marchand et rester invisible chez son voisin, pour une raison qu'aucun des
-- deux n'aurait pu deviner — le genre d'ecart qu'on ne decouvre qu'en
-- comparant deux boutiques a la main.
--
-- Un `drop function` remet EXECUTE a PUBLIC : les grants sont donc reposes
-- explicitement plus bas, comme pour toute recreation dans ce depot.

drop function if exists public.vitrine_produits(text);

create or replace function public.vitrine_produits(p_ref text)
returns table (
  id uuid,
  nom text,
  categorie text,
  prix numeric,
  description text,
  photo_url text,
  menu_du_jour boolean,
  attribut_nom text,
  attribut_valeurs text[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.nom, p.categorie, p.prix, p.description, p.photo_url,
         p.menu_du_jour, p.attribut_nom, p.attribut_valeurs
    from produits p
    join boutiques b on b.id = p.boutique_id
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
     and p.disponible is distinct from false
   order by p.nom;
$$;

-- La vitrine est publique : `anon` la lit, et `authenticated` aussi — sans quoi
-- un marchand connecte ne verrait plus la boutique de son voisin.
revoke all on function public.vitrine_produits(text) from public;
grant execute on function public.vitrine_produits(text) to anon, authenticated, service_role;
