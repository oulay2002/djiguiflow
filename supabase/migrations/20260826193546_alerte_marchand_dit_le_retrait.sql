-- LE MARCHAND NE POUVAIT PAS SAVOIR QUE C'ETAIT UN RETRAIT.
--
-- Son alerte est composee par « Nouvelle Commande → Marchand », qui ne connait
-- de la commande que ce que CE declencheur lui envoie. Le payload est construit
-- champ par champ, volontairement — et `mode_recuperation` n'y etait pas.
--
-- Le marchand lisait donc, pour une commande a emporter :
--
--     📍 Adresse : Non renseignee
--
-- c'est-a-dire exactement ce qu'il lit d'une livraison dont le client a oublie
-- son adresse. Il rappelle un client qui n'a rien oublie, pour lui demander une
-- adresse qu'il n'a pas a donner.
--
-- ── POURQUOI `create or replace`, ET PAS UN `drop` ────────────────────────
--
-- Cette fonction est SECURITY DEFINER. Un `drop` remettrait ses droits a la
-- valeur par defaut de Postgres — EXECUTE a PUBLIC — et le `grant` pose ensuite
-- n'en retirerait rien. Le corps seul change ici : `create or replace` conserve
-- l'ACL, et il n'y a donc rien a reposer derriere.
-- Voir scripts/verifier-fonctions-definer.mjs.
--
-- ── CE QU'ON AJOUTE, ET RIEN DE PLUS ──────────────────────────────────────
--
-- `mode_recuperation` et `heure_retrait`. Le reste du payload est recopie a
-- l'identique : ce declencheur porte le jeton de suivi, et une omission ici
-- rendrait indevinable le lien que n8n ne saurait plus composer.
--
-- `heure_retrait` peut valoir NULL, et cela VEUT DIRE QUELQUE CHOSE : « des que
-- pret ». Le message du marchand distingue les deux.

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
$function$;
