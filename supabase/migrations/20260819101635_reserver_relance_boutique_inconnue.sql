-- Une boutique inconnue doit se REFUSER, pas LEVER.
--
-- La version precedente laissait remonter une violation de cle etrangere. Cote
-- appelant, cela devient une exception a rattraper — et un throw n8n perd son
-- texte des qu'il contient un retour a la ligne ou un deux-points : l'alerte
-- technique n'aurait recu que « Unknown error ». Un refus nomme vaut mieux.
create or replace function public.reserver_relance(
  p_boutique      text,
  p_telephone     text,
  p_motif         text    default null,
  p_jours         integer default 30,
  p_plafond_jour  integer default 25
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_derniere timestamptz;
  v_jour     integer;
begin
  if coalesce(trim(p_boutique), '') = '' or coalesce(trim(p_telephone), '') = '' then
    return jsonb_build_object('autorise', false, 'motif', 'parametres_manquants');
  end if;

  if not exists (select 1 from boutiques where slug = p_boutique) then
    return jsonb_build_object('autorise', false, 'motif', 'boutique_inconnue');
  end if;

  -- Deux demandes simultanees pour le meme client liraient sinon toutes deux
  -- « aucune relance recente » et enverraient deux fois.
  perform pg_advisory_xact_lock(hashtext(p_boutique || '|' || p_telephone));

  if exists (
    select 1 from relances_stop
    where boutique = p_boutique and telephone = p_telephone
  ) then
    return jsonb_build_object('autorise', false, 'motif', 'stop');
  end if;

  select max(envoye_le) into v_derniere
  from relances_envoyees
  where boutique = p_boutique and telephone = p_telephone;

  if v_derniere is not null and v_derniere > now() - make_interval(days => p_jours) then
    return jsonb_build_object('autorise', false, 'motif', 'trop_recent', 'derniere', v_derniere);
  end if;

  select count(*) into v_jour
  from relances_envoyees
  where boutique = p_boutique and envoye_le > now() - interval '24 hours';

  if v_jour >= p_plafond_jour then
    return jsonb_build_object('autorise', false, 'motif', 'plafond_jour', 'compte', v_jour);
  end if;

  insert into relances_envoyees (boutique, telephone, motif)
  values (p_boutique, p_telephone, p_motif);

  return jsonb_build_object('autorise', true);
exception
  -- Filet : quoi qu'il arrive ici, on REFUSE. Le pire resultat possible serait
  -- qu'une panne de la table de comptage ouvre les vannes.
  when others then
    return jsonb_build_object('autorise', false, 'motif', 'erreur_interne');
end
$$;

revoke all on function public.reserver_relance(text, text, text, integer, integer) from public;
revoke all on function public.reserver_relance(text, text, text, integer, integer) from anon;
revoke all on function public.reserver_relance(text, text, text, integer, integer) from authenticated;
grant execute on function public.reserver_relance(text, text, text, integer, integer) to service_role;
