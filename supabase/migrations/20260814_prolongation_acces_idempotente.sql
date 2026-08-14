-- Prolongation d'acces idempotente par reference de paiement.
--
-- LE DEFAUT CORRIGE. La route de notification CinetPay lisait le statut du
-- paiement, verifiait la transaction chez le prestataire, PUIS prolongeait
-- l'acces et marquait « paye ». Entre la lecture et l'ecriture s'intercalait un
-- appel sortant de plusieurs centaines de millisecondes. Le prestataire rejoue
-- ses notifications : deux rejeux concurrents lisaient tous deux
-- « en_attente », concluaient tous deux « accepte », et prolongeaient tous deux
-- l'acces. Un seul paiement ouvrait deux fois la duree achetee.
--
-- `prolongerAcces` ne pouvait pas s'en proteger cote application : elle lisait
-- `current_period_end` puis ecrivait, en deux instructions. Ce sont ces deux
-- instructions qu'on fond ici en une seule, ou le verrou de ligne du ON
-- CONFLICT rend la sequence indivisible.
--
-- L'idempotence s'appuie sur `last_checkout_session_id`, qui porte deja la
-- reference du paiement : si la reference presente est celle qu'on applique,
-- la prolongation a deja eu lieu et le WHERE bloque la mise a jour. La
-- fonction rend alors la fin de periode existante, sans rien deplacer.
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
    -- Le depart est le PLUS TARDIF entre maintenant et la fin courante : un
    -- marchand qui renouvelle en avance ne perd pas les jours qui lui restent.
    -- GREATEST ignore les NULL, ce qui couvre une fiche sans periode.
    set plan_key = excluded.plan_key,
        status = 'active',
        current_period_start = now(),
        current_period_end = greatest(s.current_period_end, now()) + (p_mois * interval '30 days'),
        last_checkout_session_id = p_reference,
        updated_at = now()
    where s.last_checkout_session_id is distinct from p_reference
  returning s.current_period_end into v_fin;

  -- Rien n'est revenu : le WHERE a bloque la mise a jour, donc cette reference
  -- avait deja ete appliquee. Ce n'est pas une erreur, c'est le rejeu qu'on
  -- voulait absorber — on rend la periode telle qu'elle est.
  if v_fin is null then
    select s2.current_period_end into v_fin
    from public.subscriptions s2
    where s2.user_id = p_user_id;
  end if;

  return v_fin;
end;
$$;

-- Une fonction SECURITY DEFINER est exposee a `anon` par defaut : sans ce
-- retrait, n'importe quel visiteur de la vitrine pourrait s'ouvrir un acces
-- payant en appelant /rest/v1/rpc/prolonger_acces. Seul le service_role, dont
-- la cle ne quitte jamais le serveur, doit pouvoir l'appeler.
revoke all on function public.prolonger_acces(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.prolonger_acces(uuid, text, integer, text)
  to service_role;
