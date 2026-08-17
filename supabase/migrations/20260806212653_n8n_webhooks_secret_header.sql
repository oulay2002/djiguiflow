-- Authentifie les appels sortants vers les webhooks n8n.
-- Le secret vit dans Supabase Vault, jamais en dur dans le code.
--
-- Au passage, notify_n8n_new_livraison et notify_n8n_statut_livraison
-- passent de l'extension http (SYNCHRONE, sans gestion d'erreur) a pg_net
-- (asynchrone) : un n8n injoignable faisait echouer la transaction, donc
-- bloquait l'assignation d'un livreur ou le changement de statut.

create or replace function public.notify_n8n_new_commande()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload jsonb;
  req_id bigint;
  v_secret text;
  n8n_webhook_url text := 'https://oulai2002.app.n8n.cloud/webhook/nouvelle-commande';
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'n8n_webhook_secret' limit 1;

  payload := jsonb_build_object(
    'id', new.id,
    'client_nom', new.client_nom,
    'client_telephone', new.client_telephone,
    'client_adresse', new.client_adresse,
    'total', new.total,
    'statut', new.statut,
    'created_at', new.created_at
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
$function$;

create or replace function public.notify_n8n_new_livraison()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload jsonb;
  req_id bigint;
  v_secret text;
  n8n_webhook_url text := 'https://oulai2002.app.n8n.cloud/webhook/nouvelle-livraison';
  livreur_data record;
  commande_data record;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'n8n_webhook_secret' limit 1;

  select * into livreur_data from public.livreurs where id = new.livreur_id;
  select * into commande_data from public.commandes where id = new.commande_id;

  payload := jsonb_build_object(
    'livraison_id', new.id,
    'livreur_nom', livreur_data.nom,
    'livreur_telephone', livreur_data.telephone,
    'livreur_type', livreur_data.type,
    'commande_id', commande_data.id,
    'client_nom', commande_data.client_nom,
    'client_telephone', commande_data.client_telephone,
    'client_adresse', commande_data.client_adresse,
    'total', commande_data.total,
    'statut', new.statut,
    'date_assignation', new.date_assignation
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
      raise warning 'N8N webhook enqueue failed for livraison id=%: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

create or replace function public.notify_n8n_statut_livraison()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload jsonb;
  req_id bigint;
  v_secret text;
  n8n_webhook_url text := 'https://oulai2002.app.n8n.cloud/webhook/statut-livraison';
  commande_data record;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'n8n_webhook_secret' limit 1;

  select * into commande_data from public.commandes where id = new.commande_id;

  payload := jsonb_build_object(
    'livraison_id', new.id,
    'commande_id', commande_data.id,
    'client_nom', commande_data.client_nom,
    'client_telephone', commande_data.client_telephone,
    'ancien_statut', old.statut,
    'nouveau_statut', new.statut,
    'date_livraison', new.date_livraison
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
      raise warning 'N8N webhook enqueue failed for statut livraison id=%: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;
