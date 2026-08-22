-- LE MARCHAND N'EST PREVENU QUE D'UNE VRAIE COMMANDE.
--
-- Ce declencheur previent a CHAQUE insertion. Deux situations le rendaient
-- nuisible depuis le decouplage de Google Sheets du 21 aout :
--
-- 1. UN PANIER EN COURS DE COLLECTE N'EST PAS UNE COMMANDE. L'assistante ecrit
--    desormais la ligne des le premier article choisi, en statut `panier`. Le
--    marchand recevait donc « Nouvelle commande » pour un panier que le client
--    n'a pas encore confirme — et parfois ne confirmera jamais. La promotion
--    `panier -> en_attente` est le moment ou la commande devient reelle ; c'est
--    de celui-la qu'il faut le prevenir.
--
-- 2. UNE BOUTIQUE D'ESSAI NE REVEILLE PERSONNE. Le drapeau `essai` etait honore
--    dans la route de commande, mais cette notification-ci part de POSTGRES :
--    aucun code applicatif ne pouvait la taire. Le banc multi-marchand
--    declenchait donc une alerte marchand a chaque passage.
--
-- On ajoute aussi `boutique_id` a la charge utile : le workflow le redemandait
-- ensuite par un appel separe, alors qu'on l'a sous la main.
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
  v_essai boolean;
  n8n_webhook_url text := 'https://n8n.djiguiflow.com/webhook/nouvelle-commande';
begin
  -- Un panier en cours de collecte n'a pas a etre annonce.
  if new.statut = 'panier' then
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
