-- LA VITRINE NE POUVAIT PAS VOIR LE RETRAIT.
--
-- `vitrine_boutique` est la seule lecture publique de la fiche : la page ne
-- touche jamais la table. Les trois colonnes posees par
-- 20260826181257_retrait_reservation_et_livraison_offerte n'y figuraient pas,
-- donc le client n'avait aucun moyen d'apprendre que la boutique fait du
-- retrait, ni que la livraison est offerte. Le reglage existait cote marchand
-- et s'arretait la.
--
-- ── POURQUOI UN `drop` ICI, ET CE QU'IL FAUT REPOSER DERRIERE ──────────────
--
-- Le type de retour change : Postgres refuse un `create or replace` qui ajoute
-- des colonnes a un RETURNS TABLE. Il faut donc supprimer puis recreer.
--
-- ET UN `drop` REMET LES DROITS A LA VALEUR PAR DEFAUT DE POSTGRES, c'est-a-dire
-- EXECUTE A PUBLIC. C'est exactement le defaut trouve le 24 aout 2026 sur
-- `vitrine_boutiques` : le `grant` pose ensuite n'en retire rien, et
-- SECURITY DEFINER ne restreint RIEN — il fait tourner la fonction avec les
-- droits de son proprietaire. Le seul verrou est l'ACL.
--
-- Le `revoke ... from public` ci-dessous n'est donc pas une precaution de
-- style : sans lui, `scripts/verifier-fonctions-definer.mjs` crie, et il a
-- raison. Ici l'ouverture serait sans consequence — c'est deja la lecture
-- publique de la vitrine — mais la meme migration ecrite pour une fonction qui
-- contourne RLS ouvrirait tout, et rien ne le dirait.
--
-- ── CE QUE LA VITRINE EN FAIT ─────────────────────────────────────────────
--
-- `mode_recuperation`   decide si le choix livraison/retrait est propose, et si
--                       l'adresse est demandee.
-- `delai_preparation_min` sert a proposer une heure de retrait tenable. NULL =
--                       on n'annonce aucune heure, on ne l'invente pas.
-- `livraison_offerte_des` remplace la mention des frais. NULL = le livreur les
--                       annonce, 0 = toujours offerte, N = offerte des N FCFA.

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
  livraison_offerte_des integer
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
         b.mode_recuperation, b.delai_preparation_min, b.livraison_offerte_des
    from boutiques b
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
   limit 1;
$$;

revoke all on function public.vitrine_boutique(text) from public;
grant execute on function public.vitrine_boutique(text) to anon;
grant execute on function public.vitrine_boutique(text) to authenticated;
grant execute on function public.vitrine_boutique(text) to service_role;
