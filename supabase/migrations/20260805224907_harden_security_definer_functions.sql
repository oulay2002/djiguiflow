create or replace function public.notify_n8n_new_livraison()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  response public.http_response;
  payload json;
  n8n_webhook_url text := 'https://oulai2002.app.n8n.cloud/webhook/nouvelle-livraison';
  livreur_data record;
  commande_data record;
begin
  select * into livreur_data from public.livreurs where id = NEW.livreur_id;

  select * into commande_data from public.commandes where id = NEW.commande_id;

  payload := json_build_object(
    'livraison_id', NEW.id,
    'livreur_nom', livreur_data.nom,
    'livreur_telephone', livreur_data.telephone,
    'livreur_type', livreur_data.type,
    'commande_id', commande_data.id,
    'client_nom', commande_data.client_nom,
    'client_telephone', commande_data.client_telephone,
    'client_adresse', commande_data.client_adresse,
    'total', commande_data.total,
    'statut', NEW.statut,
    'date_assignation', NEW.date_assignation
  );

  select * into response from public.http_post(
    n8n_webhook_url,
    payload::text,
    'application/json'
  );

  if response.status != 200 then
    raise warning 'N8N Webhook livraison failed: status %', response.status;
  end if;

  return NEW;
end;
$function$;

create or replace function public.notify_n8n_statut_livraison()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  response public.http_response;
  payload json;
  n8n_webhook_url text := 'https://oulai2002.app.n8n.cloud/webhook/statut-livraison';
  commande_data record;
begin
  select * into commande_data from public.commandes where id = NEW.commande_id;

  payload := json_build_object(
    'livraison_id', NEW.id,
    'commande_id', commande_data.id,
    'client_nom', commande_data.client_nom,
    'client_telephone', commande_data.client_telephone,
    'ancien_statut', OLD.statut,
    'nouveau_statut', NEW.statut,
    'date_livraison', NEW.date_livraison
  );

  select * into response from public.http_post(
    n8n_webhook_url,
    payload::text,
    'application/json'
  );

  if response.status != 200 then
    raise warning 'N8N Webhook statut failed: status %', response.status;
  end if;

  return NEW;
end;
$function$;

create or replace function public.set_boutique_user_id()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.user_id is null then
    new.user_id := (select auth.uid());
  end if;

  if new.user_id is null then
    raise exception 'user_id is required. Insert from an authenticated context or provide user_id explicitly.';
  end if;

  return new;
end;
$function$;

revoke execute on function public.notify_n8n_new_commande()     from public, anon, authenticated;
revoke execute on function public.notify_n8n_new_livraison()    from public, anon, authenticated;
revoke execute on function public.notify_n8n_statut_livraison() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()             from public, anon, authenticated;
revoke execute on function public.set_boutique_user_id()        from public, anon, authenticated;
