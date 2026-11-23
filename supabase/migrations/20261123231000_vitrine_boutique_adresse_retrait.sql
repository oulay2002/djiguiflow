-- ---------------------------------------------------------------------------
-- Le chemin de repli de la vitrine rend aussi l'adresse de retrait
-- ---------------------------------------------------------------------------
--
-- CE QUI MANQUAIT. `20261123220000` a ajoute `boutiques.adresse_retrait`, que
-- la vitrine lit sur le serveur. Mais une boutique que le registre ne connait
-- pas est servie par `vitrine_boutique`, qui ne rendait pas la colonne : chez
-- elle, « Retrait » ne disait toujours pas ou venir.
--
-- POURQUOI UN `drop` PUIS UN `create`. Ajouter une colonne au `returns table`
-- change le type de retour, ce que `create or replace` refuse. La fonction est
-- donc supprimee et recreee dans la meme transaction.
--
-- ⚠ ET C'EST POURQUOI LES DROITS SONT REPOSES JUSTE APRES. Une fonction
-- recreee repart avec `EXECUTE` accorde a PUBLIC. Celle-ci est publique A
-- DESSEIN — c'est la porte de la vitrine — mais on le DIT, role par role,
-- plutot que de l'heriter : `npm run verifier:definer` tient cette regle.
--
-- LE CORPS EST CELUI DE `20260826192216`, a une colonne pres. Meme filtre
-- (`actif`), meme recherche par slug ou par identifiant, memes colonnes dans
-- le meme ordre : la page les lit par nom, et les anciennes pages en cache
-- continuent de trouver ce qu'elles attendent.

drop function if exists public.vitrine_boutique(text);

create function public.vitrine_boutique(p_ref text)
returns table (
  id uuid,
  slug text,
  nom text,
  description text,
  zone text,
  categorie text,
  logo_url text,
  emoji text,
  telephone text,
  delai_livraison text,
  zones_livrees text,
  paiements_acceptes text[],
  commande_minimum integer,
  mode_recuperation text,
  delai_preparation_min integer,
  livraison_offerte_des integer,
  adresse_retrait text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, b.slug, b.nom, b.description, b.zone, b.categorie, b.logo_url,
         b.emoji, b.telephone,
         b.delai_livraison, b.zones_livrees,
         b.paiements_acceptes, b.commande_minimum,
         b.mode_recuperation, b.delai_preparation_min, b.livraison_offerte_des,
         b.adresse_retrait
    from boutiques b
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
   limit 1;
$$;

revoke all on function public.vitrine_boutique(text) from public;
grant execute on function public.vitrine_boutique(text) to anon;
grant execute on function public.vitrine_boutique(text) to authenticated;
grant execute on function public.vitrine_boutique(text) to service_role;
