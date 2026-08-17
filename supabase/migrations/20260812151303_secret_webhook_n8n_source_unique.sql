-- Le secret des webhooks n8n vivait en trois exemplaires : la credential n8n,
-- la variable Vercel `N8N_WEBHOOK_SECRET`, et ce coffre. Les declencheurs
-- Postgres lisaient le coffre, l'application lisait Vercel — et le 12 aout
-- 2026, une rotation faite sur deux des trois a fait echouer les trois
-- declencheurs en 403 sans que rien ne le signale : plus aucun marchand
-- n'etait prevenu d'une nouvelle commande.
--
-- Le coffre devient la source unique. L'application le lit par cette fonction,
-- comme elle lit deja les jetons de canal. Il ne reste alors que deux endroits
-- a tenir accordes — le coffre et n8n, qui doit bien connaitre ce qu'il
-- verifie — au lieu de trois.
create or replace function public.secret_webhook_n8n()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = 'n8n_webhook_secret'
   limit 1;
$function$;

-- Seul le serveur appelle : ce secret ouvre les webhooks de production.
revoke execute on function public.secret_webhook_n8n() from public, anon, authenticated;
grant execute on function public.secret_webhook_n8n() to service_role;
