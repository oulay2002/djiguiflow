-- `borne_periode` etait declaree IMMUTABLE alors qu'elle appelle now().
--
-- Une fonction IMMUTABLE promet de rendre toujours la meme chose pour les
-- memes arguments : le planificateur est donc en droit de l'evaluer une fois
-- et de reutiliser le resultat. Pour « aujourd'hui » ou « cette semaine »,
-- cela signifie une borne qui peut se figer — un tableau de bord qui reste
-- sur la journee de la veille sans que rien ne l'indique. now() est STABLE,
-- la fonction qui l'appelle ne peut pas etre plus forte.
create or replace function public.borne_periode(p_periode text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case p_periode
           when 'tout'    then '-infinity'::timestamptz
           when 'semaine' then now() - interval '7 days'
           else date_trunc('day', now())
         end;
$$;

-- search_path fige : sans lui, un appelant peut placer un schema devant
-- pg_catalog et detourner les fonctions utilisees dans le corps.
create or replace function public.empreinte_session(p_valeur text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_valeur, ''), 'utf8')), 'hex');
$$;
