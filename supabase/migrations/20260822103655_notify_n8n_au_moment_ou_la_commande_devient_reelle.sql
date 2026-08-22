-- PREVENIR AU MOMENT OU LA COMMANDE DEVIENT REELLE, PAS QUAND LA LIGNE NAIT.
--
-- Le declencheur ne portait que sur INSERT. C'etait juste tant que toute
-- commande naissait complete. Depuis le decouplage du 21 aout, l'assistante
-- ecrit d'abord un `panier` puis le PROMEUT en `en_attente` : ignorer les
-- paniers sans ecouter la promotion aurait prive le marchand de toute
-- notification sur les commandes prises par l'assistante — c'est-a-dire la
-- majorite.
--
-- Le bon evenement n'est ni l'insertion ni la mise a jour : c'est la TRANSITION
-- vers une commande reelle. Elle se produit dans les deux cas.
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

-- Le declencheur ecoute desormais les deux evenements. La fonction, elle, ne
-- laisse passer que la transition.
drop trigger if exists on_new_commande on public.commandes;
create trigger on_new_commande
  after insert or update of statut on public.commandes
  for each row execute function public.notify_n8n_new_commande();
