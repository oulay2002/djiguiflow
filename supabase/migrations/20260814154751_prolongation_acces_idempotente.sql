create or replace function public.prolonger_acces(
  p_user_id uuid,
  p_plan_key text,
  p_mois integer,
  p_reference text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin timestamptz;
begin
  if p_mois is null or p_mois <= 0 then
    raise exception 'prolonger_acces : nombre de mois invalide (%)', p_mois;
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'prolonger_acces : reference de paiement absente';
  end if;

  insert into public.subscriptions as s (
    user_id, plan_key, status,
    current_period_start, current_period_end,
    last_checkout_session_id, updated_at
  )
  values (
    p_user_id, p_plan_key, 'active',
    now(), now() + (p_mois * interval '30 days'),
    p_reference, now()
  )
  on conflict (user_id) do update
    set plan_key = excluded.plan_key,
        status = 'active',
        current_period_start = now(),
        current_period_end = greatest(s.current_period_end, now()) + (p_mois * interval '30 days'),
        last_checkout_session_id = p_reference,
        updated_at = now()
    where s.last_checkout_session_id is distinct from p_reference
  returning s.current_period_end into v_fin;

  if v_fin is null then
    select s2.current_period_end into v_fin
    from public.subscriptions s2
    where s2.user_id = p_user_id;
  end if;

  return v_fin;
end;
$$;

revoke all on function public.prolonger_acces(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.prolonger_acces(uuid, text, integer, text)
  to service_role;
