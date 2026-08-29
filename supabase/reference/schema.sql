-- INSTANTANE DU 2026-08-29 11:43 UTC
-- DERNIERE MIGRATION APPLIQUEE : 20260827223011
--
-- Pour restaurer : rejouer ce fichier, PUIS tous les fichiers de
-- supabase/migrations/ dont l'horodatage est superieur a 20260827223011.
-- Sauter cette etape ramene le schema jusqu'a vingt-quatre heures en
-- arriere, verrous compris.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgres_fdw" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."borne_periode"("p_periode" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select case p_periode
           when 'tout'    then '-infinity'::timestamptz
           when 'semaine' then now() - interval '7 days'
           else date_trunc('day', now())
         end;
$$;


ALTER FUNCTION "public"."borne_periode"("p_periode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canaux_par_commande"("p_commande" "text") RETURNS TABLE("boutique_id" "uuid", "slug" "text", "nom" "text", "sheet_commandes" "text", "sheet_menu" "text", "groupe_livreurs" "text", "telephone" "text", "telegram_marchand" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone, b.telegram_marchand
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.id::text = p_commande or c.reference = p_commande
   limit 1;
$$;


ALTER FUNCTION "public"."canaux_par_commande"("p_commande" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canaux_par_session"("p_session_id" "text") RETURNS TABLE("boutique_id" "uuid", "slug" "text", "nom" "text", "sheet_commandes" "text", "sheet_menu" "text", "groupe_livreurs" "text", "telephone" "text", "telegram_marchand" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.id, b.slug, b.nom, b.sheet_commandes, b.sheet_menu,
         b.groupe_livreurs, b.telephone, b.telegram_marchand
    from public.boutiques b
   where b.wasender_session_hash = public.empreinte_session(p_session_id);
$$;


ALTER FUNCTION "public"."canaux_par_session"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canaux_par_slug"("p_slug" "text") RETURNS TABLE("boutique_id" "uuid", "slug" "text", "nom" "text", "sheet_commandes" "text", "sheet_menu" "text", "groupe_livreurs" "text", "telephone" "text", "telegram_marchand" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."canaux_par_slug"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrementer_stock"("p_produit" "uuid", "p_quantite" integer) RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.produits
     set stock = greatest(0, stock - greatest(0, p_quantite))
   where id = p_produit
     and stock is not null
  returning stock;
$$;


ALTER FUNCTION "public"."decrementer_stock"("p_produit" "uuid", "p_quantite" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."definir_jeton_canal"("p_slug" "text", "p_canal" "text", "p_jeton" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."definir_jeton_canal"("p_slug" "text", "p_canal" "text", "p_jeton" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."definir_secret_webhook"("p_slug" "text", "p_secret" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.boutiques where slug = p_slug) then
    raise exception 'boutique introuvable: %', p_slug;
  end if;

  update public.boutiques
     set webhook_secret_hash = public.empreinte_session(p_secret)
   where slug = p_slug;
end;
$$;


ALTER FUNCTION "public"."definir_secret_webhook"("p_slug" "text", "p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."definir_secret_webhook_telegram"("p_slug" "text", "p_secret" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from public.boutiques where slug = p_slug) then
    raise exception 'boutique introuvable: %', p_slug;
  end if;

  update public.boutiques
     set telegram_webhook_secret_hash = public.empreinte_session(p_secret)
   where slug = p_slug;
end;
$$;


ALTER FUNCTION "public"."definir_secret_webhook_telegram"("p_slug" "text", "p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."definir_session_wasender"("p_slug" "text", "p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
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


ALTER FUNCTION "public"."definir_session_wasender"("p_slug" "text", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."empreinte_session"("p_valeur" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select encode(sha256(convert_to(coalesce(p_valeur, ''), 'utf8')), 'hex');
$$;


ALTER FUNCTION "public"."empreinte_session"("p_valeur" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."incrementer_compteur"("p_cle" "text", "p_plafond" integer) RETURNS TABLE("valeur" integer, "autorise" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  -- Le jour se calcule dans le fuseau des marchands, pas en UTC : un plafond
  -- qui se reinitialise a 00h00 UTC coupe en pleine soiree a Abidjan.
  v_jour date := (now() at time zone 'Africa/Abidjan')::date;
  v_valeur integer;
begin
  insert into public.compteurs_journaliers as c (cle, jour, valeur)
  values (p_cle, v_jour, 1)
  on conflict (cle, jour) do update
    set valeur = c.valeur + 1
  returning c.valeur into v_valeur;

  return query select v_valeur, v_valeur <= p_plafond;
end;
$$;


ALTER FUNCTION "public"."incrementer_compteur"("p_cle" "text", "p_plafond" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jeton_canal"("p_boutique" "text", "p_canal" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."jeton_canal"("p_boutique" "text", "p_canal" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."limiter_boutiques_par_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  deja integer;
  ligne record;
begin
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


ALTER FUNCTION "public"."limiter_boutiques_par_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_n8n_new_commande"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  payload jsonb;
  req_id bigint;
  v_secret text;
  v_essai boolean;
  n8n_webhook_url text := 'https://n8n.djiguiflow.com/webhook/nouvelle-commande';
begin
  -- Un panier en cours de collecte n'est pas une commande.
  if new.statut = 'panier' then
    return new;
  end if;

  -- Sur une mise a jour, on ne parle QUE si la commande vient de devenir
  -- reelle. Sans ce controle, chaque changement de statut de livraison
  -- reannoncerait la meme commande au marchand.
  if tg_op = 'UPDATE' and coalesce(old.statut, '') <> 'panier' then
    return new;
  end if;

  select b.essai into v_essai
  from public.boutiques b where b.id = new.boutique_id;

  if coalesce(v_essai, false) then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'n8n_webhook_secret' limit 1;

  payload := jsonb_build_object(
    'id', new.id,
    'boutique_id', new.boutique_id,
    'reference', new.reference,
    -- Le jeton qui rend le lien de confirmation indevinable. n8n en a besoin
    -- pour composer le lien qu'il envoie au client ; sans lui, deviner une
    -- reference suffit a ANNULER la commande d'un inconnu.
    'jeton_suivi', new.jeton_suivi,
    'client_nom', new.client_nom,
    'client_telephone', new.client_telephone,
    'client_adresse', new.client_adresse,
    'total', new.total,
    'statut', new.statut,
    'created_at', new.created_at,
    -- CE QUE LE MARCHAND DOIT LIRE AVANT TOUT LE RESTE : faut-il porter cette
    -- commande, ou l'emballer et attendre ?
    'mode_recuperation', new.mode_recuperation,
    -- NULL veut dire « des que pret », jamais « on ne sait pas ».
    'heure_retrait', new.heure_retrait
  );

  begin
    select net.http_post(
      url := n8n_webhook_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-djiguiflow-secret', coalesce(v_secret, '')
      ),
      timeout_milliseconds := 5000
    ) into req_id;
  exception
    when others then
      raise warning 'N8N webhook enqueue failed for commande id=%: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_n8n_new_commande"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_n8n_new_commande"() IS 'Previent le marchand a chaque nouvelle commande, via le webhook n8n « nouvelle-commande » (workflow « Nouvelle Commande -> WhatsApp », kf1a5WcKWTF7kPC8). Cablage invisible au code applicatif : verifier pg_trigger avant de conclure que ce workflow est orphelin. Secret lu au coffre (vault, n8n_webhook_secret).';



CREATE OR REPLACE FUNCTION "public"."prolonger_acces"("p_user_id" "uuid", "p_plan_key" "text", "p_mois" integer, "p_reference" "text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_fin timestamptz;
begin
  if p_mois is null or p_mois <= 0 then
    raise exception 'prolonger_acces : nombre de mois invalide (%)', p_mois;
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'prolonger_acces : reference de paiement absente';
  end if;

  insert into public.subscriptions as s (
    user_id, plan_key, status,
    current_period_start, current_period_end,
    last_checkout_session_id, updated_at
  )
  values (
    p_user_id, p_plan_key, 'active',
    now(), now() + (p_mois * interval '30 days'),
    p_reference, now()
  )
  on conflict (user_id) do update
    set plan_key = excluded.plan_key,
        status = 'active',
        current_period_start = now(),
        current_period_end = greatest(s.current_period_end, now()) + (p_mois * interval '30 days'),
        last_checkout_session_id = p_reference,
        updated_at = now()
    where s.last_checkout_session_id is distinct from p_reference
  returning s.current_period_end into v_fin;

  if v_fin is null then
    select s2.current_period_end into v_fin
    from public.subscriptions s2
    where s2.user_id = p_user_id;
  end if;

  return v_fin;
end;
$$;


ALTER FUNCTION "public"."prolonger_acces"("p_user_id" "uuid", "p_plan_key" "text", "p_mois" integer, "p_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapport_activite"("p_periode" "text" DEFAULT 'jour'::"text") RETURNS TABLE("slug" "text", "boutique_nom" "text", "commandes" integer, "livrees" integer, "annulees" integer, "ca" numeric, "panier_moyen" numeric, "note_moyenne" numeric, "avis" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.slug, b.nom,
         count(*) filter (where c.statut <> 'annulee')::int,
         count(*) filter (where c.statut =  'livree')::int,
         count(*) filter (where c.statut =  'annulee')::int,
         coalesce(sum(c.total) filter (where c.statut <> 'annulee'), 0),
         case when count(*) filter (where c.statut <> 'annulee') > 0
              then round(coalesce(sum(c.total) filter (where c.statut <> 'annulee'), 0)
                         / count(*) filter (where c.statut <> 'annulee'))
              else 0 end,
         round(avg(c.note_client) filter (where c.note_client is not null), 1),
         count(c.note_client)::int
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.created_at >= public.borne_periode(p_periode)
     and c.statut <> 'panier'
   group by b.slug, b.nom
   order by b.nom;
$$;


ALTER FUNCTION "public"."rapport_activite"("p_periode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapport_clients"("p_periode" "text" DEFAULT 'jour'::"text") RETURNS TABLE("slug" "text", "boutique_nom" "text", "client" "text", "telephone" "text", "commandes" integer, "total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.slug, b.nom,
         coalesce(nullif(trim(c.client_nom), ''), 'Client'),
         c.client_telephone,
         count(*)::int,
         coalesce(sum(c.total), 0)
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.created_at >= public.borne_periode(p_periode)
     and c.statut not in ('annulee', 'panier')
   group by b.slug, b.nom, coalesce(nullif(trim(c.client_nom), ''), 'Client'), c.client_telephone
   order by b.nom, 5 desc;
$$;


ALTER FUNCTION "public"."rapport_clients"("p_periode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapport_retards"() RETURNS TABLE("slug" "text", "boutique_nom" "text", "order_id" "text", "client_nom" "text", "client_telephone" "text", "client_adresse" "text", "nom_livreur" "text", "statut" "text", "statut_livraison" "text", "minutes" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.slug, b.nom, c.reference, c.client_nom, c.client_telephone,
         c.client_adresse, c.nom_livreur, c.statut, c.statut_livraison,
         round(extract(epoch from (now() - c.created_at)) / 60)::int
    from public.commandes c
    join public.boutiques b on b.id = c.boutique_id
   where c.statut not in ('livree', 'annulee', 'panier')
     and c.created_at <  now() - interval '45 minutes'
     and c.created_at >  now() - interval '24 hours'
   order by b.nom, c.created_at;
$$;


ALTER FUNCTION "public"."rapport_retards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapport_stocks"() RETURNS TABLE("slug" "text", "boutique_nom" "text", "produit" "text", "stock_initial" integer, "seuil" integer, "vendus" integer, "restant" integer, "niveau" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with v as (
    select b.slug, b.nom as boutique_nom, p.nom as produit,
           coalesce(p.stock_initial, 0)::int as stock_initial,
           coalesce(p.seuil_alerte, 0)::int  as seuil,
           coalesce(sum(ci.quantite) filter (
             where c.created_at >= date_trunc('day', now())
               and c.statut <> 'annulee'
           ), 0)::int as vendus
      from public.produits p
      join public.boutiques b on b.id = p.boutique_id
      left join public.commande_items ci on ci.produit_id = p.id
      left join public.commandes c on c.id = ci.commande_id
     where p.disponible is true
       and coalesce(p.stock_initial, 0) > 0
       and coalesce(p.seuil_alerte, 0)  > 0
     group by b.slug, b.nom, p.nom, p.stock_initial, p.seuil_alerte
  )
  select v.*, (v.stock_initial - v.vendus) as restant,
         case
           when (v.stock_initial - v.vendus) <= ceil(v.seuil / 2.0) then 'critique'
           when (v.stock_initial - v.vendus) <= v.seuil             then 'attention'
           else 'ok'
         end
    from v
   order by v.boutique_nom, v.produit;
$$;


ALTER FUNCTION "public"."rapport_stocks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapport_top_plats"("p_periode" "text" DEFAULT 'jour'::"text") RETURNS TABLE("slug" "text", "boutique_nom" "text", "produit" "text", "quantite" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.slug, b.nom, ci.nom_produit, sum(ci.quantite)::int
    from public.commande_items ci
    join public.commandes c on c.id = ci.commande_id
    join public.boutiques b on b.id = c.boutique_id
   where c.created_at >= public.borne_periode(p_periode)
     and c.statut not in ('annulee', 'panier')
   group by b.slug, b.nom, ci.nom_produit
   order by b.nom, 4 desc;
$$;


ALTER FUNCTION "public"."rapport_top_plats"("p_periode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserver_fenetre"("p_cle" "text", "p_plafond" integer, "p_secondes" integer DEFAULT 600) RETURNS TABLE("valeur" integer, "autorise" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_fenetre timestamptz;
  v_valeur  integer;
begin
  if coalesce(trim(p_cle), '') = '' or p_plafond is null or p_plafond < 1 then
    -- Sans cle ni plafond utilisable, on REFUSE. Un frein qui s'ouvre quand on
    -- l'appelle mal n'est pas un frein.
    return query select 0, false;
    return;
  end if;

  -- Le seau : l'instant arrondi au debut de sa fenetre. `to_timestamp` d'un
  -- quotient entier donne un bord stable, identique sur toutes les instances.
  v_fenetre := to_timestamp(
    floor(extract(epoch from now()) / greatest(1, p_secondes)) * greatest(1, p_secondes)
  );

  insert into public.compteurs_fenetre as c (cle, fenetre, valeur)
  values (p_cle, v_fenetre, 1)
  on conflict (cle, fenetre) do update
    set valeur = c.valeur + 1
  returning c.valeur into v_valeur;

  delete from public.compteurs_fenetre where fenetre < now() - interval '1 hour';
  delete from public.compteurs_journaliers where jour < (now() at time zone 'Africa/Abidjan')::date - 7;

  return query select v_valeur, v_valeur <= p_plafond;
end;
$$;


ALTER FUNCTION "public"."reserver_fenetre"("p_cle" "text", "p_plafond" integer, "p_secondes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserver_relance"("p_boutique" "text", "p_telephone" "text", "p_motif" "text" DEFAULT NULL::"text", "p_jours" integer DEFAULT 30, "p_plafond_jour" integer DEFAULT 25) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_derniere timestamptz;
  v_jour     integer;
begin
  if coalesce(trim(p_boutique), '') = '' or coalesce(trim(p_telephone), '') = '' then
    return jsonb_build_object('autorise', false, 'motif', 'parametres_manquants');
  end if;

  if not exists (select 1 from boutiques where slug = p_boutique) then
    return jsonb_build_object('autorise', false, 'motif', 'boutique_inconnue');
  end if;

  -- Deux demandes simultanees pour le meme client liraient sinon toutes deux
  -- « aucune relance recente » et enverraient deux fois.
  perform pg_advisory_xact_lock(hashtext(p_boutique || '|' || p_telephone));

  if exists (
    select 1 from relances_stop
    where boutique = p_boutique and telephone = p_telephone
  ) then
    return jsonb_build_object('autorise', false, 'motif', 'stop');
  end if;

  select max(envoye_le) into v_derniere
  from relances_envoyees
  where boutique = p_boutique and telephone = p_telephone;

  if v_derniere is not null and v_derniere > now() - make_interval(days => p_jours) then
    return jsonb_build_object('autorise', false, 'motif', 'trop_recent', 'derniere', v_derniere);
  end if;

  select count(*) into v_jour
  from relances_envoyees
  where boutique = p_boutique and envoye_le > now() - interval '24 hours';

  if v_jour >= p_plafond_jour then
    return jsonb_build_object('autorise', false, 'motif', 'plafond_jour', 'compte', v_jour);
  end if;

  insert into relances_envoyees (boutique, telephone, motif)
  values (p_boutique, p_telephone, p_motif);

  return jsonb_build_object('autorise', true);
exception
  -- Filet : quoi qu'il arrive ici, on REFUSE. Le pire resultat possible serait
  -- qu'une panne de la table de comptage ouvre les vannes.
  when others then
    return jsonb_build_object('autorise', false, 'motif', 'erreur_interne');
end
$$;


ALTER FUNCTION "public"."reserver_relance"("p_boutique" "text", "p_telephone" "text", "p_motif" "text", "p_jours" integer, "p_plafond_jour" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."secret_webhook_n8n"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'n8n_webhook_secret'
   limit 1;
$$;


ALTER FUNCTION "public"."secret_webhook_n8n"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_boutique_user_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.user_id is null then
    new.user_id := (select auth.uid());
  end if;

  if new.user_id is null then
    raise exception 'user_id is required. Insert from an authenticated context or provide user_id explicitly.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_boutique_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vitrine_boutique"("p_ref" "text") RETURNS TABLE("id" "uuid", "slug" "text", "nom" "text", "description" "text", "zone" "text", "categorie" "text", "logo_url" "text", "emoji" "text", "telephone" "text", "delai_livraison" "text", "zones_livrees" "text", "paiements_acceptes" "text"[], "commande_minimum" integer, "mode_recuperation" "text", "delai_preparation_min" integer, "livraison_offerte_des" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.id, b.slug, b.nom, b.description, b.zone, b.categorie, b.logo_url,
         b.emoji, b.telephone,
         b.delai_livraison, b.zones_livrees,
         b.paiements_acceptes, b.commande_minimum,
         b.mode_recuperation, b.delai_preparation_min, b.livraison_offerte_des
    from boutiques b
   where coalesce(b.actif, true)
     and (b.slug = p_ref or b.id::text = p_ref)
   limit 1;
$$;


ALTER FUNCTION "public"."vitrine_boutique"("p_ref" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vitrine_boutiques"() RETURNS TABLE("id" "uuid", "slug" "text", "nom" "text", "description" "text", "zone" "text", "categorie" "text", "logo_url" "text", "articles" integer, "note_moyenne" numeric, "avis" integer, "palier_livraisons" integer, "apercus" "text"[], "prix_min" numeric, "horaires" "jsonb", "pause_jusqua" timestamp with time zone, "vedette" "text", "vedette_commandes" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.id, b.slug, b.nom, b.description, b.zone, b.categorie, b.logo_url,
         (select count(*)
            from produits p
           where p.boutique_id = b.id
             and p.disponible is distinct from false)::int,
         (select round(avg(c.note_client), 1)
            from commandes c
           where c.boutique_id = b.id
             and c.note_client is not null),
         (select count(c.note_client)
            from commandes c
           where c.boutique_id = b.id)::int,
         (select case
                   when count(*) = 0   then 0
                   when count(*) < 10  then 1
                   when count(*) < 25  then 10
                   when count(*) < 50  then 25
                   when count(*) < 100 then 50
                   when count(*) < 250 then 100
                   when count(*) < 500 then 250
                   when count(*) < 1000 then 500
                   else 1000
                 end
            from commandes c
           where c.boutique_id = b.id
             and c.statut = 'livree')::int,

         (select coalesce(array_agg(a.photo_url order by a.rang), '{}'::text[])
            from (select p.photo_url,
                         row_number() over (
                           order by (v.nom_produit is not null and p.nom = v.nom_produit) desc,
                                    p.created_at nulls last, p.nom
                         ) as rang
                    from produits p
                   where p.boutique_id = b.id
                     and p.disponible is distinct from false
                     and coalesce(p.photo_url, '') <> ''
                   limit 4) a),

         (select min(p.prix)
            from produits p
           where p.boutique_id = b.id
             and p.disponible is distinct from false
             and coalesce(p.prix, 0) > 0),

         b.horaires,
         b.pause_jusqua,

         v.nom_produit,
         v.commandes::int

    from boutiques b

    left join lateral (
      select i.nom_produit, count(distinct c.id) as commandes
        from commande_items i
        join commandes c on c.id = i.commande_id
       where c.boutique_id = b.id
         and c.statut not in ('panier', 'abandonnee', 'annulee')
         and c.created_at > now() - interval '30 days'
       group by i.nom_produit
      having count(distinct c.id) >= 3
       order by count(distinct c.id) desc, sum(i.quantite) desc, i.nom_produit
       limit 1
    ) v on true

   where coalesce(b.actif, true)
     and coalesce(b.essai, false) is not true
     -- LE BRANCHEMENT, ajoute le 23 aout 2026.
     and (b.wasender_secret_id is not null or b.telegram_secret_id is not null)
     and nullif(btrim(coalesce(b.groupe_livreurs, '')), '') is not null
   order by b.nom;
$$;


ALTER FUNCTION "public"."vitrine_boutiques"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vitrine_produits"("p_ref" "text") RETURNS TABLE("id" "uuid", "nom" "text", "categorie" "text", "prix" numeric, "description" "text", "photo_url" "text", "menu_du_jour" boolean, "attribut_nom" "text", "attribut_valeurs" "text"[], "groupe" "text", "couleur" "text", "marque" "text", "public_vise" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."vitrine_produits"("p_ref" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."anomalies_signalees" (
    "reference" "text" NOT NULL,
    "type" "text" NOT NULL,
    "boutique" "text",
    "signale_le" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."anomalies_signalees" OWNER TO "postgres";


COMMENT ON TABLE "public"."anomalies_signalees" IS 'Memoire de la veille : une anomalie donnee sur une commande donnee n est annoncee QU UNE FOIS. La cle primaire (reference, type) est le verrou — pas un controle applicatif.';



CREATE TABLE IF NOT EXISTS "public"."boutiques" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "nom" "text",
    "description" "text",
    "logo_url" "text",
    "zone" "text",
    "categorie" "text",
    "telephone" "text",
    "slug" "text",
    "emoji" "text",
    "sheet_commandes" "text",
    "sheet_menu" "text",
    "groupe_livreurs" "text",
    "wasender_secret_id" "uuid",
    "telegram_secret_id" "uuid",
    "wasender_session_hash" "text",
    "telegram_marchand" "text",
    "sheet_notes" "text",
    "actif" boolean DEFAULT true NOT NULL,
    "sheet_document_id" "text",
    "webhook_secret_hash" "text",
    "telegram_webhook_secret_hash" "text",
    "telegram_bot_username" "text",
    "horaires" "jsonb",
    "pause_jusqua" timestamp with time zone,
    "essai" boolean DEFAULT false NOT NULL,
    "banc_telegram_id" "text",
    "delai_livraison" "text",
    "zones_livrees" "text",
    "paiements_acceptes" "text"[],
    "commande_minimum" integer,
    "mode_recuperation" "text" DEFAULT 'livraison'::"text" NOT NULL,
    "delai_preparation_min" integer,
    "livraison_offerte_des" integer,
    CONSTRAINT "boutiques_commande_minimum_positif" CHECK ((("commande_minimum" IS NULL) OR ("commande_minimum" > 0))),
    CONSTRAINT "boutiques_delai_preparation_positif" CHECK ((("delai_preparation_min" IS NULL) OR ("delai_preparation_min" > 0))),
    CONSTRAINT "boutiques_livraison_offerte_positive" CHECK ((("livraison_offerte_des" IS NULL) OR ("livraison_offerte_des" >= 0))),
    CONSTRAINT "boutiques_mode_recuperation_connu" CHECK (("mode_recuperation" = ANY (ARRAY['livraison'::"text", 'retrait'::"text", 'les_deux'::"text"])))
);


ALTER TABLE "public"."boutiques" OWNER TO "postgres";


COMMENT ON COLUMN "public"."boutiques"."slug" IS 'Identifiant lisible utilise dans les URL publiques (/boutiques/<slug>) et dans le champ boutique_id des webhooks n8n.';



COMMENT ON COLUMN "public"."boutiques"."sheet_commandes" IS 'Onglet Google Sheets des commandes de ce marchand (ex. Commandes_Zahara). NULL = repli sur les onglets par defaut.';



COMMENT ON COLUMN "public"."boutiques"."sheet_menu" IS 'Onglet Google Sheets du menu de ce marchand (ex. Menu_RoseMonde). NULL = repli sur les onglets par defaut.';



COMMENT ON COLUMN "public"."boutiques"."groupe_livreurs" IS 'Identifiant du groupe livreurs (JID WhatsApp / chat Telegram) alerte pour ce marchand.';



COMMENT ON COLUMN "public"."boutiques"."wasender_secret_id" IS 'Identifiant du secret Vault portant la cle API wasender. Le jeton n est jamais stocke dans cette table.';



COMMENT ON COLUMN "public"."boutiques"."telegram_secret_id" IS 'Identifiant du secret Vault portant le token du bot Telegram du marchand.';



COMMENT ON COLUMN "public"."boutiques"."wasender_session_hash" IS 'Empreinte SHA-256 du sessionId wasender. Sert a reconnaitre la boutique destinataire d un webhook. Sans valeur pour un attaquant : on ne peut pas envoyer avec une empreinte.';



COMMENT ON COLUMN "public"."boutiques"."webhook_secret_hash" IS 'sha256 hex du secret que le fournisseur (wasender) envoie en en-tete x-webhook-secret pour CE marchand. Distinct de wasender_session_hash, qui est l''empreinte du jeton API sortant. NULL = marchand pas encore migre : la fiche reste servie sans second facteur.';



COMMENT ON COLUMN "public"."boutiques"."telegram_webhook_secret_hash" IS 'sha256 hex du secret_token que Telegram renvoie en en-tete X-Telegram-Bot-Api-Secret-Token pour CE marchand. Pose par le branchement du bot, jamais saisi a la main.';



COMMENT ON COLUMN "public"."boutiques"."horaires" IS 'Horaires par jour : {"lun":{"ouvre":"11:00","ferme":"22:00"},"dim":null}. NULL = toujours ouvert. Heure d''Abidjan.';



COMMENT ON COLUMN "public"."boutiques"."pause_jusqua" IS 'Fermeture exceptionnelle jusqu''a cet instant. NULL ou date passee = ouverte. Se leve seule : un drapeau oublie fermerait la boutique des jours.';



COMMENT ON COLUMN "public"."boutiques"."essai" IS 'Boutique de test : ses commandes ne declenchent pas le dispatch livreurs. Faux par defaut — une vraie boutique ne devient jamais un banc d essai par accident.';



COMMENT ON COLUMN "public"."boutiques"."banc_telegram_id" IS 'Salon Telegram vers lequel TOUT message de cette boutique est detourne, canal et destinataire reels en prefixe. Renseigne uniquement sur les boutiques de banc : NULL sur toute boutique reelle. Voir envoyerMessage dans src/lib/canaux.ts.';



COMMENT ON COLUMN "public"."boutiques"."delai_livraison" IS 'Delai habituel annonce par le marchand : « 30 a 45 min ». NULL = non renseigne, la vitrine se tait.';



COMMENT ON COLUMN "public"."boutiques"."zones_livrees" IS 'Les quartiers livres, tels que le marchand les nomme. NULL = non renseigne.';



COMMENT ON COLUMN "public"."boutiques"."paiements_acceptes" IS 'Moyens de paiement acceptes a la livraison. NULL ou vide = non renseigne, jamais « aucun ».';



COMMENT ON COLUMN "public"."boutiques"."commande_minimum" IS 'Montant minimum en FCFA. NULL = pas de minimum, ce qui n est PAS zero.';



COMMENT ON COLUMN "public"."boutiques"."mode_recuperation" IS 'livraison | retrait | les_deux. Decide si un groupe de livreurs est exige.';



COMMENT ON COLUMN "public"."boutiques"."delai_preparation_min" IS 'Minutes pour preparer une commande, pour annoncer une heure de retrait. NULL = non renseigne, on n annonce rien.';



COMMENT ON COLUMN "public"."boutiques"."livraison_offerte_des" IS 'NULL = frais annonces par le livreur. 0 = toujours offerte. N > 0 = offerte a partir de N FCFA.';



CREATE TABLE IF NOT EXISTS "public"."commande_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "commande_id" "uuid" NOT NULL,
    "produit_id" "uuid",
    "nom_produit" "text" NOT NULL,
    "quantite" integer NOT NULL,
    "prix_unitaire" numeric NOT NULL,
    "variante" "text"
);


ALTER TABLE "public"."commande_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."commande_items"."variante" IS 'Le choix du client sur cette ligne : « Pointure 39 », « Taille M ». NULL = l article n en proposait pas.';



CREATE TABLE IF NOT EXISTS "public"."commandes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boutique_id" "uuid" NOT NULL,
    "client_nom" "text" NOT NULL,
    "client_telephone" "text" NOT NULL,
    "client_adresse" "text" NOT NULL,
    "total" numeric NOT NULL,
    "statut" "text" DEFAULT 'en_attente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reference" "text",
    "chat_id" "text",
    "canal" "text",
    "instructions" "text",
    "nom_livreur" "text",
    "statut_livraison" "text",
    "position_livreur" "text",
    "heure_prise_en_charge" timestamp with time zone,
    "heure_livraison" timestamp with time zone,
    "note_client" integer,
    "confirmation_statut" "text",
    "confirmation_heure" timestamp with time zone,
    "note_heure" timestamp with time zone,
    "latitude" double precision,
    "longitude" double precision,
    "position_recue_le" timestamp with time zone,
    "frais_livraison" numeric,
    "frais_annonces_le" timestamp with time zone,
    "relance_le" timestamp with time zone,
    "stock_decremente_le" timestamp with time zone,
    "client_prevenu_le" timestamp with time zone,
    "jeton_suivi" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "livreur_id" "uuid",
    "chat_cle" "text" GENERATED ALWAYS AS (
CASE
    WHEN (("regexp_replace"(COALESCE("chat_id", ''::"text"), '[^0-9]'::"text", ''::"text", 'g'::"text") ~ '^(0|225)'::"text") AND ("length"("regexp_replace"(COALESCE("chat_id", ''::"text"), '[^0-9]'::"text", ''::"text", 'g'::"text")) >= 8)) THEN "right"("regexp_replace"(COALESCE("chat_id", ''::"text"), '[^0-9]'::"text", ''::"text", 'g'::"text"), 8)
    ELSE NULL::"text"
END) STORED,
    "mode_recuperation" "text" DEFAULT 'livraison'::"text" NOT NULL,
    "heure_retrait" timestamp with time zone,
    CONSTRAINT "commandes_mode_recuperation_connu" CHECK (("mode_recuperation" = ANY (ARRAY['livraison'::"text", 'retrait'::"text"]))),
    CONSTRAINT "commandes_statut_check" CHECK (("statut" = ANY (ARRAY['panier'::"text", 'en_attente'::"text", 'en_preparation'::"text", 'en_livraison'::"text", 'livree'::"text", 'annulee'::"text", 'abandonnee'::"text"])))
);


ALTER TABLE "public"."commandes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."commandes"."reference" IS 'Reference lisible cote client (ZH-..., APP-...). Cle de correspondance avec Google Sheets pendant la periode de double ecriture.';



COMMENT ON COLUMN "public"."commandes"."chat_id" IS 'Identifiant de conversation WhatsApp (225XXXXXXXX) ou Telegram. Sert a retrouver le client entre deux messages.';



COMMENT ON COLUMN "public"."commandes"."canal" IS 'Origine de la commande : whatsapp, telegram ou app.';



COMMENT ON COLUMN "public"."commandes"."note_heure" IS 'Instant de la premiere note client. Sert de borne a la fenetre de correction ; nul pour les notes anterieures a la migration, qui sont definitives.';



COMMENT ON COLUMN "public"."commandes"."latitude" IS 'Point de livraison envoye par le client. Jamais deduit d''une adresse texte : un point calcule serait cru par le livreur.';



COMMENT ON COLUMN "public"."commandes"."frais_livraison" IS 'Frais annonces par le livreur a l''acceptation, en FCFA. NULL = pas encore annonce, jamais « gratuit ». Distinct de `total`, qui revient au marchand.';



COMMENT ON COLUMN "public"."commandes"."relance_le" IS 'Instant de la relance du panier abandonne. NULL = jamais relancee. Empeche la double relance d une meme commande.';



COMMENT ON COLUMN "public"."commandes"."stock_decremente_le" IS 'Instant du decompte de stock. NULL = jamais decompte. Sert de verrou : le decompte se reserve par une ecriture conditionnelle sur cette colonne, jamais par une lecture prealable.';



COMMENT ON COLUMN "public"."commandes"."client_prevenu_le" IS 'Heure ou la chaine a confirme avoir prevenu le client de l''acceptation. NULL = on ne sait pas, jamais « pas prevenu » : les commandes anterieures a la mise en service de ce marquage sont NULL sans que cela les accuse.';



COMMENT ON COLUMN "public"."commandes"."jeton_suivi" IS 'Jeton imprevisible porte par les liens de suivi et de confirmation. Ne doit JAMAIS etre renvoye par /api/suivi.';



COMMENT ON COLUMN "public"."commandes"."livreur_id" IS 'Fiche de l''annuaire du livreur qui a pris cette course, resolue depuis son identifiant Telegram a l''acceptation. NULL = on ne sait pas qui a livre : livreur absent de l''annuaire, ou course anterieure a l''attribution. NULL ne veut jamais dire « personne ».';



COMMENT ON COLUMN "public"."commandes"."chat_cle" IS 'Les 8 derniers chiffres du chat_id quand il a la forme d''un telephone ivoirien, sinon NULL. Sert a APPARIER un client dont le chat_id a ete enregistre sous plusieurs formes. Jamais a lui ecrire : pour cela, seul chat_id fait foi.';



COMMENT ON COLUMN "public"."commandes"."mode_recuperation" IS 'Ce que le client a choisi POUR CETTE COMMANDE. Un retrait n attend aucun livreur et aucun frais.';



COMMENT ON COLUMN "public"."commandes"."heure_retrait" IS 'L heure demandee par le client. NULL = des que pret. Ne vaut que pour un retrait.';



CREATE TABLE IF NOT EXISTS "public"."compteurs_fenetre" (
    "cle" "text" NOT NULL,
    "fenetre" timestamp with time zone NOT NULL,
    "valeur" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."compteurs_fenetre" OWNER TO "postgres";


COMMENT ON TABLE "public"."compteurs_fenetre" IS 'Compteurs partages sur une fenetre courte, pour les freins qui doivent tenir a travers plusieurs instances. Se purge seule : voir reserver_fenetre.';



CREATE TABLE IF NOT EXISTS "public"."compteurs_journaliers" (
    "cle" "text" NOT NULL,
    "jour" "date" NOT NULL,
    "valeur" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "compteurs_journaliers_valeur_positive" CHECK (("valeur" >= 0))
);


ALTER TABLE "public"."compteurs_journaliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."compteurs_journaliers" IS 'Compteurs partages par cle et par jour, pour plafonner les points d entree publics couteux. Ecrit uniquement par service_role via incrementer_compteur().';



CREATE TABLE IF NOT EXISTS "public"."demandes_droits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "telephone" "text" NOT NULL,
    "type" "text" NOT NULL,
    "reference" "text",
    "preuve" "text" NOT NULL,
    "statut" "text" DEFAULT 'recue'::"text" NOT NULL,
    "detail" "jsonb",
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "traite_le" timestamp with time zone,
    CONSTRAINT "demandes_droits_preuve_check" CHECK (("preuve" = ANY (ARRAY['jeton'::"text", 'telephone'::"text"]))),
    CONSTRAINT "demandes_droits_statut_check" CHECK (("statut" = ANY (ARRAY['recue'::"text", 'honoree'::"text", 'refusee'::"text"]))),
    CONSTRAINT "demandes_droits_type_check" CHECK (("type" = ANY (ARRAY['acces'::"text", 'effacement'::"text"])))
);


ALTER TABLE "public"."demandes_droits" OWNER TO "postgres";


COMMENT ON TABLE "public"."demandes_droits" IS 'Trace des demandes d''accès et d''effacement. Jamais purgée : c''est la preuve qu''un droit a été honoré.';



CREATE TABLE IF NOT EXISTS "public"."livraisons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "commande_id" "uuid",
    "livreur_id" "uuid",
    "statut" "text" DEFAULT 'assignee'::"text",
    "date_assignation" timestamp with time zone DEFAULT "now"(),
    "date_prise_en_charge" timestamp with time zone,
    "date_livraison" timestamp with time zone,
    "note_client" integer,
    "commentaire_client" "text",
    "distance_km" numeric,
    "gain_livreur" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."livraisons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."livreurs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boutique_id" "uuid",
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "nom" "text" NOT NULL,
    "telephone" "text" NOT NULL,
    "email" "text",
    "vehicule_type" "text",
    "vehicule_immatriculation" "text",
    "statut" "text" DEFAULT 'disponible'::"text",
    "latitude" numeric,
    "longitude" numeric,
    "taux_commission" numeric DEFAULT 10,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "telegram_id" "text",
    "code_invitation" "text",
    "rattache_le" timestamp with time zone
);


ALTER TABLE "public"."livreurs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."livreurs"."telegram_id" IS 'Identifiant Telegram du livreur, pose automatiquement quand il active son lien d''invitation. Jamais saisi a la main.';



COMMENT ON COLUMN "public"."livreurs"."code_invitation" IS 'Secret du lien t.me/<bot>?start=<code>. Regenerable par le marchand ; sans valeur une fois le livreur rattache si on choisit de le revoquer.';



CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boutique_id" "uuid",
    "whatsapp_numero" "text",
    "whatsapp_actif" boolean DEFAULT true,
    "telegram_chat_id" "text",
    "telegram_actif" boolean DEFAULT false,
    "notif_nouvelle_commande" boolean DEFAULT true,
    "notif_assignation_livreur" boolean DEFAULT true,
    "notif_statut_livraison" boolean DEFAULT true,
    "notif_rapport_quotidien" boolean DEFAULT true,
    "notif_stock_faible" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paiements" (
    "reference" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_key" "text" NOT NULL,
    "mois" integer NOT NULL,
    "montant_fcfa" integer NOT NULL,
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "operateur" "text",
    "jeton_prestataire" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paye_le" timestamp with time zone,
    "alerte_envoyee_le" timestamp with time zone,
    CONSTRAINT "paiements_mois_check" CHECK (("mois" > 0)),
    CONSTRAINT "paiements_montant_fcfa_check" CHECK (("montant_fcfa" >= 0)),
    CONSTRAINT "paiements_statut_check" CHECK (("statut" = ANY (ARRAY['en_attente'::"text", 'paye'::"text", 'echoue'::"text"])))
);


ALTER TABLE "public"."paiements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."paiements"."alerte_envoyee_le" IS 'Quand ce paiement bloque a ete signale. NULL = jamais signale. Empeche la repetition : on alerte une fois, puis on se tait.';



CREATE TABLE IF NOT EXISTS "public"."paniers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boutique_id" "uuid" NOT NULL,
    "telephone" "text" NOT NULL,
    "nom" "text",
    "lignes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "articles" integer DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "maj_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "converti_le" timestamp with time zone,
    "commande_id" "uuid"
);


ALTER TABLE "public"."paniers" OWNER TO "postgres";


COMMENT ON TABLE "public"."paniers" IS 'Paniers de la vitrine saisis mais non valides. Sert a MESURER ce qui se perd dans le tunnel, pas a constituer une liste de demarchage.';



CREATE TABLE IF NOT EXISTS "public"."pointages" (
    "cle" "text" NOT NULL,
    "dernier_le" timestamp with time zone DEFAULT "now"() NOT NULL,
    "detail" "text"
);


ALTER TABLE "public"."pointages" OWNER TO "postgres";


COMMENT ON TABLE "public"."pointages" IS 'Quand une tache s est executee POUR DE BON. Sert a detecter une tache qui NE TOURNE PLUS : une tache qui echoue crie toute seule, une tache qui ne demarre jamais est muette.';



COMMENT ON COLUMN "public"."pointages"."cle" IS 'Identifiant de la tache : sauvegarde_donnees, sauvegarde_schema…';



COMMENT ON COLUMN "public"."pointages"."dernier_le" IS 'Fin du dernier passage REUSSI. Ecrit apres coup, jamais avant : un pointage pose au demarrage mentirait sur un echec.';



CREATE TABLE IF NOT EXISTS "public"."produits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boutique_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text",
    "description" "text",
    "photo_url" "text",
    "prix" numeric,
    "categorie" "text",
    "disponible" boolean,
    "stock" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reference" "text",
    "stock_initial" integer,
    "seuil_alerte" integer,
    "menu_du_jour" boolean DEFAULT false NOT NULL,
    "quantite_stock" integer DEFAULT 0,
    "groupe" "text",
    "couleur" "text",
    "attribut_nom" "text",
    "attribut_valeurs" "text"[],
    "marque" "text",
    "public_vise" "text",
    CONSTRAINT "produits_attribut_complet" CHECK (((("attribut_nom" IS NULL) AND (("attribut_valeurs" IS NULL) OR ("cardinality"("attribut_valeurs") = 0))) OR ((NULLIF("btrim"("attribut_nom"), ''::"text") IS NOT NULL) AND ("attribut_valeurs" IS NOT NULL) AND ("cardinality"("attribut_valeurs") > 0))))
);


ALTER TABLE "public"."produits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."produits"."reference" IS 'Identifiant du produit dans la feuille Menu (colonne id). Sert de cle de correspondance pendant la migration.';



COMMENT ON COLUMN "public"."produits"."menu_du_jour" IS 'Plat mis en avant par l agent dans le menu du jour.';



COMMENT ON COLUMN "public"."produits"."groupe" IS 'Articles partageant ce libelle DANS UNE MEME BOUTIQUE = un seul article en plusieurs coloris. NULL = article simple, affiche seul comme avant.';



COMMENT ON COLUMN "public"."produits"."couleur" IS 'Le coloris de cette declinaison, tel que le client le lira : « blanc », « noir ». Sans groupe, il ne sert a rien.';



COMMENT ON COLUMN "public"."produits"."attribut_nom" IS 'Le nom que le marchand donne a la caracteristique : Pointure, Taille, Contenance. NULL = cet article n en a pas.';



COMMENT ON COLUMN "public"."produits"."attribut_valeurs" IS 'Les valeurs disponibles, dans l ordre voulu par le marchand. NULL ou vide = aucune a annoncer.';



COMMENT ON COLUMN "public"."produits"."marque" IS 'La marque de l article, telle que le client la cherche. NULL = le marchand ne la donne pas, la vitrine se tait.';



COMMENT ON COLUMN "public"."produits"."public_vise" IS 'Pour qui : Bebe, Enfant, Femme, Homme, Mixte. Texte libre — le marchand nomme son rayon. NULL = non renseigne.';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "endpoint" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "boutique_id" "uuid" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth_secret" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relances_envoyees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boutique" "text" NOT NULL,
    "telephone" "text" NOT NULL,
    "canal" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "motif" "text",
    "envoye_le" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."relances_envoyees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."relances_stop" (
    "boutique" "text" NOT NULL,
    "telephone" "text" NOT NULL,
    "motif" "text",
    "cree_le" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."relances_stop" OWNER TO "postgres";


COMMENT ON TABLE "public"."relances_stop" IS 'Numeros qui ont demande a ne plus etre sollicites. Ne bloque QUE les relances : un client qui commande recoit toujours sa confirmation, il a demande a ne plus etre demarche, pas a ne plus etre servi.';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "user_id" "uuid" NOT NULL,
    "plan_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "last_checkout_session_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."anomalies_signalees"
    ADD CONSTRAINT "anomalies_signalees_pkey" PRIMARY KEY ("reference", "type");



ALTER TABLE ONLY "public"."boutiques"
    ADD CONSTRAINT "boutiques_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boutiques"
    ADD CONSTRAINT "boutiques_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."commande_items"
    ADD CONSTRAINT "commande_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commandes"
    ADD CONSTRAINT "commandes_boutique_reference_unique" UNIQUE ("boutique_id", "reference");



ALTER TABLE ONLY "public"."commandes"
    ADD CONSTRAINT "commandes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compteurs_fenetre"
    ADD CONSTRAINT "compteurs_fenetre_pkey" PRIMARY KEY ("cle", "fenetre");



ALTER TABLE ONLY "public"."compteurs_journaliers"
    ADD CONSTRAINT "compteurs_journaliers_pkey" PRIMARY KEY ("cle", "jour");



ALTER TABLE ONLY "public"."demandes_droits"
    ADD CONSTRAINT "demandes_droits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."livreurs"
    ADD CONSTRAINT "livreurs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_boutique_id_key" UNIQUE ("boutique_id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paiements"
    ADD CONSTRAINT "paiements_pkey" PRIMARY KEY ("reference");



ALTER TABLE ONLY "public"."paniers"
    ADD CONSTRAINT "paniers_boutique_id_telephone_key" UNIQUE ("boutique_id", "telephone");



ALTER TABLE ONLY "public"."paniers"
    ADD CONSTRAINT "paniers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pointages"
    ADD CONSTRAINT "pointages_pkey" PRIMARY KEY ("cle");



ALTER TABLE ONLY "public"."produits"
    ADD CONSTRAINT "produits_boutique_reference_unique" UNIQUE ("boutique_id", "reference");



ALTER TABLE ONLY "public"."produits"
    ADD CONSTRAINT "produits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("endpoint");



ALTER TABLE ONLY "public"."relances_envoyees"
    ADD CONSTRAINT "relances_envoyees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."relances_stop"
    ADD CONSTRAINT "relances_stop_pkey" PRIMARY KEY ("boutique", "telephone");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "anomalies_signalees_recentes_idx" ON "public"."anomalies_signalees" USING "btree" ("signale_le" DESC);



CREATE UNIQUE INDEX "boutiques_wasender_session_hash_key" ON "public"."boutiques" USING "btree" ("wasender_session_hash") WHERE ("wasender_session_hash" IS NOT NULL);



CREATE INDEX "commandes_boutique_chat_cle_idx" ON "public"."commandes" USING "btree" ("boutique_id", "chat_cle") WHERE ("chat_cle" IS NOT NULL);



CREATE INDEX "commandes_confirmation_attente_idx" ON "public"."commandes" USING "btree" ("confirmation_statut", "created_at") WHERE ("confirmation_statut" = 'demandee'::"text");



CREATE UNIQUE INDEX "commandes_jeton_suivi_key" ON "public"."commandes" USING "btree" ("jeton_suivi");



CREATE INDEX "commandes_livreur_idx" ON "public"."commandes" USING "btree" ("livreur_id") WHERE ("livreur_id" IS NOT NULL);



CREATE UNIQUE INDEX "commandes_reference_globale_unique" ON "public"."commandes" USING "btree" ("upper"("reference")) WHERE ("reference" IS NOT NULL);



CREATE INDEX "commandes_retrait_a_venir_idx" ON "public"."commandes" USING "btree" ("heure_retrait") WHERE (("mode_recuperation" = 'retrait'::"text") AND ("heure_retrait" IS NOT NULL));



CREATE INDEX "commandes_sans_position" ON "public"."commandes" USING "btree" ("boutique_id", "created_at" DESC) WHERE ("latitude" IS NULL);



CREATE INDEX "commandes_stock_a_decompter_idx" ON "public"."commandes" USING "btree" ("boutique_id", "created_at") WHERE ("stock_decremente_le" IS NULL);



CREATE INDEX "commandes_veille_paniers_idx" ON "public"."commandes" USING "btree" ("created_at") WHERE ("statut" = 'panier'::"text");



CREATE INDEX "commandes_veille_sans_frais_idx" ON "public"."commandes" USING "btree" ("created_at" DESC) WHERE (("statut_livraison" = 'livre'::"text") AND ("frais_livraison" IS NULL));



CREATE INDEX "commandes_veille_sans_livreur_idx" ON "public"."commandes" USING "btree" ("created_at") WHERE (("statut" = 'en_attente'::"text") AND ("confirmation_statut" = 'confirmee'::"text") AND ("nom_livreur" IS NULL));



CREATE INDEX "commandes_veille_sans_nom_livreur_idx" ON "public"."commandes" USING "btree" ("created_at" DESC) WHERE (("statut_livraison" = 'livre'::"text") AND ("nom_livreur" IS NULL));



CREATE INDEX "commandes_veille_stock_idx" ON "public"."commandes" USING "btree" ("created_at" DESC) WHERE (("statut" = 'livree'::"text") AND ("stock_decremente_le" IS NULL));



CREATE INDEX "compteurs_fenetre_purge_idx" ON "public"."compteurs_fenetre" USING "btree" ("fenetre");



CREATE INDEX "demandes_droits_telephone_idx" ON "public"."demandes_droits" USING "btree" ("telephone", "cree_le" DESC);



CREATE INDEX "idx_boutiques_slug" ON "public"."boutiques" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_commande_items_commande" ON "public"."commande_items" USING "btree" ("commande_id");



CREATE INDEX "idx_commande_items_produit" ON "public"."commande_items" USING "btree" ("produit_id");



CREATE INDEX "idx_commandes_boutique" ON "public"."commandes" USING "btree" ("boutique_id");



CREATE INDEX "idx_commandes_boutique_created" ON "public"."commandes" USING "btree" ("boutique_id", "created_at" DESC);



CREATE INDEX "idx_commandes_chat_id" ON "public"."commandes" USING "btree" ("chat_id") WHERE ("chat_id" IS NOT NULL);



CREATE INDEX "idx_livraisons_commande" ON "public"."livraisons" USING "btree" ("commande_id");



CREATE INDEX "idx_livraisons_livreur" ON "public"."livraisons" USING "btree" ("livreur_id");



CREATE INDEX "idx_livreurs_boutique" ON "public"."livreurs" USING "btree" ("boutique_id");



CREATE INDEX "idx_livreurs_statut" ON "public"."livreurs" USING "btree" ("statut");



CREATE INDEX "idx_livreurs_user_id" ON "public"."livreurs" USING "btree" ("user_id");



CREATE INDEX "idx_notification_settings_boutique" ON "public"."notification_settings" USING "btree" ("boutique_id");



CREATE INDEX "idx_produits_boutique" ON "public"."produits" USING "btree" ("boutique_id");



CREATE UNIQUE INDEX "livreurs_boutique_telegram_unique" ON "public"."livreurs" USING "btree" ("boutique_id", "telegram_id") WHERE ("telegram_id" IS NOT NULL);



CREATE UNIQUE INDEX "livreurs_code_invitation_unique" ON "public"."livreurs" USING "btree" ("code_invitation") WHERE ("code_invitation" IS NOT NULL);



CREATE INDEX "livreurs_par_telegram" ON "public"."livreurs" USING "btree" ("telegram_id") WHERE ("telegram_id" IS NOT NULL);



CREATE UNIQUE INDEX "livreurs_telegram_unique" ON "public"."livreurs" USING "btree" ("boutique_id", "telegram_id") WHERE ("telegram_id" IS NOT NULL);



CREATE INDEX "paiements_alerte_envoyee_le_idx" ON "public"."paiements" USING "btree" ("alerte_envoyee_le") WHERE ("alerte_envoyee_le" IS NULL);



CREATE INDEX "paiements_statut_idx" ON "public"."paiements" USING "btree" ("statut");



CREATE INDEX "paiements_user_id_idx" ON "public"."paiements" USING "btree" ("user_id");



CREATE INDEX "paniers_abandonnes_idx" ON "public"."paniers" USING "btree" ("boutique_id", "maj_le" DESC) WHERE ("converti_le" IS NULL);



CREATE INDEX "produits_groupe_idx" ON "public"."produits" USING "btree" ("boutique_id", "groupe") WHERE ("groupe" IS NOT NULL);



CREATE INDEX "produits_marque_idx" ON "public"."produits" USING "btree" ("boutique_id", "marque") WHERE ("marque" IS NOT NULL);



CREATE INDEX "push_subscriptions_boutique_id_idx" ON "public"."push_subscriptions" USING "btree" ("boutique_id");



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "relances_envoyees_client_idx" ON "public"."relances_envoyees" USING "btree" ("boutique", "telephone", "envoye_le" DESC);



CREATE INDEX "relances_envoyees_jour_idx" ON "public"."relances_envoyees" USING "btree" ("boutique", "envoye_le" DESC);



CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_uidx" ON "public"."subscriptions" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_uidx" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "boutiques_limite_par_plan" BEFORE INSERT ON "public"."boutiques" FOR EACH ROW EXECUTE FUNCTION "public"."limiter_boutiques_par_plan"();



CREATE OR REPLACE TRIGGER "on_new_commande" AFTER INSERT OR UPDATE OF "statut" ON "public"."commandes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_n8n_new_commande"();



CREATE OR REPLACE TRIGGER "trg_set_boutique_user_id" BEFORE INSERT ON "public"."boutiques" FOR EACH ROW EXECUTE FUNCTION "public"."set_boutique_user_id"();



ALTER TABLE ONLY "public"."commande_items"
    ADD CONSTRAINT "commande_items_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "public"."commandes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commande_items"
    ADD CONSTRAINT "commande_items_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id");



ALTER TABLE ONLY "public"."commandes"
    ADD CONSTRAINT "commandes_boutique_id_fkey" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id");



ALTER TABLE ONLY "public"."commandes"
    ADD CONSTRAINT "commandes_livreur_id_fkey" FOREIGN KEY ("livreur_id") REFERENCES "public"."livreurs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "public"."commandes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."livraisons"
    ADD CONSTRAINT "livraisons_livreur_id_fkey" FOREIGN KEY ("livreur_id") REFERENCES "public"."livreurs"("id");



ALTER TABLE ONLY "public"."livreurs"
    ADD CONSTRAINT "livreurs_boutique_id_fkey" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."livreurs"
    ADD CONSTRAINT "livreurs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_boutique_id_fkey" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."paiements"
    ADD CONSTRAINT "paiements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."paniers"
    ADD CONSTRAINT "paniers_boutique_id_fkey" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."paniers"
    ADD CONSTRAINT "paniers_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "public"."commandes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."produits"
    ADD CONSTRAINT "produits_boutique_id_fkey" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_boutique_id_fkey" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relances_envoyees"
    ADD CONSTRAINT "relances_envoyees_boutique_fkey" FOREIGN KEY ("boutique") REFERENCES "public"."boutiques"("slug") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."relances_stop"
    ADD CONSTRAINT "relances_stop_boutique_fkey" FOREIGN KEY ("boutique") REFERENCES "public"."boutiques"("slug") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Ajouter des produits" ON "public"."produits" FOR INSERT TO "authenticated" WITH CHECK (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Créer sa boutique" ON "public"."boutiques" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Créer ses livraisons" ON "public"."livraisons" FOR INSERT TO "authenticated" WITH CHECK (("commande_id" IN ( SELECT "c"."id"
   FROM "public"."commandes" "c"
  WHERE ("c"."boutique_id" IN ( SELECT "boutiques"."id"
           FROM "public"."boutiques"
          WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Créer ses livreurs" ON "public"."livreurs" FOR INSERT TO "authenticated" WITH CHECK (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Créer ses paramètres" ON "public"."notification_settings" FOR INSERT TO "authenticated" WITH CHECK (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Mettre à jour ses propres commandes" ON "public"."commandes" FOR UPDATE TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Modifier sa boutique" ON "public"."boutiques" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Modifier ses livraisons" ON "public"."livraisons" FOR UPDATE TO "authenticated" USING (("commande_id" IN ( SELECT "c"."id"
   FROM "public"."commandes" "c"
  WHERE ("c"."boutique_id" IN ( SELECT "boutiques"."id"
           FROM "public"."boutiques"
          WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Modifier ses livreurs" ON "public"."livreurs" FOR UPDATE TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Modifier ses paramètres" ON "public"."notification_settings" FOR UPDATE TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Modifier ses produits" ON "public"."produits" FOR UPDATE TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Supprimer ses livreurs" ON "public"."livreurs" FOR DELETE TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Supprimer ses produits" ON "public"."produits" FOR DELETE TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Voir les articles de ses commandes" ON "public"."commande_items" FOR SELECT TO "authenticated" USING (("commande_id" IN ( SELECT "c"."id"
   FROM "public"."commandes" "c"
  WHERE ("c"."boutique_id" IN ( SELECT "boutiques"."id"
           FROM "public"."boutiques"
          WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Voir les produits de sa boutique" ON "public"."produits" FOR SELECT TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Voir sa propre boutique" ON "public"."boutiques" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Voir ses livraisons" ON "public"."livraisons" FOR SELECT TO "authenticated" USING (("commande_id" IN ( SELECT "c"."id"
   FROM "public"."commandes" "c"
  WHERE ("c"."boutique_id" IN ( SELECT "boutiques"."id"
           FROM "public"."boutiques"
          WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Voir ses livreurs" ON "public"."livreurs" FOR SELECT TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Voir ses paramètres" ON "public"."notification_settings" FOR SELECT TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Voir ses propres commandes" ON "public"."commandes" FOR SELECT TO "authenticated" USING (("boutique_id" IN ( SELECT "boutiques"."id"
   FROM "public"."boutiques"
  WHERE ("boutiques"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."anomalies_signalees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boutiques" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commande_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commandes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compteurs_fenetre" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compteurs_journaliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demandes_droits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."livraisons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."livreurs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paiements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "paiements_select_own" ON "public"."paiements" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."paniers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "paniers_lecture_marchand" ON "public"."paniers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."boutiques" "b"
  WHERE (("b"."id" = "paniers"."boutique_id") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."pointages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."produits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_select_own" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."relances_envoyees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "relances_envoyees_lecture_marchand" ON "public"."relances_envoyees" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."boutiques" "b"
  WHERE (("b"."slug" = "relances_envoyees"."boutique") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."relances_stop" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "relances_stop_lecture_marchand" ON "public"."relances_stop" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."boutiques" "b"
  WHERE (("b"."slug" = "relances_stop"."boutique") AND ("b"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_select_own" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."commandes";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































GRANT ALL ON FUNCTION "public"."borne_periode"("p_periode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."borne_periode"("p_periode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."borne_periode"("p_periode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canaux_par_commande"("p_commande" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canaux_par_commande"("p_commande" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canaux_par_session"("p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canaux_par_session"("p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canaux_par_slug"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canaux_par_slug"("p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decrementer_stock"("p_produit" "uuid", "p_quantite" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrementer_stock"("p_produit" "uuid", "p_quantite" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."definir_jeton_canal"("p_slug" "text", "p_canal" "text", "p_jeton" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_jeton_canal"("p_slug" "text", "p_canal" "text", "p_jeton" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."definir_secret_webhook"("p_slug" "text", "p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_secret_webhook"("p_slug" "text", "p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."definir_secret_webhook_telegram"("p_slug" "text", "p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_secret_webhook_telegram"("p_slug" "text", "p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."definir_session_wasender"("p_slug" "text", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."definir_session_wasender"("p_slug" "text", "p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."empreinte_session"("p_valeur" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."empreinte_session"("p_valeur" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."empreinte_session"("p_valeur" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."incrementer_compteur"("p_cle" "text", "p_plafond" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."incrementer_compteur"("p_cle" "text", "p_plafond" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."jeton_canal"("p_boutique" "text", "p_canal" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jeton_canal"("p_boutique" "text", "p_canal" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."limiter_boutiques_par_plan"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."limiter_boutiques_par_plan"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_n8n_new_commande"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_n8n_new_commande"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prolonger_acces"("p_user_id" "uuid", "p_plan_key" "text", "p_mois" integer, "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prolonger_acces"("p_user_id" "uuid", "p_plan_key" "text", "p_mois" integer, "p_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapport_activite"("p_periode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapport_activite"("p_periode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapport_clients"("p_periode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapport_clients"("p_periode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapport_retards"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapport_retards"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapport_stocks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapport_stocks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapport_top_plats"("p_periode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapport_top_plats"("p_periode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserver_fenetre"("p_cle" "text", "p_plafond" integer, "p_secondes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserver_fenetre"("p_cle" "text", "p_plafond" integer, "p_secondes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserver_relance"("p_boutique" "text", "p_telephone" "text", "p_motif" "text", "p_jours" integer, "p_plafond_jour" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserver_relance"("p_boutique" "text", "p_telephone" "text", "p_motif" "text", "p_jours" integer, "p_plafond_jour" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."secret_webhook_n8n"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."secret_webhook_n8n"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_boutique_user_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_boutique_user_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."vitrine_boutique"("p_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vitrine_boutique"("p_ref" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."vitrine_boutique"("p_ref" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vitrine_boutique"("p_ref" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vitrine_boutiques"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vitrine_boutiques"() TO "anon";
GRANT ALL ON FUNCTION "public"."vitrine_boutiques"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vitrine_boutiques"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."vitrine_produits"("p_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vitrine_produits"("p_ref" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."vitrine_produits"("p_ref" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vitrine_produits"("p_ref" "text") TO "service_role";





















GRANT ALL ON TABLE "public"."anomalies_signalees" TO "anon";
GRANT ALL ON TABLE "public"."anomalies_signalees" TO "authenticated";
GRANT ALL ON TABLE "public"."anomalies_signalees" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."boutiques" TO "anon";
GRANT ALL ON TABLE "public"."boutiques" TO "authenticated";
GRANT ALL ON TABLE "public"."boutiques" TO "service_role";



GRANT ALL ON TABLE "public"."commande_items" TO "anon";
GRANT ALL ON TABLE "public"."commande_items" TO "authenticated";
GRANT ALL ON TABLE "public"."commande_items" TO "service_role";



GRANT ALL ON TABLE "public"."commandes" TO "anon";
GRANT ALL ON TABLE "public"."commandes" TO "authenticated";
GRANT ALL ON TABLE "public"."commandes" TO "service_role";



GRANT ALL ON TABLE "public"."compteurs_fenetre" TO "anon";
GRANT ALL ON TABLE "public"."compteurs_fenetre" TO "authenticated";
GRANT ALL ON TABLE "public"."compteurs_fenetre" TO "service_role";



GRANT ALL ON TABLE "public"."compteurs_journaliers" TO "service_role";



GRANT ALL ON TABLE "public"."demandes_droits" TO "anon";
GRANT ALL ON TABLE "public"."demandes_droits" TO "authenticated";
GRANT ALL ON TABLE "public"."demandes_droits" TO "service_role";



GRANT ALL ON TABLE "public"."livraisons" TO "anon";
GRANT ALL ON TABLE "public"."livraisons" TO "authenticated";
GRANT ALL ON TABLE "public"."livraisons" TO "service_role";



GRANT ALL ON TABLE "public"."livreurs" TO "anon";
GRANT ALL ON TABLE "public"."livreurs" TO "authenticated";
GRANT ALL ON TABLE "public"."livreurs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."paiements" TO "anon";
GRANT ALL ON TABLE "public"."paiements" TO "authenticated";
GRANT ALL ON TABLE "public"."paiements" TO "service_role";



GRANT ALL ON TABLE "public"."paniers" TO "anon";
GRANT ALL ON TABLE "public"."paniers" TO "authenticated";
GRANT ALL ON TABLE "public"."paniers" TO "service_role";



GRANT ALL ON TABLE "public"."pointages" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."produits" TO "anon";
GRANT ALL ON TABLE "public"."produits" TO "authenticated";
GRANT ALL ON TABLE "public"."produits" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."relances_envoyees" TO "anon";
GRANT ALL ON TABLE "public"."relances_envoyees" TO "authenticated";
GRANT ALL ON TABLE "public"."relances_envoyees" TO "service_role";



GRANT ALL ON TABLE "public"."relances_stop" TO "anon";
GRANT ALL ON TABLE "public"."relances_stop" TO "authenticated";
GRANT ALL ON TABLE "public"."relances_stop" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































