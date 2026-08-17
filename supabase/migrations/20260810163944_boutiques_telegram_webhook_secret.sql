alter table public.boutiques
  add column if not exists telegram_webhook_secret_hash text;

comment on column public.boutiques.telegram_webhook_secret_hash is
  'sha256 hex du secret_token que Telegram renvoie en en-tete X-Telegram-Bot-Api-Secret-Token pour CE marchand. Pose par le branchement du bot, jamais saisi a la main.';

create or replace function public.definir_secret_webhook_telegram(p_slug text, p_secret text)
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
     set telegram_webhook_secret_hash = public.empreinte_session(p_secret)
   where slug = p_slug;
end;
$function$;
