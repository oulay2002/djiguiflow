create or replace function public.notes_publiques()
returns table(boutique_id uuid, note_moyenne numeric, avis integer, commandes_livrees integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Agregats destines a la vitrine publique. SECURITY DEFINER parce que la
  -- table commandes n'est pas lisible publiquement, et ne doit pas l'etre :
  -- seuls sortent d'ici des nombres, jamais une ligne de commande.
  select c.boutique_id,
         round(avg(c.note_client) filter (where c.note_client is not null), 1),
         count(c.note_client)::int,
         count(*) filter (where c.statut = 'livree')::int
    from public.commandes c
   group by c.boutique_id;
$function$;

grant execute on function public.notes_publiques() to anon, authenticated;
