-- La fiche publique rend ce que le client devait demander au marchand.
--
-- Voir 20260825085703_boutiques_infos_client.sql pour le pourquoi des quatre
-- colonnes, et pourquoi le delai ne peut PAS etre calcule depuis l'historique.
--
-- ON REPOSE LES DROITS, ET CE N'EST PAS DE LA PRUDENCE DECORATIVE.
--
-- `drop function` remet EXECUTE a PUBLIC. Un `grant` pose ensuite n'en retire
-- rien : les deux coexistent, et la fonction reste ouverte a tout le monde.
-- Le 24 aout 2026, une seule fonction sur vingt-quatre etait dans ce cas, et
-- c'est un garde de CI qui l'a trouvee — pas une relecture.
--
-- Ici l'enjeu est mesure : c'est la fiche publique d'une boutique, deja
-- ouverte a `anon`. Mais la meme sequence sur une fonction qui lit un secret
-- ouvrirait ce secret a tout visiteur. La regle ne se plie donc pas au cas.
--
-- `authenticated` autant que `anon` : un marchand connecte qui regarde la
-- boutique d'un confrere est `authenticated`, et la page se viderait pour lui
-- seul — defaut deja rencontre sur la lecture directe des tables.

drop function if exists public.vitrine_boutique(text);

create function public.vitrine_boutique(p_ref text)
returns table(
  id uuid, slug text, nom text, description text, zone text, categorie text,
  logo_url text, emoji text, telephone text,
  delai_livraison text, zones_livrees text,
  paiements_acceptes text[], commande_minimum integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, b.slug, b.nom, b.description, b.zone, b.categorie, b.logo_url,
         b.emoji, b.telephone,
         b.delai_livraison, b.zones_livrees,
         b.paiements_acceptes, b.commande_minimum
    from boutiques b
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
   limit 1;
$$;

revoke all on function public.vitrine_boutique(text) from public;
grant execute on function public.vitrine_boutique(text) to anon, authenticated, service_role;
