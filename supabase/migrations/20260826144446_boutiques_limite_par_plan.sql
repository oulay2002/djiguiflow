-- « PLUSIEURS BOUTIQUES SUR UN MEME COMPTE » ETAIT VENDU ET N'EXISTAIT PAS.
--
-- La page de tarifs l'annonce comme un avantage Premium. Aucune notion de
-- limite n'existait nulle part : un compte d'essai pouvait en creer autant
-- qu'il voulait. Premium vendait donc un avantage qu'il ne procurait pas.
--
-- Trouve le 26 aout 2026, en relisant chaque promesse de la grille contre le
-- code. Aucun marchand reel n'etant en production, poser la limite maintenant
-- ne retire rien a personne — les trois comptes existants ont une boutique
-- chacun. C'est le dernier moment ou ce geste est gratuit.
--
-- LE VERROU EST EN BASE, PAS DANS L'ECRAN.
--
-- La creation part du navigateur, protegee par RLS : une garde posee dans la
-- page se contournerait en appelant l'API directement. Le declencheur, lui,
-- vaut pour tous les chemins — navigateur, API, script, assistante. C'est la
-- meme regle que partout ici : la vitrine affiche, le SERVEUR decide.
--
-- LA PREMIERE BOUTIQUE PASSE TOUJOURS. Sans cette ligne, un nouvel inscrit ne
-- pourrait rien creer du tout — le verrou aurait ferme la porte d'entree.
--
-- ET LES BANCS D'ESSAI CONTINUENT DE PASSER : ils provisionnent leur boutique
-- jetable sous un `user_id` NEUF a chaque execution, donc toujours la premiere
-- de ce compte. Verifie avant d'ecrire ce declencheur ; un verrou qui casse les
-- bancs se fait desactiver, et on perd les deux.
--
-- Eprouve dans les deux sens sur un compte reel, puis integralement annule :
-- seconde boutique REFUSEE hors Premium, ACCEPTEE avec Premium.

create or replace function public.limiter_boutiques_par_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  deja integer;
  plan text;
begin
  select count(*) into deja from boutiques where user_id = new.user_id;

  -- La premiere boutique d'un compte passe toujours.
  if deja = 0 then
    return new;
  end if;

  select plan_key into plan from subscriptions where user_id = new.user_id limit 1;

  if coalesce(plan, '') = 'premium' then
    return new;
  end if;

  raise exception
    'Plusieurs boutiques sur un meme compte sont reservees au forfait Premium.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists boutiques_limite_par_plan on boutiques;

create trigger boutiques_limite_par_plan
  before insert on boutiques
  for each row
  execute function public.limiter_boutiques_par_plan();

revoke all on function public.limiter_boutiques_par_plan() from public;
