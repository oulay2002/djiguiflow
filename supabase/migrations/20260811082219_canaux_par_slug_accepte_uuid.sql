create or replace function public.canaux_par_slug(p_slug text)
returns table(boutique_id uuid, slug text, nom text, sheet_commandes text, sheet_menu text, groupe_livreurs text, telephone text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Accepte le slug ou l'uuid : les appelants n'ont pas tous la meme cle en
  -- main. Le webhook de confirmation ne connait que boutique_id, alors que le
  -- routeur raisonne en slug. `jeton_canal` et /api/internal/fiche tolerent
  -- deja les deux ; cette fonction etait la seule a ne pas le faire, et
  -- repondait 404 sur un uuid parfaitement valide.
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone
    from public.boutiques b
   where b.slug = p_slug or b.id::text = p_slug
   limit 1;
$function$;
