-- Chaque marchand possede son propre numero WhatsApp (session wasenderapi)
-- et son propre bot Telegram. Les identifiants publics vivent dans
-- `boutiques` ; les jetons, eux, ne sont jamais stockes en clair : ils vont
-- dans Vault et la table ne garde que leur identifiant.

alter table public.boutiques
  add column if not exists wasender_session_id text,
  add column if not exists wasender_secret_id  uuid,
  add column if not exists telegram_secret_id  uuid;

comment on column public.boutiques.wasender_session_id is
  'Session wasenderapi du numero WhatsApp du marchand. Chaque webhook entrant porte ce sessionId : c est lui qui dit quelle boutique a ete contactee.';
comment on column public.boutiques.wasender_secret_id is
  'Identifiant du secret Vault portant la cle API wasender. Le jeton n est jamais stocke dans cette table.';
comment on column public.boutiques.telegram_secret_id is
  'Identifiant du secret Vault portant le token du bot Telegram du marchand.';

-- Deux marchands ne peuvent pas partager une session : ce serait ambigu a la
-- reception. L index partiel laisse plusieurs boutiques non equipees.
create unique index if not exists boutiques_wasender_session_key
  on public.boutiques (wasender_session_id)
  where wasender_session_id is not null;

-- Resolution d une boutique a partir de la session WhatsApp qui a recu le
-- message. SECURITY DEFINER : la vue vault.decrypted_secrets n est lisible
-- que par le proprietaire, jamais par anon ni authenticated.
create or replace function public.canaux_par_session(p_session_id text)
returns table (
  boutique_id     uuid,
  slug            text,
  nom             text,
  sheet_commandes text,
  sheet_menu      text,
  groupe_livreurs text,
  telephone       text,
  wasender_cle    text,
  telegram_token  text
)
language sql
stable
security definer
set search_path = public, vault
as $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone,
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = b.wasender_secret_id),
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = b.telegram_secret_id)
    from public.boutiques b
   where b.wasender_session_id = p_session_id;
$$;

-- Meme resolution par slug : les bots Telegram pointent leur webhook sur
-- une URL portant le slug, Telegram n identifiant pas le bot dans sa charge.
create or replace function public.canaux_par_slug(p_slug text)
returns table (
  boutique_id     uuid,
  slug            text,
  nom             text,
  sheet_commandes text,
  sheet_menu      text,
  groupe_livreurs text,
  telephone       text,
  wasender_cle    text,
  telegram_token  text
)
language sql
stable
security definer
set search_path = public, vault
as $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone,
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = b.wasender_secret_id),
         (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id = b.telegram_secret_id)
    from public.boutiques b
   where b.slug = p_slug;
$$;

-- Ecriture d un jeton sans jamais pouvoir le relire : le marchand le saisit,
-- l application l enregistre, personne ne le ressort.
create or replace function public.definir_jeton_canal(
  p_slug   text,
  p_canal  text,     -- 'wasender' | 'telegram'
  p_jeton  text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_boutique uuid;
  v_ancien   uuid;
  v_nouveau  uuid;
  v_nom      text;
begin
  if p_canal not in ('wasender', 'telegram') then
    raise exception 'canal inconnu: %', p_canal;
  end if;

  select id into v_boutique from public.boutiques where slug = p_slug;
  if v_boutique is null then
    raise exception 'boutique introuvable: %', p_slug;
  end if;

  execute format('select %I from public.boutiques where id = $1',
                 p_canal || '_secret_id')
     into v_ancien using v_boutique;

  v_nom := p_canal || '_' || p_slug;

  -- Nom unique dans Vault : on retire l ancien avant d ecrire le nouveau.
  if v_ancien is not null then
    delete from vault.secrets where id = v_ancien;
  end if;
  delete from vault.secrets where name = v_nom;

  select vault.create_secret(p_jeton, v_nom,
           'Jeton ' || p_canal || ' de la boutique ' || p_slug)
    into v_nouveau;

  execute format('update public.boutiques set %I = $1 where id = $2',
                 p_canal || '_secret_id')
    using v_nouveau, v_boutique;
end;
$$;

-- Ces trois fonctions donnent acces a des jetons : le porteur d une cle
-- publique ne doit jamais pouvoir les appeler.
revoke all on function public.canaux_par_session(text) from public, anon, authenticated;
revoke all on function public.canaux_par_slug(text)    from public, anon, authenticated;
revoke all on function public.definir_jeton_canal(text, text, text) from public, anon, authenticated;

grant execute on function public.canaux_par_session(text) to service_role;
grant execute on function public.canaux_par_slug(text)    to service_role;
grant execute on function public.definir_jeton_canal(text, text, text) to service_role;
