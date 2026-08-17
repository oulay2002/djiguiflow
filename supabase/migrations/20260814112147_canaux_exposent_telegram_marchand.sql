-- Le contexte d'une boutique rendait son numero WhatsApp mais pas le chat
-- Telegram de son gerant. Les workflows qui previennent le marchand etaient
-- donc cables en dur sur WhatsApp : un marchand qui ne tient que Telegram
-- n'etait jamais prevenu d'une nouvelle commande.
--
-- Changer une colonne de sortie impose de supprimer puis recreer : Postgres
-- refuse de modifier le type de retour d'une fonction avec CREATE OR REPLACE.
-- Les trois se font dans la meme transaction, il n'existe donc aucun instant
-- ou une fonction manque a l'appel.

drop function if exists public.canaux_par_commande(text);
drop function if exists public.canaux_par_session(text);
drop function if exists public.canaux_par_slug(text);

create function public.canaux_par_commande(p_commande text)
returns table(
  boutique_id uuid, slug text, nom text, sheet_commandes text,
  sheet_menu text, groupe_livreurs text, telephone text,
  telegram_marchand text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone, b.telegram_marchand
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.id::text = p_commande or c.reference = p_commande
   limit 1;
$function$;

create function public.canaux_par_session(p_session_id text)
returns table(
  boutique_id uuid, slug text, nom text, sheet_commandes text,
  sheet_menu text, groupe_livreurs text, telephone text,
  telegram_marchand text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone, b.telegram_marchand
    from public.boutiques b
   where b.wasender_session_hash = public.empreinte_session(p_session_id);
$function$;

create function public.canaux_par_slug(p_slug text)
returns table(
  boutique_id uuid, slug text, nom text, sheet_commandes text,
  sheet_menu text, groupe_livreurs text, telephone text,
  telegram_marchand text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  -- Accepte le slug ou l'uuid : les appelants n'ont pas tous la meme cle en
  -- main. Le webhook de confirmation ne connait que boutique_id, alors que le
  -- routeur raisonne en slug. `jeton_canal` et /api/internal/fiche tolerent
  -- deja les deux ; cette fonction etait la seule a ne pas le faire, et
  -- repondait 404 sur un uuid parfaitement valide.
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone, b.telegram_marchand
    from public.boutiques b
   where b.slug = p_slug or b.id::text = p_slug
   limit 1;
$function$;
