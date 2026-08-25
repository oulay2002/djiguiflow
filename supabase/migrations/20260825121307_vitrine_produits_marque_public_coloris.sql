-- La fiche publique rend la marque et le public — et, au passage, les coloris.
--
-- Voir 20260825121137_produits_marque_et_public.sql pour le pourquoi des deux
-- nouvelles colonnes.
--
-- UN DEFAUT LATENT FERME EN MEME TEMPS. Cette fonction ne rendait NI `groupe`
-- NI `couleur`. Une boutique servie par ce chemin affichait donc chaque coloris
-- comme un article distinct : le client croyait voir trois articles la ou il y
-- en a un en trois couleurs, et le catalogue paraissait plus riche qu'il n'est.
--
-- Rien ne le montrait, parce que les deux boutiques d'aujourd'hui passent par
-- l'autre chemin — le registre Marchands, qui rend bien ces colonnes. Le defaut
-- attendait le premier marchand qui n'y figurerait pas. C'est le motif du
-- MIROIR QUI DIVERGE, deja rencontre six fois dans ce projet : deux chemins
-- pour une meme lecture, dont un seul est eprouve.
--
-- ON REPOSE LES DROITS. `drop function` remet EXECUTE a PUBLIC, et un `grant`
-- pose ensuite n'en retire rien. `authenticated` autant que `anon` : un
-- marchand connecte qui regarde la boutique d'un confrere est `authenticated`,
-- et le catalogue se viderait pour lui seul.

drop function if exists public.vitrine_produits(text);

create function public.vitrine_produits(p_ref text)
returns table(
  id uuid, nom text, categorie text, prix numeric, description text,
  photo_url text, menu_du_jour boolean,
  attribut_nom text, attribut_valeurs text[],
  groupe text, couleur text,
  marque text, public_vise text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.nom, p.categorie, p.prix, p.description, p.photo_url,
         p.menu_du_jour, p.attribut_nom, p.attribut_valeurs,
         p.groupe, p.couleur,
         p.marque, p.public_vise
    from produits p
    join boutiques b on b.id = p.boutique_id
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
     and p.disponible is distinct from false
   order by p.nom;
$$;

revoke all on function public.vitrine_produits(text) from public;
grant execute on function public.vitrine_produits(text) to anon, authenticated, service_role;
