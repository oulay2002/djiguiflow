-- Le sessionId que wasenderapi place dans chaque webhook EST le jeton d'API
-- du compte. Le stocker en clair dans `boutiques` l'exposait a tout le monde :
-- la policy public_read_boutiques autorise anon a lire toutes les colonnes,
-- et la cle publiable est dans le JavaScript du site.
--
-- On ne garde donc que son empreinte SHA-256, qui suffit a reconnaitre
-- l'emetteur d'un webhook sans jamais permettre de s'en servir. Le jeton
-- lui-meme va dans Vault, hors de portee d'anon.

alter table public.boutiques drop column if exists wasender_session_id;

alter table public.boutiques
  add column if not exists wasender_session_hash text;

comment on column public.boutiques.wasender_session_hash is
  'Empreinte SHA-256 du sessionId wasender. Sert a reconnaitre la boutique destinataire d un webhook. Sans valeur pour un attaquant : on ne peut pas envoyer avec une empreinte.';

create unique index if not exists boutiques_wasender_session_hash_key
  on public.boutiques (wasender_session_hash)
  where wasender_session_hash is not null;

create or replace function public.empreinte_session(p_valeur text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_valeur, ''), 'utf8')), 'hex');
$$;

drop function if exists public.canaux_par_session(text);

-- Prend toujours le sessionId brut : c'est ce que porte le webhook. La
-- comparaison se fait sur l'empreinte, jamais sur la valeur stockee.
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
   where b.wasender_session_hash = public.empreinte_session(p_session_id);
$$;

-- Enregistre en un geste l'empreinte (pour reconnaitre) et le jeton (pour
-- envoyer), afin qu'ils ne puissent pas diverger.
create or replace function public.definir_session_wasender(p_slug text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not exists (select 1 from public.boutiques where slug = p_slug) then
    raise exception 'boutique introuvable: %', p_slug;
  end if;

  perform public.definir_jeton_canal(p_slug, 'wasender', p_token);

  update public.boutiques
     set wasender_session_hash = public.empreinte_session(p_token)
   where slug = p_slug;
end;
$$;

revoke all on function public.canaux_par_session(text) from public, anon, authenticated;
revoke all on function public.definir_session_wasender(text, text) from public, anon, authenticated;
grant execute on function public.canaux_par_session(text) to service_role;
grant execute on function public.definir_session_wasender(text, text) to service_role;
