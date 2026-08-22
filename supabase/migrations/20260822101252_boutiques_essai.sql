-- UNE BOUTIQUE D'ESSAI NE REVEILLE PERSONNE.
--
-- Tester la chaine de bout en bout en production a toujours eu un cout : la
-- commande part chez de VRAIS livreurs. La consigne etait donc « neutraliser
-- les deux noeuds de notification avant tout test » — un geste manuel, a
-- refaire et a defaire, qu'on oublie une fois sur deux.
--
-- Ce drapeau le rend inutile. Une boutique marquee `essai` cree ses commandes
-- normalement — meme code, memes controles, memes ecritures — mais n'appelle
-- pas le webhook qui lance le dispatch. Le test reste FIDELE la ou il compte
-- (la prise de commande) et muet la ou il derangerait.
--
-- Sans cela, le script de test multi-marchand produirait une alerte technique a
-- chaque execution, et une veille qu'on bruite est une veille qu'on cesse de
-- lire.
alter table public.boutiques
  add column if not exists essai boolean not null default false;

comment on column public.boutiques.essai is
  'Boutique de test : ses commandes ne declenchent pas le dispatch livreurs. Faux par defaut — une vraie boutique ne devient jamais un banc d essai par accident.';
