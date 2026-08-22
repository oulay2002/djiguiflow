-- LE FREIN AVANT LA VOITURE.
--
-- WhatsApp ne bannit pas au volume : il bannit au PREMIER CONTACT. Un numero
-- qui ouvre trente conversations qu'on ne lui a pas demande d'ouvrir est
-- signale en quelques heures, et le marchand perd alors son canal principal —
-- pas seulement sa campagne.
--
-- Ces deux tables et cette fonction existent AVANT toute relance, pour que le
-- jour ou quelqu'un veut en envoyer une, le frein soit deja la. Une consigne
-- dans un workflow ne serait pas un verrou : Mistral a deja ignore une
-- « REGLE ABSOLUE ».

-- ---- Qui ne veut plus rien recevoir.
create table if not exists public.relances_stop (
  boutique   text        not null references public.boutiques(slug) on update cascade on delete cascade,
  telephone  text        not null,   -- normalise 225XXXXXXXXXX
  motif      text,                   -- 'stop_client' | 'manuel'
  cree_le    timestamptz not null default now(),
  primary key (boutique, telephone)
);

comment on table public.relances_stop is
  'Numeros qui ont demande a ne plus etre sollicites. Ne bloque QUE les relances : un client qui commande recoit toujours sa confirmation, il a demande a ne plus etre demarche, pas a ne plus etre servi.';

-- ---- Ce qui a deja ete envoye, et qui sert de compteur.
create table if not exists public.relances_envoyees (
  id         uuid        primary key default gen_random_uuid(),
  boutique   text        not null references public.boutiques(slug) on update cascade on delete cascade,
  telephone  text        not null,
  canal      text        not null default 'whatsapp',
  motif      text,
  envoye_le  timestamptz not null default now()
);

create index if not exists relances_envoyees_client_idx
  on public.relances_envoyees (boutique, telephone, envoye_le desc);
create index if not exists relances_envoyees_jour_idx
  on public.relances_envoyees (boutique, envoye_le desc);

-- ---- Personne ne lit ni n'ecrit ces tables depuis le navigateur.
alter table public.relances_stop     enable row level security;
alter table public.relances_envoyees enable row level security;

-- Le marchand voit ce qui concerne SA boutique, et rien d'autre.
drop policy if exists relances_stop_lecture_marchand on public.relances_stop;
create policy relances_stop_lecture_marchand on public.relances_stop
  for select to authenticated
  using (exists (select 1 from public.boutiques b where b.slug = relances_stop.boutique and b.user_id = auth.uid()));

drop policy if exists relances_envoyees_lecture_marchand on public.relances_envoyees;
create policy relances_envoyees_lecture_marchand on public.relances_envoyees
  for select to authenticated
  using (exists (select 1 from public.boutiques b where b.slug = relances_envoyees.boutique and b.user_id = auth.uid()));

-- ---- LA PORTE. Elle decide et reserve dans le meme mouvement.
--
-- La reservation precede l'envoi, jamais l'inverse : un reessai autour d'un
-- envoi le duplique, et un client a deja recu trois fois le meme message.
-- Une relance reservee puis non partie ne coute rien ; une relance partie deux
-- fois coute la confiance du client.
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
end
$$;

-- SECURITY DEFINER est ouvert a anon PAR DEFAUT. Sans ces revocations, un
-- visiteur de la vitrine pourrait bruler le quota d'un marchand.
revoke all on function public.reserver_relance(text, text, text, integer, integer) from public;
revoke all on function public.reserver_relance(text, text, text, integer, integer) from anon;
revoke all on function public.reserver_relance(text, text, text, integer, integer) from authenticated;
grant execute on function public.reserver_relance(text, text, text, integer, integer) to service_role;
