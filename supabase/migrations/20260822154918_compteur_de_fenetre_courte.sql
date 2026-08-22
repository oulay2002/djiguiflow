-- Un compteur PARTAGE sur une fenetre courte.
--
-- POURQUOI. `rafaleDepassee` compte EN MEMOIRE DU PROCESSUS. Vercel repartit
-- les appels sur plusieurs instances : le 22 aout 2026, le banc multi-marchand
-- a envoye sept commandes de suite en production sans obtenir un seul refus,
-- puis a obtenu le refus au troisieme appel au passage suivant. Le frein n'est
-- pas casse, il est NON CONCLUANT — il depend de l'instance qui recoit l'appel.
--
-- `limiteur.ts` le disait deja : « elle ne voit qu'une instance : c'est un
-- plancher, pas un plafond ». Ce qui bornait reellement le degat etait le
-- plafond du JOUR — 300 commandes par boutique. Trois cents commandes suffisent
-- a vider n'importe quel stock.
--
-- POURQUOI PAS LA TABLE DU JOUR. On aurait pu glisser la fenetre dans la cle de
-- `incrementer_compteur` et n'ecrire aucune migration. Mais
-- `compteurs_journaliers` n'a AUCUNE PURGE : elle grossit sans borne. Avec une
-- ligne par fenetre de dix minutes et par boutique, elle aurait grossi cent
-- quarante-quatre fois plus vite. On n'herite pas d'un defaut pour economiser
-- une migration.
--
-- FENETRE FIXE, PAS GLISSANTE. Une fenetre fixe autorise au pire deux fois le
-- plafond a cheval sur deux seaux. Une fenetre glissante demanderait de garder
-- chaque appel plutot qu'un compteur, donc mille fois plus de lignes pour un
-- gain qui ne change pas l'ordre de grandeur du degat.
create table if not exists public.compteurs_fenetre (
  cle     text        not null,
  fenetre timestamptz not null,
  valeur  integer     not null default 0,
  primary key (cle, fenetre)
);

comment on table public.compteurs_fenetre is
  'Compteurs partages sur une fenetre courte, pour les freins qui doivent tenir a travers plusieurs instances. Se purge seule : voir reserver_fenetre.';

-- L'index sert la purge, qui balaye par date et non par cle.
create index if not exists compteurs_fenetre_purge_idx
  on public.compteurs_fenetre (fenetre);

-- Personne ne lit cette table depuis le navigateur : c'est de l'exploitation.
alter table public.compteurs_fenetre enable row level security;

/**
 * Compte un appel dans sa fenetre, et dit s'il est autorise.
 *
 * ELLE SE PURGE A CHAQUE APPEL, et c'est volontaire : la table ne doit jamais
 * garder plus d'une heure de seaux. Les deux `delete` portent sur un index et
 * ne trouvent rien en regime etabli — leur cout est celui d'un parcours
 * d'index vide. C'est le prix a payer pour qu'aucune tache planifiee ne soit
 * necessaire, donc pour qu'aucune purge ne puisse etre oubliee.
 *
 * La seconde purge borne `compteurs_journaliers`, qui n'en avait aucune et
 * grossissait sans fin depuis sa creation. Sept jours suffisent largement a un
 * plafond quotidien.
 */
create or replace function public.reserver_fenetre(
  p_cle      text,
  p_plafond  integer,
  p_secondes integer default 600
) returns table(valeur integer, autorise boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fenetre timestamptz;
  v_valeur  integer;
begin
  if coalesce(trim(p_cle), '') = '' or p_plafond is null or p_plafond < 1 then
    -- Sans cle ni plafond utilisable, on REFUSE. Un frein qui s'ouvre quand on
    -- l'appelle mal n'est pas un frein.
    return query select 0, false;
    return;
  end if;

  -- Le seau : l'instant arrondi au debut de sa fenetre. `to_timestamp` d'un
  -- quotient entier donne un bord stable, identique sur toutes les instances.
  v_fenetre := to_timestamp(
    floor(extract(epoch from now()) / greatest(1, p_secondes)) * greatest(1, p_secondes)
  );

  insert into public.compteurs_fenetre as c (cle, fenetre, valeur)
  values (p_cle, v_fenetre, 1)
  on conflict (cle, fenetre) do update
    set valeur = c.valeur + 1
  returning c.valeur into v_valeur;

  delete from public.compteurs_fenetre where fenetre < now() - interval '1 hour';
  delete from public.compteurs_journaliers where jour < (now() at time zone 'Africa/Abidjan')::date - 7;

  return query select v_valeur, v_valeur <= p_plafond;
end;
$function$;

-- SECURITY DEFINER EST OUVERT A anon PAR DEFAUT. Sans ces revocations, un
-- visiteur de la vitrine pourrait bruler le compteur d'un marchand — et donc
-- lui fermer sa propre prise de commande.
revoke all on function public.reserver_fenetre(text, integer, integer) from public;
revoke all on function public.reserver_fenetre(text, integer, integer) from anon;
revoke all on function public.reserver_fenetre(text, integer, integer) from authenticated;
grant execute on function public.reserver_fenetre(text, integer, integer) to service_role;
