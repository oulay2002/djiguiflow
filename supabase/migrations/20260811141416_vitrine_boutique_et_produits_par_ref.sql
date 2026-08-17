-- Meme raison que `vitrine_boutiques()` : la fiche d'une boutique ne peut pas
-- dependre du role de celui qui la consulte. Son chemin de secours lisait
-- `boutiques` et `produits` en direct, dont les politiques de lecture publique
-- ne sont accordees qu'a `anon` : un visiteur connecte tombait sur une page
-- vide des qu'il regardait l'enseigne d'un autre.
--
-- `p_ref` accepte le slug comme l'uuid : les liens partages par WhatsApp
-- datent d'avant les adresses lisibles.
create or replace function public.vitrine_boutique(p_ref text)
returns table(
  id uuid,
  slug text,
  nom text,
  description text,
  zone text,
  categorie text,
  logo_url text,
  emoji text,
  telephone text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select b.id, b.slug, b.nom, b.description, b.zone, b.categorie, b.logo_url,
         b.emoji, b.telephone
    from boutiques b
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
   limit 1;
$function$;

-- Ni stock, ni seuil d'alerte, ni prix d'achat : la vitrine n'a pas a les
-- connaitre, et le role appelant ne les verra donc jamais par ici.
create or replace function public.vitrine_produits(p_ref text)
returns table(
  id uuid,
  nom text,
  categorie text,
  prix numeric,
  description text,
  photo_url text,
  menu_du_jour boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.nom, p.categorie, p.prix, p.description, p.photo_url,
         p.menu_du_jour
    from produits p
    join boutiques b on b.id = p.boutique_id
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
     and p.disponible is distinct from false
   order by p.nom;
$function$;

grant execute on function public.vitrine_boutique(text) to anon, authenticated;
grant execute on function public.vitrine_produits(text) to anon, authenticated;
