-- AUDIT DU 22 NOVEMBRE 2026 — la ligne `boutiques` etait ecrite EN ENTIER par
-- son proprietaire.
--
-- `GRANT ALL ON boutiques TO authenticated` et deux politiques qui ne testent
-- que `user_id` : la base verifiait A QUI est la ligne, jamais QUELLES COLONNES
-- on y ecrit. Avec la cle du bundle et sa propre session, un marchand ecrivait
-- donc par PostgREST des champs que le serveur croit etre seul a poser.
--
-- Quatre consequences, toutes tracees dans le code :
--
--  1. LE SLUG. Toutes les resolutions tolerent `slug = $1 or id::text = $1`, et
--     le registre (`src/lib/marchands.ts`) pose les slugs AVANT les alias. Un
--     marchand qui prenait pour slug l'uuid d'une autre boutique — public, il
--     figure dans chaque URL de photo — recevait a sa place les commandes
--     adressees par uuid, avec le nom, le telephone et l'adresse des clients.
--  2. `wasender_session_id` : une colonne de branchement que seul le serveur
--     doit poser.
--  3. `actif`, `essai`, les `*_secret_id`, les empreintes de webhook : une
--     boutique desactivee se reactivait seule, ou se declarait « branchee »
--     sans l'etre.
--  4. La limite « une boutique hors Premium » se contournait avec
--     `user_id: null` (voir plus bas).
--
-- LES ROUTES SERVEUR NE SONT PAS TOUCHEES : elles passent par `service_role`.
-- Seul le navigateur ecrit avec `authenticated`, et il n'ecrit que les colonnes
-- reaccordees ici — `ma-boutique/page.tsx` et `BoutonPause.tsx`. Ajouter un
-- champ a cette page demande donc de l'ajouter ICI : c'est voulu, un champ
-- ecrit par le navigateur doit avoir ete decide.

-- ---------------------------------------------------------------------------
-- 1. Les colonnes
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger
  on public.boutiques from anon;

revoke insert, update, truncate, references, trigger
  on public.boutiques from authenticated;

-- A la creation : l'identite de la ligne, plus ce que la page saisit.
grant insert (
  user_id, slug,
  nom, description, zone, categorie, telephone, logo_url, emoji, horaires,
  delai_livraison, zones_livrees, paiements_acceptes, commande_minimum,
  mode_recuperation, delai_preparation_min, livraison_offerte_des
) on public.boutiques to authenticated;

-- Ensuite : NI `slug`, NI `user_id`. Un slug qui change casse les liens deja
-- partages et le nom des secrets du coffre (`<canal>_<slug>`) ; il ne se change
-- que par l'exploitant.
grant update (
  nom, description, zone, categorie, telephone, logo_url, emoji, horaires,
  pause_jusqua,
  delai_livraison, zones_livrees, paiements_acceptes, commande_minimum,
  mode_recuperation, delai_preparation_min, livraison_offerte_des
) on public.boutiques to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La forme du slug
-- ---------------------------------------------------------------------------
--
-- UN DECLENCHEUR, PAS UNE CONTRAINTE `CHECK`. Une contrainte — meme posee
-- `NOT VALID` — est reverifiee a CHAQUE mise a jour de la ligne : une boutique
-- existante dont le slug n'aurait pas la forme ne pourrait plus enregistrer ses
-- horaires. Le declencheur ne juge que le slug qu'on ECRIT.

create or replace function public.verifier_slug_boutique()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.slug is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(new.slug) not between 2 and 120 then
    raise exception 'Slug de boutique invalide : minuscules, chiffres et tirets seulement.'
      using errcode = 'check_violation';
  end if;

  -- La forme d'un uuid, avec ou sans tirets : c'est l'alias d'une AUTRE
  -- boutique dans toutes les resolutions `slug = $1 or id::text = $1`.
  if replace(new.slug, '-', '') ~ '^[0-9a-f]{32}$' then
    raise exception 'Slug de boutique invalide : il a la forme d''un identifiant.'
      using errcode = 'check_violation';
  end if;

  -- Le registre connait aussi chaque boutique sous son slug sans tirets et
  -- sous son nom sans espaces. On ne laisse pas un compte s'y installer.
  -- `service_role` en est dispense : l'exploitant qui cree deux enseignes
  -- homonymes sait ce qu'il fait, et `slugDisponible` lui a deja reserve une cle.
  if coalesce((select auth.role()), '') = 'authenticated' and exists (
    select 1
      from public.boutiques b
     where b.id <> new.id
       and (
         replace(coalesce(b.slug, ''), '-', '') = replace(new.slug, '-', '')
         or lower(regexp_replace(coalesce(b.nom, ''), '\s+', '', 'g')) = new.slug
       )
  ) then
    raise exception 'Ce slug est trop proche de celui d''une boutique existante.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.verifier_slug_boutique() from public, anon, authenticated;
grant execute on function public.verifier_slug_boutique() to service_role;

drop trigger if exists boutiques_slug_forme on public.boutiques;
create trigger boutiques_slug_forme
  before insert or update of slug on public.boutiques
  for each row execute function public.verifier_slug_boutique();

-- ---------------------------------------------------------------------------
-- 3. La limite de boutiques par forfait
-- ---------------------------------------------------------------------------
--
-- Deux declencheurs BEFORE INSERT, tires par ordre alphabetique :
-- `boutiques_limite_par_plan` passe AVANT `trg_set_boutique_user_id`. Un
-- `user_id: null` explicite ecartait le defaut de colonne ; la limite comptait
-- alors les boutiques « de personne », en trouvait zero, laissait passer — et
-- le second declencheur posait ensuite le vrai compte. Boutiques illimitees
-- sans Premium.
--
-- Le verrou consultatif ferme la variante par course : deux insertions
-- simultanees lisaient toutes deux zero.

create or replace function public.limiter_boutiques_par_plan()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  deja integer;
  ligne record;
begin
  new.user_id := coalesce(new.user_id, (select auth.uid()));

  if new.user_id is null then
    raise exception 'user_id requis pour creer une boutique.'
      using errcode = 'not_null_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('boutiques:' || new.user_id::text, 0));

  select count(*) into deja from public.boutiques where user_id = new.user_id;

  -- La premiere boutique d'un compte passe toujours. Sans cette ligne, un
  -- nouvel inscrit ne pourrait rien creer du tout.
  if deja = 0 then
    return new;
  end if;

  select plan_key, status, current_period_end into ligne
  from public.subscriptions where user_id = new.user_id limit 1;

  if coalesce(ligne.plan_key, '') = 'premium'
     and coalesce(ligne.status, '') in ('active', 'trialing')
     and (ligne.current_period_end is null or ligne.current_period_end > now())
  then
    return new;
  end if;

  raise exception
    'Plusieurs boutiques sur un meme compte sont reservees au forfait Premium.'
    using errcode = 'check_violation';
end;
$$;

revoke all on function public.limiter_boutiques_par_plan() from public, anon, authenticated;
grant execute on function public.limiter_boutiques_par_plan() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Une fonction neuve ne nait plus ouverte
-- ---------------------------------------------------------------------------
--
-- Les privileges par defaut accordaient EXECUTE a `anon` et `authenticated` a
-- chaque `create function`. Une RPC SECURITY DEFINER oubliee restait donc
-- appelable par tout visiteur jusqu'a ce que le garde nocturne la voie. On
-- inverse le defaut : une fonction publique A DESSEIN porte deja son `grant`
-- explicite (les trois `vitrine_*`), les autres n'ont plus rien a retirer.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;
