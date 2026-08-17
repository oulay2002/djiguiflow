-- Bascule du webhook « nouvelle commande » vers le n8n auto-heberge.
--
-- L'URL etait ecrite EN DUR dans cette fonction, et c'est le pointeur le plus
-- facile a oublier lors d'un demenagement de n8n : rien dans l'application ne
-- le mentionne, aucune variable d'environnement ne le porte. L'oublier ferait
-- disparaitre toutes les nouvelles commandes en silence — net.http_post ne
-- leve pas, et le declencheur avale deja ses erreurs.
--
-- n8n Cloud est a l'arret depuis le 15 aout 12h UTC (quota d'executions
-- epuise), donc cette bascule ne peut rien casser : elle restaure.
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
  n8n_webhook_url text := 'https://n8n.djiguiflow.com/webhook/nouvelle-commande';
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
