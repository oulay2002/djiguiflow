-- Les fonctions de contexte renvoyaient les jetons dechiffres. Appelees
-- depuis n8n, elles auraient depose ces secrets dans les donnees
-- d'execution, que n8n conserve et affiche. Chiffrer dans Vault ne sert a
-- rien si l'on dechiffre vers un systeme qui journalise tout.
--
-- Le contexte et les jetons sont donc separes : le contexte peut circuler,
-- le jeton ne sort que vers le serveur applicatif qui envoie le message.

drop function if exists public.canaux_par_session(text);
drop function if exists public.canaux_par_slug(text);

create function public.canaux_par_session(p_session_id text)
returns table (
  boutique_id     uuid,
  slug            text,
  nom             text,
  sheet_commandes text,
  sheet_menu      text,
  groupe_livreurs text,
  telephone       text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone
    from public.boutiques b
   where b.wasender_session_id = p_session_id;
$$;

create function public.canaux_par_slug(p_slug text)
returns table (
  boutique_id     uuid,
  slug            text,
  nom             text,
  sheet_commandes text,
  sheet_menu      text,
  groupe_livreurs text,
  telephone       text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone
    from public.boutiques b
   where b.slug = p_slug;
$$;

-- Seul chemin vers un jeton. Accepte le slug ou l'uuid : les workflows
-- connaissent l'un, l'application souvent l'autre.
create or replace function public.jeton_canal(p_boutique text, p_canal text)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_secret uuid;
begin
  if p_canal not in ('wasender', 'telegram') then
    raise exception 'canal inconnu: %', p_canal;
  end if;

  execute format(
    'select %I from public.boutiques where slug = $1 or id::text = $1',
    p_canal || '_secret_id')
    into v_secret using p_boutique;

  if v_secret is null then
    return null;
  end if;

  return (select ds.decrypted_secret
            from vault.decrypted_secrets ds
           where ds.id = v_secret);
end;
$$;

revoke all on function public.canaux_par_session(text) from public, anon, authenticated;
revoke all on function public.canaux_par_slug(text)    from public, anon, authenticated;
revoke all on function public.jeton_canal(text, text)  from public, anon, authenticated;

grant execute on function public.canaux_par_session(text) to service_role;
grant execute on function public.canaux_par_slug(text)    to service_role;
grant execute on function public.jeton_canal(text, text)  to service_role;
