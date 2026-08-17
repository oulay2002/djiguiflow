-- Un plafond journalier PARTAGE pour les points d'entree publics et couteux.
--
-- Le point d'entree de l'assistant IA (`/api/assistant`) appelle Mistral sans
-- authentification ni plafond : une boucle depuis n'importe ou consomme le
-- budget du projet. Un compteur en memoire de processus ne suffit pas — Vercel
-- reutilise ses instances mais en cree d'autres sous charge, et chacune
-- repartirait de zero. Le plafond qui protege reellement la depense doit donc
-- etre partage, donc en base.
--
-- Table generique volontairement : `cle` permet de plafonner d'autres appels
-- couteux plus tard sans nouvelle migration. Une ligne par cle et par jour,
-- donc une croissance negligeable.
create table if not exists public.compteurs_journaliers (
  cle text not null,
  jour date not null,
  valeur integer not null default 0,
  constraint compteurs_journaliers_pkey primary key (cle, jour),
  constraint compteurs_journaliers_valeur_positive check (valeur >= 0)
);

comment on table public.compteurs_journaliers is
  'Compteurs partages par cle et par jour, pour plafonner les points d entree publics couteux. Ecrit uniquement par service_role via incrementer_compteur().';

-- RLS active SANS AUCUNE POLITIQUE : personne n'y accede par l'API REST.
-- `service_role` contourne RLS, ce qui suffit — la table n'a pas a etre lisible
-- par un marchand, et encore moins par un visiteur.
alter table public.compteurs_journaliers enable row level security;

revoke all on table public.compteurs_journaliers from anon, authenticated;

/**
 * Incremente et rend le verdict, en UNE SEULE operation atomique.
 *
 * Un `select` puis un `update` laisserait deux requetes simultanees lire la
 * meme valeur et depasser le plafond — exactement le cas qu'un plafond doit
 * empecher. `insert ... on conflict do update ... returning` ne laisse pas
 * cette fenetre.
 *
 * On incremente MEME au-dela du plafond : le compteur dit alors combien de
 * tentatives ont ete refusees, ce qui est l'information qu'on voudra en cas
 * d'abus. La valeur rendue permet de le journaliser.
 */
create or replace function public.incrementer_compteur(p_cle text, p_plafond integer)
returns table (valeur integer, autorise boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  -- Le jour se calcule dans le fuseau des marchands, pas en UTC : un plafond
  -- qui se reinitialise a 00h00 UTC coupe en pleine soiree a Abidjan.
  v_jour date := (now() at time zone 'Africa/Abidjan')::date;
  v_valeur integer;
begin
  insert into public.compteurs_journaliers as c (cle, jour, valeur)
  values (p_cle, v_jour, 1)
  on conflict (cle, jour) do update
    set valeur = c.valeur + 1
  returning c.valeur into v_valeur;

  return query select v_valeur, v_valeur <= p_plafond;
end;
$function$;

-- SECURITY DEFINER ne restreint rien par lui-meme : sans ce revoke, tout
-- visiteur de la vitrine pourrait appeler la fonction et gonfler le compteur
-- jusqu'a fermer le service pour tout le monde.
revoke execute on function public.incrementer_compteur(text, integer) from public, anon, authenticated;
