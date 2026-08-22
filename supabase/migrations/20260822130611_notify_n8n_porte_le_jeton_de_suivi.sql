-- Le declencheur transmet le jeton de suivi.
--
-- POURQUOI ICI ET PAS DANS n8n. Le workflow `confirmation-client` demarre sur
-- ce webhook : sa seule source de donnees est cette charge utile. Sans le
-- jeton, il ne peut construire qu'un lien devinable — et une reference de
-- commande se devine, la base portant des compteurs sequentiels
-- (`ATT-1000000006`) et des formes batie sur le telephone du client
-- (`APP-<telephone>-<horodatage unix>`).
--
-- L'alternative etait de faire faire a n8n un appel HTTP de plus par commande,
-- pour aller rechercher ce qu'on a deja sous la main au moment ou l'on parle.
-- Une ligne de charge utile coute moins qu'une requete par commande, et elle ne
-- peut pas echouer a mi-chemin.
--
-- CE QUE CETTE MIGRATION NE CHANGE PAS. Les conditions restent identiques au
-- mot pres : un panier en cours de collecte se tait, une mise a jour ne parle
-- que sur la transition depuis `panier`, une boutique d'essai ne reveille
-- personne. Seule la charge utile s'enrichit d'un champ, et un champ inconnu
-- est ignore par les workflows qui ne le lisent pas encore : rien ne casse
-- pendant que n8n reste en brouillon.
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
