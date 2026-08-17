alter table public.boutiques
  add column if not exists webhook_secret_hash text;

comment on column public.boutiques.webhook_secret_hash is
  'sha256 hex du secret que le fournisseur (wasender) envoie en en-tete x-webhook-secret pour CE marchand. Distinct de wasender_session_hash, qui est l''empreinte du jeton API sortant. NULL = marchand pas encore migre : la fiche reste servie sans second facteur.';

-- Pose l'empreinte sans jamais ecrire le secret en clair dans la table.
create or replace function public.definir_secret_webhook(p_slug text, p_secret text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.boutiques where slug = p_slug) then
    raise exception 'boutique introuvable: %', p_slug;
  end if;

  update public.boutiques
     set webhook_secret_hash = public.empreinte_session(p_secret)
   where slug = p_slug;
end;
$function$;
